// Contract tests for EngineClient against a REAL running engine over HTTP.
//
// These do not run in a normal local `pnpm test`. They run only when
// ENGINE_URL points at a live engine (for example the one docker compose
// brings up in CI), e.g.:
//
//   ENGINE_URL=http://localhost:8787/mcp ENGINE_TOKEN=dev-token \
//     pnpm --filter @universe/engine-client test
//
// The round trip Universe depends on: list games (real GameMetadata shape),
// get_rules with reference_data, create a session with a DIGITAL human seat
// plus an AI seat, read state (view spread at top level + next_step object),
// read legal moves, apply a move, run an AI turn with per-seat snapshots,
// undo. Errors surface as EngineError { errorCode, message, details } where
// recoverable move errors carry next_step and, when it is the player's turn,
// your_legal_moves under details.recovery.

import { describe, it, expect, afterAll } from 'vitest';
import { EngineClient, EngineError } from '../index.js';

const ENGINE_URL = process.env.ENGINE_URL;
const ENGINE_TOKEN = process.env.ENGINE_TOKEN ?? '';

const runLive = !!ENGINE_URL;
const client = runLive
  ? new EngineClient({ url: ENGINE_URL!, bearerToken: ENGINE_TOKEN })
  : null;

async function pickGame() {
  const { games } = await client!.listGames();
  return (
    games.find((g) => g.game_id === 'fractured-fist') ??
    games.find((g) => g.min_players <= 2 && g.max_players >= 2 && g.supports_ai) ??
    games[0]!
  );
}

