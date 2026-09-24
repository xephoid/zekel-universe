// Socket privacy tests: connections owning different seats at one table
// each receive only their own seat's payload; a socket subscribed to two
// tables never gets one table's view through the other's seat; a connection
// without a seat gets nothing; a page on a foreign origin cannot connect.

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import type { JoinTableAck, MoveAck, QueryAck, TableEventWire } from '@universe/shared';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { newId, newToken, hashToken, now, type Principal } from './identity.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { createSocketServer } from './sockets.js';
import { FakeEngine } from './test-engine.js';

const SECRET = 'test-secret';
const ORIGIN = 'http://localhost:5173';

function waitEvent(socket: ClientSocket, name: string): Promise<TableEventWire> {
  return new Promise((resolve) => socket.once(name, resolve));
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve());
    socket.on('connect_error', (err) => reject(err));
  });
}

describe('socket privacy', () => {
  let database: DatabaseClient;
  let db: Kysely<DB>;
  let universe: UniverseApp;
  let fake: FakeEngine;
  let port: number;
  let sockets: ClientSocket[] = [];
  const tokens: Record<string, string> = {};
  const userA: Principal = { kind: 'user', userId: 'user-a' };
  const userB: Principal = { kind: 'user', userId: 'user-b' };
  const userC: Principal = { kind: 'user', userId: 'user-c' };

  beforeEach(async () => {
    database = await createDatabase(':memory:');
    db = database.db;
    await db.insertInto('games').values({
      engine_game_id: 'fractured-fist', name: 'Fractured Fist', designer_name: '', player_count: '2',
      min_players: 2, max_players: 2, supports_ai: 1, play_time: '', tags: '[]', cover_image: null,
      description: '', rules_url: null, visibility: 'public',
    }).execute();
    for (const userId of ['user-a', 'user-b', 'user-c']) {
      await db.insertInto('users').values({ id: userId, display_name: userId, avatar_url: null, bio: null, created_at: now() }).execute();
      const token = newToken();
      tokens[userId] = token;
      await db.insertInto('auth_sessions').values({
        id: newId(), user_id: userId, token_hash: hashToken(token), created_at: now(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      }).execute();
    }
    const io = createSocketServer({ allowedOrigins: [ORIGIN] });
    universe = buildApp({
      db, engine: (fake = new FakeEngine()), mailer: new ConsoleMailer(), secretKey: SECRET,
      appOrigin: ORIGIN, allowedOrigins: [ORIGIN], secureCookies: false, io, logger: false,
    });
    await universe.fastify.ready();
    io.attach(universe.fastify.server);
    await new Promise<void>((res) => universe.fastify.server.listen(0, '127.0.0.1', () => res()));
    port = (universe.fastify.server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const s of sockets) s.close();
    sockets = [];
    await universe.fastify.close();
    await database.close();
  });

  function client(userId: string, origin: string = ORIGIN): ClientSocket {
    const s = ioClient(`http://127.0.0.1:${port}`, {
      extraHeaders: { cookie: `universe_auth=${tokens[userId]}`, origin },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(s);
    return s;
  }

  const join = (s: ClientSocket, tableId: string) =>
    new Promise<JoinTableAck>((r) => s.emit('join_table', { tableId }, r));
  const move = (s: ClientSocket, tableId: string, seat: number) =>
    new Promise<MoveAck>((r) => s.emit('move', { tableId, seat, move: { type: 'pass' } }, r));

  async function twoHumanTable(host: Principal, guest: Principal): Promise<string> {
    const { tableId } = await universe.tableService.createTable(host, {
      gameId: 'fractured-fist', mode: 'live',
      seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    });
    await universe.tableService.joinTable(guest, tableId);
    await universe.tableService.setReady(guest, tableId, true);
    await universe.tableService.startTable(host, tableId);
    return tableId;
  }

  const query = (s: ClientSocket, tableId: string, seat: number, name: string, args: unknown = {}) =>
    new Promise<QueryAck>((r) => s.emit('query', { tableId, seat, name, args }, r));

  it('a read-only question: the seat owner is answered, nobody else is, and nothing is applied', async () => {
    const tableId = await twoHumanTable(userA, userB);
    const sockA = client('user-a');
    const sockB = client('user-b');
    const sockC = client('user-c');
    await Promise.all([connected(sockA), connected(sockB), connected(sockC)]);
    const engine = fake;
    const appliedBefore = engine.applied.length;

    // The seat's owner asks and gets the engine's answer for that seat.
    const ok = await query(sockA, tableId, 0, 'echo', { prior: [] });
    expect(ok).toEqual({ ok: true, answer: { playerId: 'p1', args: { prior: [] } } });
    // Another seated player cannot ask as seat 0; an unseated one cannot ask at all.
    expect(await query(sockB, tableId, 0, 'echo')).toMatchObject({ error: 'not_your_seat' });
    expect(await query(sockC, tableId, 1, 'echo')).toMatchObject({ error: 'not_your_seat' });
    // A question the engine refuses reads as a rule, not a fault.
    expect(await query(sockA, tableId, 0, 'nope')).toMatchObject({ error: 'move_rejected' });
    // Malformed and oversized requests never reach the engine.
    expect(await query(sockA, tableId, 0, '')).toMatchObject({ error: 'bad_request' });
    expect(await query(sockA, tableId, 0, 'echo', ['not', 'an', 'object'])).toMatchObject({ error: 'bad_request' });
    expect(await query(sockA, tableId, 0, 'echo', { big: 'x'.repeat(5000) })).toMatchObject({ error: 'bad_request' });
    expect(engine.queries).toHaveLength(1);
    expect(engine.applied.length).toBe(appliedBefore);
  });

  it('two sockets, two seats, two views: no crossing', async () => {
    const tableId = await twoHumanTable(userA, userB);
    const sockA = client('user-a');
    const sockB = client('user-b');
    await Promise.all([connected(sockA), connected(sockB)]);

    // Joining replays the opening event to each seat.
    const openA = waitEvent(sockA, 'table_event');
    const openB = waitEvent(sockB, 'table_event');
    const [ackA, ackB] = await Promise.all([join(sockA, tableId), join(sockB, tableId)]);
    expect(ackA).toMatchObject({ ok: true, seats: [0], status: 'playing' });
    expect(ackB).toMatchObject({ ok: true, seats: [1] });
    const [oa, ob] = await Promise.all([openA, openB]);
    expect(oa.view).toMatchObject({ player: 'p1' });
    expect(ob.view).toMatchObject({ player: 'p2' });
    expect(oa.yourTurn).toBe(true);
    expect(ob.yourTurn).toBe(false);

    const gotA = waitEvent(sockA, 'table_event');
    const gotB = waitEvent(sockB, 'table_event');
    const ack = await move(sockA, tableId, 0);
    expect(ack).toMatchObject({ ok: true });
    const [evA, evB] = await Promise.all([gotA, gotB]);
    expect(evA.view).toMatchObject({ player: 'p1', hand: ['secret-of-p1'] });
    expect(evB.view).toMatchObject({ player: 'p2', hand: ['secret-of-p2'] });
    expect(JSON.stringify(evA)).not.toContain('secret-of-p2');
    expect(JSON.stringify(evB)).not.toContain('secret-of-p1');
    // B is up now and only B holds the legal moves.
    expect(evA.legalMoves).toEqual([]);
    expect(evB.legalMoves.length).toBeGreaterThan(0);
  });

  it('one socket at two tables never receives a view for a seat it does not own', async () => {
    // At table 1, A owns seat 1 (B hosts). At table 2, A owns seat 0.
    const table1 = await twoHumanTable(userB, userA);
    const table2 = await twoHumanTable(userA, userC);
    const sockA = client('user-a');
    const sockB = client('user-b');
    await Promise.all([connected(sockA), connected(sockB)]);
    await join(sockA, table1);
    await join(sockA, table2);
    await join(sockB, table1);
    // drain the replayed opening events
    await new Promise((r) => setTimeout(r, 50));

    const received: TableEventWire[] = [];
    sockA.on('table_event', (e: TableEventWire) => received.push(e));
    // B moves at table 1; A must get seat 1's view there, never seat 0's.
    const ack = await move(sockB, table1, 0);
    expect(ack).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(1);
    expect(received[0]!.view).toMatchObject({ player: 'p2' });
    expect(JSON.stringify(received[0])).not.toContain('secret-of-p1');
  });

  it('a connection without a seat is refused the table and gets no events', async () => {
    const tableId = await twoHumanTable(userA, userB);
    const sockC = client('user-c');
    const sockA = client('user-a');
    await Promise.all([connected(sockC), connected(sockA)]);
    const ack = await join(sockC, tableId);
    expect(ack).toMatchObject({ error: 'not_seated' });
    await join(sockA, tableId);
    const received: TableEventWire[] = [];
    sockC.on('table_event', (e: TableEventWire) => received.push(e));
    await move(sockA, tableId, 0);
    await new Promise((r) => setTimeout(r, 50));
    expect(received).toHaveLength(0);
    // and it cannot act either
    expect(await move(sockC, tableId, 0)).toMatchObject({ error: 'not_your_seat' });
  });

  it('a page on a foreign origin cannot open a socket, even with valid cookies', async () => {
    const evil = client('user-a', 'https://evil.example');
    await expect(connected(evil)).rejects.toBeTruthy();
  });

  it('a connection without cookies is refused', async () => {
    const s = ioClient(`http://127.0.0.1:${port}`, { transports: ['websocket'], reconnection: false, extraHeaders: { origin: ORIGIN } });
    sockets.push(s);
    await expect(connected(s)).rejects.toBeTruthy();
  });

  it('a rejected move reaches only the mover, through the acknowledgement', async () => {
    const tableId = await twoHumanTable(userA, userB);
    const sockA = client('user-a');
    await connected(sockA);
    await join(sockA, tableId);
    const ack = await new Promise<MoveAck>((r) => sockA.emit('move', { tableId, seat: 0, move: { type: 'illegal' } }, r));
    expect(ack).toMatchObject({ error: 'move_rejected', reason: 'Not now.', lesson: 'Play happens clockwise.' });
  });
});
