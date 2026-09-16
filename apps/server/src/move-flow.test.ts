// Integration test: create a table, make a move, watch the AI turn land, and
// read the event feed back — all against a mock engine client implementing
// the same EngineService interface the real client does.

import { describe, it, expect, beforeEach } from 'vitest';
import type {
  AppliedMove, AiTurnResult, ListGamesResult, SessionInfo,
} from '@universe/engine-client';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { games } from './db/schema.js';
import type { EngineService } from './engine.js';
import { TableService } from './tables/service.js';
import { Realtime } from './realtime.js';
import { NoopEmailSender } from './email.js';
import type { Principal } from './identity.js';

const SECRET = 'dev-secret-key-for-tests';

class MockEngine implements EngineService {
  sessionCounter = 0;
  appliedMoves: Array<{ player: string; move: Record<string, unknown> }> = [];
  aiTurnsRun = 0;
  /** next_step the first applyMove returns. */
  nextStep: string | null = 'ai';
  gameOver = false;
  createdWith: Array<{ kind: string; table?: string }> = [];

  async listGames(): Promise<ListGamesResult> {
    return { games: [{ id: 'fractured-fist', name: 'Fractured Fist', player_counts: [2] }] };
  }
  async getRules(): Promise<Record<string, unknown>> { return {}; }
  async createSession(args: {
    gameId: string;
    seats: Array<{ kind: 'human' | 'ai'; table?: 'physical' | 'digital' }>;
  }): Promise<SessionInfo> {
    this.sessionCounter += 1;
    this.createdWith = args.seats.map((s) => ({ kind: s.kind, table: s.table }));
    return {
      session_id: `session-${this.sessionCounter}`,
      host_token: `host-token-${this.sessionCounter}`,
      seats: args.seats.map((_s, i) => ({ position: i, player_id: `p${i + 1}` })),
    };
  }
  async getState(_sessionId: string, playerId?: string): Promise<Record<string, unknown>> {
    return { player: playerId, hand: [`cards-of-${playerId}`] };
  }
  async getLegalMoves(): Promise<unknown> {
    return { legal_moves: [{ move: { action: 'pass' }, description: 'Pass' }] };
  }
  async applyMove(_s: string, playerId: string, _t: string | undefined, move: Record<string, unknown>): Promise<AppliedMove> {
    this.appliedMoves.push({ player: playerId, move });
    if (move.action === 'illegal') {
      return { ok: false, reason: 'Not your turn.', lesson: 'Play happens clockwise.' };
    }
    return {
      ok: true,
      summary: `${playerId} passes.`,
      player_views: { p1: { hand: ['h0'] }, p2: { hand: ['h1'] } },
      next_step: this.nextStep,
    };
  }
  async runAiTurn(): Promise<AiTurnResult> {
    this.aiTurnsRun += 1;
    return {
      moves: [
        { summary: 'AI draws.', move: { action: 'draw' }, player_views: { p1: { ai: 1 }, p2: { ai: 1 } } },
        { summary: 'AI plays.', move: { action: 'play' }, player_views: { p1: { ai: 2 }, p2: { ai: 2 } } },
      ],
      next_step: null,
    };
  }
  async undo(): Promise<Record<string, unknown>> { return { ok: true }; }
  async isGameOver(): Promise<{ over: boolean }> {
    return { over: this.gameOver };
  }
}