describe.skipIf(!runLive)('engine-client contract (live engine)', () => {
  afterAll(async () => {
    await client?.close();
  });

  it('lists games with the real GameMetadata shape', async () => {
    const result = await client!.listGames();
    expect(Array.isArray(result.games)).toBe(true);
    expect(result.games.length).toBeGreaterThan(0);
    for (const game of result.games) {
      expect(typeof game.game_id).toBe('string');
      expect(game.game_id.length).toBeGreaterThan(0);
      expect(typeof game.name).toBe('string');
      expect(typeof game.min_players).toBe('number');
      expect(typeof game.max_players).toBe('number');
      expect(typeof game.supports_ai).toBe('boolean');
      expect(typeof game.has_hidden_information).toBe('boolean');
      expect(game.options_schema).toBeTypeOf('object');
    }
  });

  it('get_rules returns rules text plus reference_data and move_schema', async () => {
    const game = await pickGame();
    const rules = await client!.getRules(game.game_id);
    expect(rules.game_id).toBe(game.game_id);
    expect(typeof rules.rules).toBe('string');
    if (game.game_id === 'fractured-fist') {
      const rd = rules.reference_data as { cards?: unknown[]; max_missteps?: number };
      expect(Array.isArray(rd.cards)).toBe(true);
      expect(typeof rd.max_missteps).toBe('number');
      expect(rules.move_schema).toBeTypeOf('object');
    }
  });

  it('creates a session with a digital seat, reads state and legal moves', async () => {
    const game = await pickGame();
    const session = await client!.createSession({
      gameId: game.game_id,
      seats: [
        { playerId: 'p1', kind: 'human', name: 'Host', table: 'digital' },
        { playerId: 'p2', kind: 'ai', name: 'Bot', difficulty: 'easy' },
      ],
    });
    expect(typeof session.session_id).toBe('string');
    expect(session.session_id.length).toBeGreaterThan(0);
    // The engine echoes the table mode it recorded; a digital seat must
    // come back digital or the server holds no hand for the player.
    const p1 = session.players_recorded?.find((p) => p.player_id === 'p1');
    expect(p1?.table).toBe('digital');
    if (session.next_step !== undefined) {
      expect(['game_over', 'ai_to_move', 'human_to_move']).toContain(session.next_step.status);
    }

    // get_state: player view fields spread at top level, next_step object.
    const state = await client!.getState(session.session_id, 'p1');
    expect(state).toBeTypeOf('object');
    expect(state.next_step).toHaveProperty('status');
    expect(state.next_step).toHaveProperty('active_player_id');
    expect(state.next_step).toHaveProperty('instruction');

    const moves = await client!.getLegalMoves(session.session_id, 'p1');
    expect(Array.isArray(moves.legal_moves)).toBe(true);
    for (const m of moves.legal_moves) {
      expect(m).toHaveProperty('move');
      expect(typeof m.move_id).toBe('string');
    }
    if (state.next_step?.status === 'human_to_move') {
      expect(moves.legal_moves.length).toBeGreaterThan(0);
      expect(moves.move_menu?.entries.length).toBeGreaterThan(0);
    }
  });

  it('applies a move by id, runs the AI turn with per-seat snapshots, and undoes', async () => {
    const game = await pickGame();
    const session = await client!.createSession({
      gameId: game.game_id,
      seats: [
        { playerId: 'p1', kind: 'human', table: 'digital' },
        { playerId: 'p2', kind: 'ai', difficulty: 'easy' },
      ],
      hostPlayerId: 'p1',
    });
    // Drive the human turn to the AI with whatever the engine offers.
    let step = session.next_step;
    let guard = 0;
    while (step?.status === 'human_to_move' && guard++ < 30) {
      const legal = await client!.getLegalMoves(session.session_id, 'p1');
      const pick =
        legal.legal_moves.find((m) => ['end_turn', 'pass', 'advance_phase', 'skip_refine'].includes(String(m.move['type']))) ??
        legal.legal_moves[0]!;
      const applied = await client!.applyMove(session.session_id, 'p1', undefined, { moveId: pick.move_id! });
      expect(applied.applied).toBe(true);
      expect(typeof applied.state_summary).toBe('string');
      step = applied.next_step;
    }
    if (step?.status === 'ai_to_move') {
      const ai = await client!.runAiTurn(session.session_id, step.active_player_id!);
      expect(ai.moves.length).toBeGreaterThan(0);
      for (const m of ai.moves) {
        expect(typeof m.state_summary).toBe('string');
        // One snapshot per digital human seat, keyed by player id.
        expect(m.player_views).toBeTypeOf('object');
        expect(m.player_views).toHaveProperty('p1');
      }
      expect(ai.next_step).toHaveProperty('status');
      const undone = await client!.undo(session.session_id);
      expect(undone.undone).toBe(true);
    }
  });

  it('surfaces a rule rejection as EngineError with a code and recovery', async () => {
    const game = await pickGame();
    const session = await client!.createSession({
      gameId: game.game_id,
      seats: [
        { playerId: 'p1', kind: 'human', table: 'digital' },
        { playerId: 'p2', kind: 'ai', difficulty: 'easy' },
      ],
    });
    try {
      await client!.applyMove(session.session_id, 'p1', undefined, {
        move: { type: '__universe_contract_bogus__' },
      });
      expect.unreachable('bogus move must be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(EngineError);
      const e = err as EngineError;
      expect(typeof e.errorCode).toBe('string');
      expect(e.errorCode.length).toBeGreaterThan(0);
      expect(e.isRuleRejection).toBe(true);
      expect(e.isTransportFault).toBe(false);
      // The recovery block rides beside details on the engine; the client
      // folds it in so next_step is reachable here.
      expect(e.nextStep).toHaveProperty('status');
    }
  });
});

describe('engine-client without an engine', () => {
  it('reports an unreachable engine as a transport fault and retries next call', async () => {
    const dead = new EngineClient({ url: 'http://127.0.0.1:9/mcp', bearerToken: 'x' });
    for (let i = 0; i < 2; i++) {
      try {
        await dead.listGames();
        expect.unreachable('must fail');
      } catch (err) {
        expect(err).toBeInstanceOf(EngineError);
        const e = err as EngineError;
        expect(e.isTransportFault).toBe(true);
        expect(e.isRuleRejection).toBe(false);
      }
    }
    await dead.close();
  });
});
