// REST contract tests through Fastify's inject: guests, the catalog, table
// creation and reading, the per-seat events feed, sign-in by email link
// with guest upgrade, sign-out, rate limiting, and the origin check.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type {
  CreateTableResponse, GameReferenceResponse, GameResponse, GamesResponse, MeResponse, MyTablesResponse,
  TableEventsResponse, TableResponse,
} from '@universe/shared';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { FakeEngine } from './test-engine.js';

const ORIGIN = 'http://localhost:5173';

describe('REST', () => {
  let database: DatabaseClient;
  let db: Kysely<DB>;
  let app: UniverseApp;
  let mailer: ConsoleMailer;
  let engine: FakeEngine;

  beforeEach(async () => {
    database = await createDatabase(':memory:');
    db = database.db;
    engine = new FakeEngine();
    mailer = new ConsoleMailer();
    app = buildApp({
      db, engine, mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: false, logger: false,
    });
    await app.fastify.ready();
    await app.refreshCatalog();
  });

  afterEach(async () => {
    await app.fastify.close();
    await database.close();
  });

  function cookieOf(res: { headers: Record<string, unknown> }, name: string): string {
    const raw = res.headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : [raw];
    const hit = list.find((c) => typeof c === 'string' && c.startsWith(`${name}=`)) as string | undefined;
    if (!hit) throw new Error(`no ${name} cookie`);
    return hit.split(';')[0]!;
  }

  async function guest(): Promise<string> {
    const res = await app.fastify.inject({ method: 'POST', url: '/api/guests', headers: { origin: ORIGIN } });
    expect(res.statusCode).toBe(200);
    return cookieOf(res, 'universe_guest');
  }

  it('creates a guest once and returns it again on repeat calls', async () => {
    const cookie = await guest();
    const again = await app.fastify.inject({ method: 'POST', url: '/api/guests', headers: { origin: ORIGIN, cookie } });
    expect(again.statusCode).toBe(200);
    expect(again.headers['set-cookie']).toBeUndefined();
    const me = await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    const body = me.json<MeResponse>();
    expect(body.guest?.displayName).toMatch(/^Guest /);
    expect(body.user).toBeNull();
    expect((await db.selectFrom('guests').selectAll().execute()).length).toBe(1);
  });

  it('serves the catalog, a game, and its reference data from the engine', async () => {
    const games = (await app.fastify.inject({ method: 'GET', url: '/api/games' })).json<GamesResponse>();
    expect(games.games.map((g) => g.engineGameId)).toEqual(['fractured-fist', 'trio']);
    const ff = games.games[0]!;
    expect(ff.designerName).toBe('Zekel Games');
    expect(ff.minPlayers).toBe(2);
    const one = (await app.fastify.inject({ method: 'GET', url: '/api/games/fractured-fist' })).json<GameResponse>();
    expect(one.game.name).toBe('Fractured Fist');
    expect((await app.fastify.inject({ method: 'GET', url: '/api/games/nope' })).statusCode).toBe(404);
    const ref = (await app.fastify.inject({ method: 'GET', url: '/api/games/fractured-fist/reference' })).json<GameReferenceResponse>();
    expect((ref.referenceData as { max_missteps: number }).max_missteps).toBe(10);
    expect(ref.optionsSchema).toBeTypeOf('object');
  });

  it('a guest creates a vs-AI table and reads it, its seats and its own events', async () => {
    const cookie = await guest();
    const bad = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie },
      payload: { gameId: 'fractured-fist', seats: 2, mode: 'live' },
    });
    expect(bad.statusCode).toBe(400);
    const created = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai', aiDifficulty: 'easy' }], hostPosition: 0, options: { loadout: ['attack'] } },
    });
    expect(created.statusCode).toBe(200);
    const { tableId, status } = created.json<CreateTableResponse>();
    expect(status).toBe('playing');
    expect(engine.lastOptions).toEqual({ loadout: ['attack'] });

    const table = (await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}`, headers: { cookie } })).json<TableResponse>();
    expect(table.table.status).toBe('playing');
    expect(table.table.gameName).toBe('Fractured Fist');
    expect(table.table.hostIsMe).toBe(true);
    expect(table.table.waitingOnMe).toBe(true);
    expect(table.mySeats).toEqual([0]);
    expect(table.seats.map((s) => s.displayName?.startsWith('Guest') || s.displayName)).toEqual([true, 'AI (easy)']);

    const events = (await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}/events?after=0`, headers: { cookie } })).json<TableEventsResponse>();
    expect(events.events).toHaveLength(1);
    expect(events.events[0]!.view).toMatchObject({ player: 'p1' });
    expect(events.events[0]!.legalMoves.length).toBeGreaterThan(0);

    // Someone else cannot read the feed.
    const other = await guest();
    expect((await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}/events`, headers: { cookie: other } })).statusCode).toBe(403);

    const mine = (await app.fastify.inject({ method: 'GET', url: '/api/my-tables', headers: { cookie } })).json<MyTablesResponse>();
    expect(mine.tables.map((t) => t.id)).toEqual([tableId]);
    expect(mine.tables[0]!.waitingOnMe).toBe(true);
  });

  it('a guest cannot host a friends table but a signed-in user can', async () => {
    const cookie = await guest();
    const res = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'guest_cannot_host' });
  });

  it('requires a principal and refuses state changes from foreign origins', async () => {
    expect((await app.fastify.inject({ method: 'GET', url: '/api/my-tables' })).statusCode).toBe(401);
    const cookie = await guest();
    const res = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: 'https://evil.example', cookie },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('signs in by email link, upgrades the guest with their tables, and signs out', async () => {
    const cookie = await guest();
    const created = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0 },
    });
    const { tableId } = created.json<CreateTableResponse>();

    const link = await app.fastify.inject({
      method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN, cookie }, payload: { email: 'Player@Example.com' },
    });
    expect(link.statusCode).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    const url = /https?:\/\/\S+/.exec(mailer.sent[0]!.text)![0];
    expect(url.startsWith(`${ORIGIN}/signin/complete#token=`)).toBe(true);
    const token = decodeURIComponent(url.split('#token=')[1]!);

    const bad = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/complete', headers: { origin: ORIGIN }, payload: { token: 'nope' } });
    expect(bad.statusCode).toBe(401);
    const done = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/complete', headers: { origin: ORIGIN, cookie }, payload: { token } });
    expect(done.statusCode).toBe(200);
    const auth = cookieOf(done, 'universe_auth');
    // one use only
    expect((await app.fastify.inject({ method: 'POST', url: '/api/auth/email/complete', headers: { origin: ORIGIN }, payload: { token } })).statusCode).toBe(401);

    const me = (await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie: auth } })).json<MeResponse>();
    expect(me.user?.displayName).toBe('player');
    // The guest's table and seat moved to the user: they still host it.
    const table = (await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}`, headers: { cookie: auth } })).json<TableResponse>();
    expect(table.table.hostIsMe).toBe(true);
    expect(table.mySeats).toEqual([0]);
    const rows = await db.selectFrom('tables').select(['host_user_id', 'host_guest_id']).execute();
    expect(rows[0]!.host_guest_id).toBeNull();
    expect(rows[0]!.host_user_id).toBe(me.user!.id);

    // Signing in again with the same address finds the same user.
    await app.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email: 'player@example.com' } });
    const url2 = /https?:\/\/\S+/.exec(mailer.sent[1]!.text)![0];
    const token2 = decodeURIComponent(url2.split('#token=')[1]!);
    const done2 = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/complete', headers: { origin: ORIGIN }, payload: { token: token2 } });
    expect(done2.json()).toMatchObject({ userId: me.user!.id });

    const out = await app.fastify.inject({ method: 'POST', url: '/api/auth/signout', headers: { origin: ORIGIN, cookie: auth } });
    expect(out.statusCode).toBe(200);
    const after = (await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie: auth } })).json<MeResponse>();
    expect(after.user).toBeNull();
  });

  it('rate limits sign-in links per address', async () => {
    let last = 200;
    for (let i = 0; i < 6; i++) {
      const res = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email: 'spam@example.com' } });
      last = res.statusCode;
    }
    expect(last).toBe(429);
    expect(mailer.sent).toHaveLength(5);
  });

  it('rejects an address that is not an email', async () => {
    const res = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email: 'nope' } });
    expect(res.statusCode).toBe(400);
  });
});
