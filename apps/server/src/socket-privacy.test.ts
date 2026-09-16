// Socket privacy test: two connections owning different seats at one table
// must each receive only their own seat's view, never the other's.

import { describe, it, expect, afterEach } from 'vitest';
import { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { games, users, authSessions } from './db/schema.js';
import { newId, newToken, hashToken, now, type Principal } from './identity.js';
import type { EngineService } from './engine.js';
import { NoopEmailSender } from './email.js';
import { ConsoleEmailLinker } from './auth.js';
import { buildApp } from './app.js';
import type { TableEventWire } from '@universe/shared';
import type { AddressInfo } from 'node:net';

const SECRET = 'test-secret';

function makeEngine(over: Partial<EngineService> = {}): EngineService {
  return {
    async listGames() { return { games: [{ id: 'g', name: 'G', player_counts: [2] }] }; },
    async getRules() { return {}; },
    async createSession() {
      return {
        session_id: 's1',
        host_token: 'tok',
        seats: [
          { position: 0, player_id: 'p0' },
          { position: 1, player_id: 'p1' },
        ],
      };
    },
    async getState(_s: string, playerId?: string) { return { playerId }; },
    async getLegalMoves() { return {}; },
    async applyMove(_s: string, _p: string, _t: string | undefined, _m: Record<string, unknown>) {
      return {
        ok: true as const,
        summary: 'A moves.',
        player_views: { p0: { secret: 'aaa' }, p1: { secret: 'bbb' } },
        next_step: null,
      };
    },
    async runAiTurn() { return { moves: [] as never[] }; },
    async undo() { return {}; },
    async isGameOver() { return { over: false as const }; },
    ...over,
  };
}

function waitEvent(socket: ClientSocket, name: string): Promise<TableEventWire> {
  return new Promise((resolve) => socket.once(name, resolve));
}

function connected(socket: ClientSocket): Promise<void> {
  return new Promise((resolve) => socket.on('connect', () => resolve()));
}

describe('per-seat socket views never leak', () => {
  let db: DatabaseClient;
  let sockets: ClientSocket[] = [];

  afterEach(async () => {
    for (const s of sockets) s.close();
    sockets = [];
  });

  it('two sockets, two seats, two views: no crossing', async () => {
    db = createDatabase(':memory:');
    db.insert(games).values({ engineGameId: 'g', name: 'G' }).run();

    // Two signed-in users with session cookies.
    const tokens: Record<string, string> = {};
    for (const userId of ['user-a', 'user-b']) {
      db.insert(users).values({ id: userId, displayName: userId, createdAt: now() }).run();
      const token = newToken();
      tokens[userId] = token;
      db.insert(authSessions).values({
        id: newId(), userId, tokenHash: hashToken(token), createdAt: now(),
      }).run();
    }

    const io = new SocketServer({ transports: ['websocket'] });
    const universe = buildApp({
      db,
      engine: makeEngine(),
      emailLinker: new ConsoleEmailLinker(),
      emailSender: new NoopEmailSender(),
      secretKey: SECRET,
      io,
    });
    await universe.fastify.ready();
    io.attach(universe.fastify.server);
    await new Promise<void>((res) =>
      universe.fastify.server.listen(0, '127.0.0.1', () => res()));
    const port = (universe.fastify.server.address() as AddressInfo).port;

    const userA: Principal = { kind: 'user', userId: 'user-a' };
    const userB: Principal = { kind: 'user', userId: 'user-b' };
    const { tableId } = await universe.tableService.createTable(userA, {
      gameId: 'g', mode: 'live',
      seatSpecs: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0,
    });
    universe.tableService.joinTable(userB, tableId);
    await universe.tableService.setReady(userB, tableId, true);
    await universe.tableService.startTable(userA, tableId);

    const sockA = ioClient(`http://127.0.0.1:${port}`, {
      extraHeaders: { cookie: `universe_auth=${tokens['user-a']}` },
      transports: ['websocket'],
    });
    const sockB = ioClient(`http://127.0.0.1:${port}`, {
      extraHeaders: { cookie: `universe_auth=${tokens['user-b']}` },
      transports: ['websocket'],
    });
    sockets = [sockA, sockB];
    await Promise.all([connected(sockA), connected(sockB)]);

    const joinAck = (s: ClientSocket) =>
      new Promise<{ ok?: boolean; seats?: number[] }>((r) => s.emit('join_table', { tableId }, r));
    const [ackA, ackB] = await Promise.all([joinAck(sockA), joinAck(sockB)]);
    expect(ackA.seats).toEqual([0]);
    expect(ackB.seats).toEqual([1]);

    // user-a moves over the socket; both sockets receive a table_event.
    const gotA = waitEvent(sockA, 'table_event');
    const gotB = waitEvent(sockB, 'table_event');
    const moveAck = await new Promise<{ ok?: boolean; error?: string }>((r) =>
      sockA.emit('move', { tableId, seat: 0, move: { action: 'pass' } }, r));
    expect(moveAck.ok).toBe(true);

    const [evA, evB] = await Promise.all([gotA, gotB]);
    expect(evA.view).toEqual({ secret: 'aaa' });
    expect(evB.view).toEqual({ secret: 'bbb' });
    expect(JSON.stringify(evA)).not.toContain('bbb');
    expect(JSON.stringify(evB)).not.toContain('aaa');
  });
});