describe('move flow integration', () => {
  let db: DatabaseClient;
  let engine: MockEngine;
  let tableService: TableService;
  let realtime: Realtime;
  const host: Principal = { kind: 'user', userId: 'user-host' };

  beforeEach(() => {
    db = createDatabase(':memory:');
    engine = new MockEngine();
    tableService = new TableService(db, engine, SECRET);
    realtime = new Realtime(db, engine, tableService, new NoopEmailSender());
    db.insert(games).values({ engineGameId: 'fractured-fist', name: 'Fractured Fist' }).run();
  });

  async function createVsAiTable() {
    const result = await tableService.createTable(host, {
      gameId: 'fractured-fist',
      mode: 'live',
      seatSpecs: [{ kind: 'human' }, { kind: 'ai', aiDifficulty: 'normal' }],
      hostPosition: 0,
    });
    return result.tableId;
  }

  it('creates a vs-AI table playing immediately with an engine session', async () => {
    const tableId = await createVsAiTable();
    const table = tableService.getTable(tableId)!;
    expect(table.status).toBe('playing');
    expect(table.engineSessionId).toBe('session-1');
    expect(table.encryptedHostToken).toBeTruthy();
    expect(table.encryptedHostToken).not.toContain('host-token-1');
    // Engine was called with the human seat as digital.
    expect(engine.createdWith).toEqual([
      { kind: 'human', table: 'digital' },
      { kind: 'ai', table: undefined },
    ]);
    const seats = tableService.getSeats(tableId);
    expect(seats).toHaveLength(2);
    expect(seats[0]!.kind).toBe('human');
    expect(seats[0]!.userId).toBe('user-host');
    expect(seats[0]!.enginePlayerId).toBe('p1');
    expect(seats[1]!.kind).toBe('ai');
  });

  it('runs create → move → AI turn → events with sequence numbers', async () => {
    const tableId = await createVsAiTable();
    const broadcast: Array<{ kind: string; seq: number }> = [];
    realtime.onBroadcast((_t: string, e: { kind: string; seq: number }) =>
      broadcast.push({ kind: e.kind, seq: e.seq }));

    const result = await realtime.handleMove(host, tableId, 0, { action: 'pass' });
    expect(result.lastSeq).toBe(1);

    // One move event then two ai_move events, in order.
    const events = realtime.eventsAfter(tableId, 0);
    expect(events.map((e) => e.kind)).toEqual(['move', 'ai_move', 'ai_move']);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(events[1]!.summary).toBe('AI draws.');

    // Events were broadcast in the same order.
    expect(broadcast.map((b) => b.kind)).toEqual(['move', 'ai_move', 'ai_move']);

    // Engine saw the move as seat 0's player id and one AI turn.
    expect(engine.appliedMoves).toEqual([{ player: 'p1', move: { action: 'pass' } }]);
    expect(engine.aiTurnsRun).toBe(1);
    expect(tableService.getTable(tableId)!.status).toBe('playing');
  });

  it('rejects a move from a foreign principal without touching the engine', async () => {
    const tableId = await createVsAiTable();
    const stranger: Principal = { kind: 'user', userId: 'user-other' };
    await expect(realtime.handleMove(stranger, tableId, 0, { action: 'pass' }))
      .rejects.toMatchObject({ code: 'not_your_seat' });
    expect(engine.appliedMoves).toHaveLength(0);
  });

  it('returns reason+lesson on a rejected move and writes no event', async () => {
    const tableId = await createVsAiTable();
    await expect(realtime.handleMove(host, tableId, 0, { action: 'illegal' }))
      .rejects.toMatchObject({
        code: 'move_rejected', reason: 'Not your turn.', lesson: 'Play happens clockwise.',
      });
    expect(realtime.eventsAfter(tableId, 0)).toHaveLength(0);
  });

  it('marks the table finished and writes a system event when the game ends', async () => {
    engine.nextStep = null; // no AI turn after this move
    engine.gameOver = true;
    const tableId = await createVsAiTable();
    await realtime.handleMove(host, tableId, 0, { action: 'pass' });

    const table = tableService.getTable(tableId)!;
    expect(table.status).toBe('finished');
    expect(table.finishedAt).toBeTruthy();
    const events = realtime.eventsAfter(tableId, 0);
    const kinds = events.map((e) => e.kind);
    expect(kinds[kinds.length - 1]).toBe('system');
    expect(events[events.length - 1]!.summary).toContain('game is over');

    // Per-seat views for the finish event were keyed by seat position.
    const views = events[events.length - 1]!.views;
    expect(Object.keys(views)).toContain('0');
  });

  it('friends table: join, ready, host start, both seat views stored keyed by position', async () => {
    const { tableId } = await tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'live',
      seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    });
    const friend: Principal = { kind: 'user', userId: 'user-friend' };
    const { seatPosition } = tableService.joinTable(friend, tableId);
    expect(seatPosition).toBe(1);
    await tableService.setReady(friend, tableId, true);
    await tableService.startTable(host, tableId);

    engine.nextStep = null;
    await realtime.handleMove(host, tableId, 0, { action: 'pass' });
    const events = realtime.eventsAfter(tableId, 0);
    expect(events.length).toBe(1);

    // The stored event holds both views keyed by seat position — the wire
    // layer strips per connection (covered by the socket privacy test).
    const stored = events[0]!;
    expect(stored.views).toHaveProperty('0');
    expect(stored.views).toHaveProperty('1');
    expect(stored.views['0']).toEqual({ hand: ['h0'] });
    expect(stored.views['1']).toEqual({ hand: ['h1'] });
  });
});
