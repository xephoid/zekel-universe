// Contract tests for EngineClient against a REAL running engine over HTTP.
//
// These do not run in a normal local `pnpm test`. They run only when
// ENGINE_URL points at a live engine (for example the one docker compose
// brings up in CI), e.g.:
//
//   ENGINE_URL=http://localhost:8787/mcp ENGINE_TOKEN=dev-token \
//     pnpm --filter @universe/engine-client test
//
// The test exercises the round trip Universe depends on: list games, create a
// session with one digital human seat plus one AI seat, read state, read
// legal moves. Argument shapes match the engine's tool input schemas
// (zekel repo, src/mcp/schemas.ts): game_id, players[] with
// player_id/kind/name/difficulty/table, and session_id/player_id on reads.

import { describe, it, expect, afterAll } from 'vitest';
import { EngineClient } from '../index.js';

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

  it('lists games with ids', async () => {
    const result = await client!.listGames();
    expect(Array.isArray(result.games)).toBe(true);
    expect(result.games.length).toBeGreaterThan(0);
    for (const game of result.games) {
      expect(typeof game.id).toBe('string');
      expect(game.id.length).toBeGreaterThan(0);
    }
  });

  it('creates a session with a digital human seat and an AI seat, then reads state and legal moves', async () => {
    const { games } = await client!.listGames();

    // Prefer a two-player game from the catalog so the seat layout below is
    // always legal; fall back to the first game if none advertises counts.
    const game =
      games.find((g) => !g.player_counts || g.player_counts.includes(2)) ?? games[0]!;
    expect(game, 'engine catalog is empty').toBeTruthy();

    const session = await client!.createSession({
      gameId: game.id,
      seats: [
        { kind: 'human', name: 'Host', table: 'digital' },
        { kind: 'ai', name: 'Bot', difficulty: 'easy' },
      ],
    });
    expect(typeof session.session_id).toBe('string');
    expect(session.session_id.length).toBeGreaterThan(0);

    const hostToken = session.host_token;

    const state = await client!.getState(session.session_id, 'p1', hostToken);
    expect(state).toBeTypeOf('object');
    expect('error' in state && state.error).toBeFalsy();

    // Legal moves come back for the host seat (p1 on the wire, the first
    // player in the seats array above). Contract: the call succeeds and the
    // engine answers with legal moves or a move menu at the start of a game.
    const moves = await client!.getLegalMoves(session.session_id, 'p1', hostToken);
    const leaves = moves.legal_moves ?? moves.moves ?? [];
    expect(
      leaves.length > 0 || typeof moves.move_menu === 'string',
      'expected legal moves or a move menu at the start of a game',
    ).toBe(true);
  });
});
