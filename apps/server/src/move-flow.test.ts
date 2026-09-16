// Integration test of the move flow against the scripted fake engine:
// opening state, move, AI turn, legal moves on the last event only,
// rejections vs faults, game over, undo permission, and by-turns
// notifications.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { FakeEngine } from './test-engine.js';
import { TableService } from './tables/service.js';
import { Realtime } from './realtime.js';
import { ConsoleMailer } from './email.js';
import type { Principal } from './identity.js';

const SECRET = 'dev-secret-key-for-tests';

describe('move flow integration', () => {
  let database: DatabaseClient;
  let db: Kysely<DB>;
  let engine: FakeEngine;
  let tableService: TableService;
  let realtime: Realtime;
  const host: Principal = { kind: 'user', userId: 'user-host' };
  const friend: Principal = { kind: 'user', userId: 'user-friend' };

  beforeEach(async () => {
    database = await createDatabase(':memory:');
    db = database.db;
    engine = new FakeEngine();
    tableService = new TableService(db, engine, SECRET);
    realtime = new Realtime(db, engine, tableService, new ConsoleMailer());
    for (const id of ['user-host', 'user-friend', 'user-other']) {
      await db.insertInto('users').values({ id, display_name: id, avatar_url: null, bio: null, created_at: 'now' }).execute();
    }
    await db.insertInto('games').values({
      engine_game_id: 'fractured-fist', name: 'Fractured Fist', designer_name: 'Zekel Games', player_count: '2',
      min_players: 2, max_players: 2, supports_ai: 1, play_time: '', tags: '[]', cover_image: null,
      description: '', rules_url: null, visibility: 'public',
    }).execute();
  });

  afterEach(async () => {
    await database.close();
  });

  async function createVsAiTable() {
    const result = await tableService.createTable(host, {
      gameId: 'fractured-fist',
      mode: 'live',
      seatSpecs: [{ kind: 'human' }, { kind: 'ai', aiDifficulty: 'easy' }],
      hostPosition: 0,
      options: { loadout: ['attack'] },
    });
    return result.tableId;
  }

  it('creates a vs-AI table playing immediately with an opening event that carries legal moves', async () => {
    const tableId = await createVsAiTable();
    const table = (await tableService.getTable(tableId))!;
    expect(table.status).toBe('playing');
    expect(table.engineSessionId).toBe('session-1');
    expect(table.encryptedHostToken).toBeNull(); // solo-vs-AI issues no join block
    expect(engine.createdWith).toEqual([
      { kind: 'human', table: 'digital', difficulty: undefined },
      { kind: 'ai', table: undefined, difficulty: 'easy' },
    ]);
    expect(engine.lastOptions).toEqual({ loadout: ['attack'] });
    const seats = await tableService.getSeats(tableId);
    expect(seats[0]!.enginePlayerId).toBe('p1');

    // The human is up first: the setup event carries their view and menu.
    const events = await realtime.eventsAfter(tableId, 0);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('setup');
    const mine = events[0]!.payloads['0']!;
    expect(mine.view).toMatchObject({ player: 'p1' });
    expect(mine.legalMoves!.length).toBeGreaterThan(0);
    expect(mine.yourTurn).toBe(true);
    expect(mine.briefing?.sections[0]?.id).toBe('first');
    expect(events[0]!.nextActorPosition).toBe(0);
    expect(table.nextActorPosition ?? (await tableService.getTable(tableId))!.nextActorPosition).toBe(0);
  });

  it('runs move → AI turn → events in order, legal moves only on the last', async () => {
    const tableId = await createVsAiTable();
    const broadcast: Array<{ kind: string; seq: number }> = [];
    realtime.onBroadcast((_t, e) => broadcast.push({ kind: e.kind, seq: e.seq }));

    const result = await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    const events = await realtime.eventsAfter(tableId, 1);
    expect(events.map((e) => e.kind)).toEqual(['move', 'ai_move', 'ai_move']);
    expect(events.map((e) => e.seq)).toEqual([2, 3, 4]);
    expect(result.lastSeq).toBe(4);
    expect(broadcast.map((b) => b.kind)).toEqual(['move', 'ai_move', 'ai_move']);

    // The move event and the first AI move carry no legal moves; the last
    // AI move hands the turn back with the menu.
    expect(events[0]!.payloads['0']!.legalMoves).toEqual([]);
    expect(events[1]!.payloads['0']!.legalMoves).toEqual([]);
    expect(events[2]!.payloads['0']!.legalMoves!.length).toBeGreaterThan(0);
    expect(events[2]!.payloads['0']!.yourTurn).toBe(true);
    expect(events[2]!.nextActorPosition).toBe(0);
    // AI move views came from the engine's per-seat snapshots.
    expect(events[1]!.payloads['0']!.view).toMatchObject({ player: 'p1', moves: 2 });
    // The briefing attached to the human's move rides on that move's payload.
    expect(events[0]!.payloads['0']!.briefing?.sections[0]?.id).toBe('pass');

    expect(engine.applied).toEqual([{ session: 'session-1', player: 'p1', move: { type: 'pass' } }]);
    expect(engine.aiTurns).toBe(1);
  });

  it('opens with an AI turn when the engine says the AI is first', async () => {
    engine.aiOpens = true;
    const tableId = await createVsAiTable();
    const events = await realtime.eventsAfter(tableId, 0);
    expect(events.map((e) => e.kind)).toEqual(['setup', 'ai_move', 'ai_move']);
    expect(events[2]!.payloads['0']!.legalMoves!.length).toBeGreaterThan(0);
  });

  it('rejects a move from a foreign principal without touching the engine', async () => {
    const tableId = await createVsAiTable();
    const stranger: Principal = { kind: 'user', userId: 'user-other' };
    await expect(realtime.handleMove(stranger, tableId, 0, { type: 'pass' }))
      .rejects.toMatchObject({ code: 'not_your_seat' });
    expect(engine.applied).toHaveLength(0);
  });

  it('returns reason, lesson and legal moves on a rule rejection and writes no event', async () => {
    const tableId = await createVsAiTable();
    await expect(realtime.handleMove(host, tableId, 0, { type: 'illegal' }))
      .rejects.toMatchObject({
        code: 'move_rejected', reason: 'Not now.', lesson: 'Play happens clockwise.',
      });
    const err = await realtime.handleMove(host, tableId, 0, { type: 'illegal' }).catch((e) => e);
    expect(err.legalMoves.length).toBeGreaterThan(0);
    expect(await realtime.eventsAfter(tableId, 1)).toHaveLength(0);
  });

  it('reports a lost engine connection as a server fault, never a rule', async () => {
    const tableId = await createVsAiTable();
    await expect(realtime.handleMove(host, tableId, 0, { type: 'lost' }))
      .rejects.toMatchObject({ code: 'engine_unavailable' });
    await expect(realtime.handleMove(host, tableId, 0, { type: 'crash' }))
      .rejects.toMatchObject({ code: 'engine_error' });
    expect(await realtime.eventsAfter(tableId, 1)).toHaveLength(0);
  });

  it('marks the table finished and writes the result on the final event', async () => {
    const tableId = await createVsAiTable();
    await realtime.handleMove(host, tableId, 0, { type: 'win' });
    const table = (await tableService.getTable(tableId))!;
    expect(table.status).toBe('finished');
    expect(table.finishedAt).toBeTruthy();
    expect(table.result?.winners).toEqual(['p1']);
    const events = await realtime.eventsAfter(tableId, 0);
    const last = events[events.length - 1]!;
    expect(last.gameOver?.summary).toBe('p1 wins 5 to 3.');
    expect(last.summary).toContain('p1 wins 5 to 3.');
    expect(Object.keys(last.payloads)).toContain('0');
    const notes = await db.selectFrom('notifications').selectAll().where('table_id', '=', tableId).execute();
    expect(notes.map((n) => n.kind)).toEqual(['table_finished']);
    await expect(realtime.handleMove(host, tableId, 0, { type: 'pass' }))
      .rejects.toMatchObject({ code: 'not_playing' });
  });

  it('finishes when the AI turn ends the game', async () => {
    engine.aiWins = true;
    const tableId = await createVsAiTable();
    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    expect((await tableService.getTable(tableId))!.status).toBe('finished');
    const events = await realtime.eventsAfter(tableId, 0);
    expect(events[events.length - 1]!.gameOver).not.toBeNull();
  });

  it('undo: only the last human mover may take it back, and the browsers get a rewind event', async () => {
    const { tableId } = await tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'live',
      seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    });
    await tableService.joinTable(friend, tableId);
    await tableService.setReady(friend, tableId, true);
    await tableService.startTable(host, tableId);

    await expect(realtime.handleUndo(host, tableId)).rejects.toMatchObject({ code: 'nothing_to_undo' });
    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    // The friend did not make the last move.
    await expect(realtime.handleUndo(friend, tableId)).rejects.toMatchObject({ code: 'not_your_move' });
    // The host did.
    const { seq } = await realtime.handleUndo(host, tableId);
    const events = await realtime.eventsAfter(tableId, 0);
    const undo = events.find((e) => e.seq === seq)!;
    expect(undo.kind).toBe('undo');
    expect(undo.rewindToSeq).toBe(1);
    expect(undo.payloads['0']!.legalMoves!.length).toBeGreaterThan(0);
    expect(undo.payloads['1']!.legalMoves).toEqual([]);
  });

  it('undo the engine refuses is reported as unavailable', async () => {
    engine.refuseUndo = true;
    const tableId = await createVsAiTable();
    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    await expect(realtime.handleUndo(host, tableId)).rejects.toMatchObject({ code: 'undo_unavailable' });
  });

  it('friends table: join, ready, host start, both seat payloads stored keyed by position', async () => {
    const { tableId } = await tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'live',
      seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    });
    expect((await tableService.getTable(tableId))!.status).toBe('lobby');
    const { seatPosition } = await tableService.joinTable(friend, tableId);
    expect(seatPosition).toBe(1);
    await expect(tableService.startTable(host, tableId)).rejects.toMatchObject({ code: 'not_ready' });
    await tableService.setReady(friend, tableId, true);
    await expect(tableService.startTable(friend, tableId)).rejects.toMatchObject({ code: 'not_host' });
    await tableService.startTable(host, tableId);
    expect((await tableService.getTable(tableId))!.encryptedHostToken).toBeTruthy();

    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    const events = await realtime.eventsAfter(tableId, 0);
    expect(events.map((e) => e.kind)).toEqual(['setup', 'move']);
    const stored = events[1]!;
    expect(stored.payloads['0']!.view).toMatchObject({ player: 'p1' });
    expect(stored.payloads['1']!.view).toMatchObject({ player: 'p2' });
    expect(stored.payloads['1']!.yourTurn).toBe(true);
    expect(stored.nextActorPosition).toBe(1);
  });

  it('by turns: the table starts itself when full and notifies a disconnected next player', async () => {
    const { tableId, status } = await tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'turns',
      seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    });
    expect(status).toBe('lobby');
    await tableService.joinTable(friend, tableId);
    expect((await tableService.getTable(tableId))!.status).toBe('playing');
    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    // The host was up first and not connected either, so both got a nudge.
    const notes = await db.selectFrom('notifications').selectAll().where('table_id', '=', tableId).orderBy('created_at').execute();
    expect(notes.map((n) => [n.kind, n.user_id])).toEqual([['your_turn', 'user-host'], ['your_turn', 'user-friend']]);
  });

  it('enforces the brief: guests cannot host friend tables, AI-only is live, turns needs friends', async () => {
    const guest: Principal = { kind: 'guest', guestId: 'g1' };
    await db.insertInto('guests').values({ id: 'g1', token_hash: 'x', display_name: 'G', created_at: 'now', upgraded_to_user_id: null }).execute();
    await expect(tableService.createTable(guest, {
      gameId: 'fractured-fist', mode: 'live', seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    })).rejects.toMatchObject({ code: 'guest_cannot_host' });
    await expect(tableService.createTable(guest, {
      gameId: 'fractured-fist', mode: 'turns', seatSpecs: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0,
    })).rejects.toMatchObject({ code: 'ai_only_is_live' });
    await expect(tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'live', seatSpecs: [{ kind: 'human' }], hostPosition: 0,
    })).rejects.toMatchObject({ code: 'bad_seat_count' });
    // A guest may play the AI and may join a friend's table.
    const ok = await tableService.createTable(guest, {
      gameId: 'fractured-fist', mode: 'live', seatSpecs: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0,
    });
    expect(ok.status).toBe('playing');
    const { tableId } = await tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'live', seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    });
    expect((await tableService.joinTable(guest, tableId)).seatPosition).toBe(1);
  });

  it('a failed engine session start leaves the table in the lobby, not stuck', async () => {
    engine.stateFails = true;
    await expect(createVsAiTable()).rejects.toBeTruthy();
    const rows = await db.selectFrom('tables').selectAll().execute();
    expect(rows[0]!.status).toBe('lobby');
  });
});
