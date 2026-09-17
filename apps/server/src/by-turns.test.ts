// M3, by turns: one notification per absent player and table, the email
// nudge after a delay (once, and only while they are still away and still
// up), notifications answered by opening the table, and a table that a
// restart left between events resuming from the engine's next step.

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
const ORIGIN = 'https://universe.example';
const TEN_MINUTES = 10 * 60 * 1000;

describe('by turns', () => {
  let database: DatabaseClient;
  let db: Kysely<DB>;
  let engine: FakeEngine;
  let tableService: TableService;
  let realtime: Realtime;
  let mailer: ConsoleMailer;
  const host: Principal = { kind: 'user', userId: 'user-host' };
  const friend: Principal = { kind: 'user', userId: 'user-friend' };
  const guest: Principal = { kind: 'guest', guestId: 'guest-1' };

  beforeEach(async () => {
    database = await createDatabase(':memory:');
    db = database.db;
    engine = new FakeEngine();
    mailer = new ConsoleMailer();
    tableService = new TableService(db, engine, SECRET);
    realtime = new Realtime(db, engine, tableService, mailer, { appOrigin: ORIGIN });
    for (const id of ['user-host', 'user-friend']) {
      await db.insertInto('users').values({ id, display_name: id, avatar_url: null, bio: null, created_at: 'now' }).execute();
      await db.insertInto('identities').values({ id: `identity-${id}`, user_id: id, provider: 'email', provider_subject: `${id}@example.com` }).execute();
    }
    await db.insertInto('guests').values({ id: 'guest-1', token_hash: 'hash', display_name: 'A guest', created_at: 'now', upgraded_to_user_id: null }).execute();
    await db.insertInto('games').values({
      engine_game_id: 'fractured-fist', name: 'Fractured Fist', designer_name: 'Zekel Games', player_count: '2',
      min_players: 2, max_players: 2, supports_ai: 1, play_time: '', tags: '[]', cover_image: null,
      description: '', rules_url: null, visibility: 'public',
    }).execute();
  });

  afterEach(async () => {
    await database.close();
  });

  /** A two-human by-turns table; the friend's arrival starts it. */
  async function turnsTable(second: Principal = friend): Promise<string> {
    const { tableId } = await tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'turns', seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    });
    await tableService.joinTable(second, tableId);
    expect((await tableService.getTable(tableId))!.status).toBe('playing');
    return tableId;
  }

  async function notes(tableId: string) {
    return db.selectFrom('notifications').selectAll().where('table_id', '=', tableId).where('kind', '=', 'your_turn')
      .orderBy('created_at').execute();
  }

  it('emails an absent player once the delay has passed, once, with a link to the table', async () => {
    const tableId = await turnsTable();
    // The host opens the table (which answers their own notification) and moves.
    realtime.markConnected(tableId, host);
    await realtime.markNotificationsRead(tableId, host);
    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    const pending = await notes(tableId);
    expect(pending.map((n) => [n.user_id, n.read, n.emailed_at])).toEqual([['user-host', 1, null], ['user-friend', 0, null]]);

    // Not due yet: nothing goes out.
    expect(await realtime.sendDueNudges(TEN_MINUTES)).toBe(0);
    expect(mailer.sent).toHaveLength(0);

    // Due: exactly one email to the friend's sign-in address, with the link.
    expect(await realtime.sendDueNudges(TEN_MINUTES, Date.now() + TEN_MINUTES + 1000)).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('user-friend@example.com');
    expect(mailer.sent[0]!.subject).toBe('Your move in Fractured Fist');
    expect(mailer.sent[0]!.text).toContain(`${ORIGIN}/table/${tableId}`);
    expect((await notes(tableId))[1]!.emailed_at).not.toBeNull();

    // Never twice for the same turn.
    expect(await realtime.sendDueNudges(TEN_MINUTES, Date.now() + 2 * TEN_MINUTES)).toBe(0);
    expect(mailer.sent).toHaveLength(1);
  });

  it('does not email a player who is connected, whose turn has passed, or who has no address', async () => {
    const tableId = await turnsTable();
    realtime.markConnected(tableId, host);
    await realtime.markNotificationsRead(tableId, host);
    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    const later = Date.now() + TEN_MINUTES + 1000;

    // The friend came back before the delay ran out.
    realtime.markConnected(tableId, friend);
    expect(await realtime.sendDueNudges(TEN_MINUTES, later)).toBe(0);

    // They moved on; the host left meanwhile, so the host is the one who is
    // away and up. The friend's old notification never sends.
    realtime.markDisconnected(tableId, host);
    await realtime.handleMove(friend, tableId, 1, { type: 'pass' });
    realtime.markDisconnected(tableId, friend);
    expect(await realtime.sendDueNudges(TEN_MINUTES, later)).toBe(1);
    expect(mailer.sent.map((m) => m.to)).toEqual(['user-host@example.com']);

    // A guest has no address: their notification stays, no email goes.
    const guestTable = await turnsTable(guest);
    realtime.markConnected(guestTable, host);
    await realtime.markNotificationsRead(guestTable, host);
    await realtime.handleMove(host, guestTable, 0, { type: 'pass' });
    expect((await notes(guestTable)).map((n) => n.guest_id)).toEqual([null, 'guest-1']);
    expect(await realtime.sendDueNudges(TEN_MINUTES, later)).toBe(0);
    expect(mailer.sent).toHaveLength(1);
  });

  it('keeps one unread notification per absent player and table, cleared by opening the table', async () => {
    const tableId = await turnsTable();
    realtime.markConnected(tableId, host);
    await realtime.markNotificationsRead(tableId, host);
    // The turn passes to the absent friend twice: a move, a take-back, the move again.
    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    await realtime.handleUndo(host, tableId);
    await realtime.handleMove(host, tableId, 0, { type: 'pass' });
    expect((await notes(tableId)).map((n) => [n.user_id, n.read])).toEqual([['user-host', 1], ['user-friend', 0]]);

    await realtime.markNotificationsRead(tableId, friend);
    expect((await notes(tableId)).every((n) => n.read === 1)).toBe(true);
    // Nothing to email once it is read.
    expect(await realtime.sendDueNudges(0, Date.now() + 1000)).toBe(0);
  });

  it('after a restart, a table stuck before an AI turn plays that turn on the next open', async () => {
    const { tableId } = await tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'live', seatSpecs: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0,
    });
    // The move reached the engine, then the process died before its event.
    await engine.applyMove('session-1', 'p1', undefined, { move: { type: 'pass' } });
    expect((await realtime.eventsAfter(tableId, 0)).map((e) => e.kind)).toEqual(['setup']);

    // A new server process over the same database and engine session.
    const restarted = new Realtime(db, engine, new TableService(db, engine, SECRET), mailer, { appOrigin: ORIGIN });
    const pushed: string[] = [];
    restarted.onBroadcast((_t, e) => pushed.push(e.kind));
    expect(await restarted.resumeTable(tableId)).toBe(true);
    const events = await restarted.eventsAfter(tableId, 0);
    expect(events.map((e) => e.kind)).toEqual(['setup', 'ai_move', 'ai_move']);
    expect(pushed).toEqual(['ai_move', 'ai_move']);
    const last = events[events.length - 1]!;
    expect(last.nextActorPosition).toBe(0);
    expect(last.payloads['0']!.yourTurn).toBe(true);
    expect(last.payloads['0']!.legalMoves!.length).toBeGreaterThan(0);
    expect((await restarted.eventsAfter(tableId, 0)).length).toBe(3);

    // Whole now: another open changes nothing.
    expect(await restarted.resumeTable(tableId)).toBe(false);
    expect((await restarted.eventsAfter(tableId, 0)).length).toBe(3);
  });

  it('after a restart, a table whose last event names the wrong player catches up to the engine', async () => {
    const tableId = await turnsTable();
    // The host's move reached the engine; its event was never written, so
    // the last event still says the host is up while the engine waits for the friend.
    await engine.applyMove('session-1', 'p1', undefined, { move: { type: 'pass' } });
    const restarted = new Realtime(db, engine, new TableService(db, engine, SECRET), mailer, { appOrigin: ORIGIN });
    expect(await restarted.resumeTable(tableId)).toBe(true);
    const events = await restarted.eventsAfter(tableId, 0);
    expect(events.map((e) => e.kind)).toEqual(['setup', 'system']);
    const last = events[1]!;
    expect(last.summary).toBe('Play resumes.');
    expect(last.nextActorPosition).toBe(1);
    expect(last.payloads['1']!.yourTurn).toBe(true);
    expect(last.payloads['0']!.legalMoves).toEqual([]);
    expect((await tableService.getTable(tableId))!.nextActorPosition).toBe(1);
    // The friend was not connected: they are told it is their turn.
    expect((await notes(tableId)).map((n) => n.user_id)).toEqual(['user-host', 'user-friend']);
    expect(await restarted.resumeTable(tableId)).toBe(false);
  });

  it('after a restart, a game the engine already finished is closed out', async () => {
    const tableId = await turnsTable();
    await engine.applyMove('session-1', 'p1', undefined, { move: { type: 'win' } });
    const restarted = new Realtime(db, engine, new TableService(db, engine, SECRET), mailer, { appOrigin: ORIGIN });
    expect(await restarted.resumeTable(tableId)).toBe(true);
    const events = await restarted.eventsAfter(tableId, 0);
    expect(events[events.length - 1]!.gameOver).not.toBeNull();
    expect((await tableService.getTable(tableId))!.status).toBe('finished');
    expect(await restarted.resumeTable(tableId)).toBe(false);
  });
});
