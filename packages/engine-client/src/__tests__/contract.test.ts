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
// create a session with a digital human seat plus an AI seat (players with
// player_id/kind/name/table/difficulty per src/mcp/schemas.ts), read state
// (view spread at top level + next_step object), read legal moves. Errors
// surface as EngineError { error_code, message, details } where details on
// recoverable move errors carries your_legal_moves + rules_briefing.

import { describe, it, expect, afterAll } from 'vitest';
import { EngineClient, EngineError } from '../index.js';

const ENGINE_URL = process.env.ENGINE_URL;
const ENGINE_TOKEN = process.env.ENGINE_TOKEN ?? '';

const runLive = !!ENGINE_URL;
const client = runLive
  ? new EngineClient({ url: ENGINE_URL!, bearerToken: ENGINE_TOKEN })
  : null;

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

  it('get_rules returns rules text plus optional reference_data', async () => {
    const { games } = await client!.listGames();
    const rules = await client!.getRules(games[0]!.game_id);
    expect(rules.game_id).toBe(games[0]!.game_id);
    expect(typeof rules.rules).toBe('string');
  });

  it('creates a session, reads state (spread view + next_step object) and legal moves', async () => {
    const { games } = await client!.listGames();
    const game =
      games.find((g) => g.min_players <= 2 && g.max_players >= 2 && g.supports_ai) ?? games[0]!;

    const session = await client!.createSession({
      gameId: game.game_id,
      seats: [
        { playerId: 'p1', kind: 'human', name: 'Host', table: 'digital' },
        { playerId: 'p2', kind: 'ai', name: 'Bot', difficulty: 'easy' },
      ],
    });
    expect(typeof session.session_id).toBe('string');
    expect(session.session_id.length).toBeGreaterThan(0);
    if (session.next_step !== undefined) {
      expect(['game_over', 'ai_to_move', 'human_to_move']).toContain(session.next_step.status);
    }

    // get_state: player view fields spread at top level, next_step object.
    const state = await client!.getState(session.session_id, 'p1');
    expect(state).toBeTypeOf('object');
    if (state.next_step !== undefined && state.next_step !== null) {
      expect(state.next_step).toHaveProperty('status');
      expect(state.next_step).toHaveProperty('active_player_id');
      expect(state.next_step).toHaveProperty('instruction');
    }

    const moves = await client!.getLegalMoves(session.session_id, 'p1');
    expect(Array.isArray(moves.legal_moves)).toBe(true);
    for (const m of moves.legal_moves) {
      expect(m).toHaveProperty('move');
    }
  });

  it('surfaces a rejected move as EngineError with error_code and recovery details', async () => {
    const { games } = await client!.listGames();
    const game =
      games.find((g) => g.min_players <= 2 && g.max_players >= 2 && g.supports_ai) ?? games[0]!;
    const session = await client!.createSession({
      gameId: game.game_id,
      seats: [
        { playerId: 'p1', kind: 'human', name: 'Host', table: 'digital' },
        { playerId: 'p2', kind: 'ai', difficulty: 'easy' },
      ],
    });
    // A definitely-bogus move must come back as an engine error with a code
    // and message. (Recovery context such as your_legal_moves is best-effort
    // on the engine and did not ride INVALID_MOVE_SHAPE as of 2026-09.)
    try {
      await client!.applyMove(session.session_id, 'p1', undefined, {
        type: '__universe_contract_bogus__',
      });
      expect.unreachable('bogus move must be rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(EngineError);
      const e = err as EngineError;
      expect(typeof e.errorCode).toBe('string');
      expect(e.errorCode.length).toBeGreaterThan(0);
      expect(typeof e.message).toBe('string');
    }
  });
});
