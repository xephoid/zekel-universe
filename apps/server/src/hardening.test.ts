// Security regressions the playbook asks for (security-check-playbook.md):
// a spent guest token authenticates as nobody after upgrade and sign-out,
// a sign-in link redeems exactly once under a race, two moves delivered at
// once are applied one after the other, guest creation is rate limited,
// and every response carries the security headers with no caching of
// private API answers.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type { CreateTableResponse, MeResponse } from '@universe/shared';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { FakeEngine } from './test-engine.js';
import { consumeSignInLink, issueSignInLink } from './auth.js';
import { TableService } from './tables/service.js';
import { Realtime } from './realtime.js';

const ORIGIN = 'http://localhost:5173';

function cookieOf(res: { headers: Record<string, unknown> }, name: string): string | null {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const hit = list.find((c) => typeof c === 'string' && c.startsWith(`${name}=`)) as string | undefined;
  return hit ? hit.split(';')[0]! : null;
}

describe('hardening', () => {
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
      secureCookies: false, logger: false, limits: { guestsPerIp: 3, tablesPerPrincipal: 2 },
    });
    await app.fastify.ready();
    await app.refreshCatalog();
  });

  afterEach(async () => {
    await app.fastify.close();
    await database.close();
  });

  async function guest(): Promise<string> {
    const res = await app.fastify.inject({ method: 'POST', url: '/api/guests', headers: { origin: ORIGIN } });
    expect(res.statusCode).toBe(200);
    return cookieOf(res, 'universe_guest')!;
  }

  async function signIn(cookie: string | undefined, email: string): Promise<string> {
    await app.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload: { email } });
    const url = /https?:\/\/\S+/.exec(mailer.sent[mailer.sent.length - 1]!.text)![0];
    const token = decodeURIComponent(url.split('#token=')[1]!);
    const done = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/complete', headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload: { token } });
    expect(done.statusCode).toBe(200);
    return cookieOf(done, 'universe_auth')!;
  }

  it('an upgraded guest token authenticates as nobody, and sign-out ends both cookies', async () => {
    const guestCookie = await guest();
    const created = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie: guestCookie },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0 },
    });
    const { tableId } = created.json<CreateTableResponse>();
    const auth = await signIn(guestCookie, 'g@example.com');

    // The old guest token alone is nobody now.
    const asGuest = (await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie: guestCookie } })).json<MeResponse>();
    expect(asGuest).toEqual({ user: null, guest: null });
    expect((await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}/events`, headers: { cookie: guestCookie } })).statusCode).toBe(401);
    // The user keeps the seat.
    expect((await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}/events`, headers: { cookie: auth } })).statusCode).toBe(200);

    // Sign-out clears both cookies and the session is gone.
    const out = await app.fastify.inject({ method: 'POST', url: '/api/auth/signout', headers: { origin: ORIGIN, cookie: `${auth}; ${guestCookie}` } });
    const cleared = ([] as unknown[]).concat(out.headers['set-cookie'] ?? []).map(String);
    expect(cleared.some((c) => c.startsWith('universe_auth=') && /Expires|Max-Age=0/i.test(c))).toBe(true);
    expect(cleared.some((c) => c.startsWith('universe_guest=') && /Expires|Max-Age=0/i.test(c))).toBe(true);
    expect((await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie: `${auth}; ${guestCookie}` } })).json<MeResponse>()).toEqual({ user: null, guest: null });
  });

  it('a sign-in link redeems exactly once under a race', async () => {
    const token = await issueSignInLink(db, 'race@example.com');
    const results = await Promise.all(Array.from({ length: 6 }, () => consumeSignInLink(db, token)));
    expect(results.filter((r) => r === 'race@example.com')).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(5);
  });

  it('two moves delivered at once are applied one after the other, never interleaved', async () => {
    const tables = new TableService(db, engine, 's');
    const realtime = new Realtime(db, engine, tables, mailer);
    await db.insertInto('users').values({ id: 'u', display_name: 'u', avatar_url: null, bio: null, created_at: 'now' }).execute();
    const host = { kind: 'user' as const, userId: 'u' };
    const { tableId } = await tables.createTable(host, {
      gameId: 'fractured-fist', mode: 'live', seatSpecs: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0,
    });
    const order: string[] = [];
    realtime.onBroadcast((_t, e) => order.push(`${e.kind}:${e.seq}`));
    const [a, b] = await Promise.allSettled([
      realtime.handleMove(host, tableId, 0, { type: 'pass' }),
      realtime.handleMove(host, tableId, 0, { type: 'pass' }),
    ]);
    // The first move ran to the end of its AI turn before the second began;
    // the second was then a full flow of its own (the fake engine hands the
    // turn back to the human after each AI turn).
    expect(a.status).toBe('fulfilled');
    expect(b.status).toBe('fulfilled');
    expect(order).toEqual(['move:2', 'ai_move:3', 'ai_move:4', 'move:5', 'ai_move:6', 'ai_move:7']);
    expect(engine.applied.map((m) => m.player)).toEqual(['p1', 'p1']);
  });

  it('guest creation and table creation are rate limited', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      codes.push((await app.fastify.inject({ method: 'POST', url: '/api/guests', headers: { origin: ORIGIN } })).statusCode);
    }
    expect(codes).toEqual([200, 200, 200, 429]);
    const cookie = await (async () => {
      const res = await app.fastify.inject({ method: 'POST', url: '/api/guests', headers: { origin: ORIGIN, 'x-forwarded-for': '10.0.0.9' } });
      return cookieOf(res, 'universe_guest') ?? (await guestFromDb());
    })();
    const make = () => app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0 },
    });
    const t = [(await make()).statusCode, (await make()).statusCode, (await make()).statusCode];
    expect(t).toEqual([200, 200, 429]);
    expect(engine.sessions.size).toBe(2);
  });

  async function guestFromDb(): Promise<string> {
    // Fallback when the IP limiter already tripped: mint a guest row directly.
    const { newId, newToken, hashToken, now } = await import('./identity.js');
    const token = newToken();
    await db.insertInto('guests').values({ id: newId(), token_hash: hashToken(token), display_name: 'G', created_at: now(), upgraded_to_user_id: null }).execute();
    return `universe_guest=${token}`;
  }

  it('sets security headers on every response and never caches API answers', async () => {
    const api = await app.fastify.inject({ method: 'GET', url: '/api/games' });
    expect(api.headers['x-content-type-options']).toBe('nosniff');
    expect(api.headers['x-frame-options']).toBe('DENY');
    expect(api.headers['cache-control']).toBe('no-store');
    expect(api.headers['referrer-policy']).toBe('same-origin');
    const page = await app.fastify.inject({ method: 'GET', url: '/nothing-here' });
    expect(String(page.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(String(page.headers['content-security-policy'])).toContain("script-src 'self'");
  });

  // SEC-05-F10: the router matches the decoded path, so `/%61pi/me` is
  // `/api/me`. The origin check and the no-store header must not care how
  // the path is spelled.
  it('refuses foreign-origin writes and keeps no-store however the API path is spelled', async () => {
    const EVIL = 'http://evil.example';
    const spellings = (rest: string) => [
      `/%61pi/${rest}`, `/%61%70%69/${rest}`, `/a%70i/${rest}`, `/ap%69/${rest}`, `/%61%70i/${rest}`,
    ];
    const guestCount = async () => (await db.selectFrom('guests').select('id').execute()).length;

    // POST: no guest is created, with a JSON body or none at all.
    const before = await guestCount();
    for (const url of spellings('guests')) {
      const json = await app.fastify.inject({ method: 'POST', url, headers: { origin: EVIL } });
      const text = await app.fastify.inject({ method: 'POST', url, headers: { origin: EVIL, 'content-type': 'text/plain' }, payload: 'x' });
      for (const res of [json, text]) {
        expect(res.statusCode, url).toBe(403);
        expect(res.json()).toMatchObject({ error: 'origin_not_allowed' });
      }
    }
    expect(await guestCount()).toBe(before);

    // PATCH with a victim's cookie: the name does not change.
    const victim = await guest();
    const nameOf = async () => (await db.selectFrom('guests').select('display_name')
      .where('token_hash', '=', (await import('./identity.js')).hashToken(victim.split('=')[1]!)).executeTakeFirstOrThrow()).display_name;
    const name = await nameOf();
    for (const url of [...spellings('me'), '/%61pi/%6De', '/api/%6de']) {
      const res = await app.fastify.inject({ method: 'PATCH', url, headers: { origin: EVIL, cookie: victim }, payload: { displayName: 'MARKER-F10' } });
      expect(res.statusCode, url).toBe(403);
    }
    expect(await nameOf()).toBe(name);

    // DELETE with the host's cookie: the table and its rows stay.
    const created = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie: victim },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0 },
    });
    const { tableId } = created.json<CreateTableResponse>();
    const seats = async () => (await db.selectFrom('seats').select('id').where('table_id', '=', tableId).execute()).length;
    const seatCount = await seats();
    for (const url of spellings(`tables/${tableId}`)) {
      const res = await app.fastify.inject({ method: 'DELETE', url, headers: { origin: EVIL, cookie: victim } });
      expect(res.statusCode, url).toBe(403);
    }
    expect((await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}`, headers: { cookie: victim } })).statusCode).toBe(200);
    expect(await seats()).toBe(seatCount);

    // A write to a path that is not the API is refused from a foreign origin too.
    expect((await app.fastify.inject({ method: 'POST', url: '/anything', headers: { origin: EVIL } })).statusCode).toBe(403);

    // Every API answer carries no-store and no page policy, however it is spelled.
    for (const url of ['/%61pi/games', '/a%70i/me', '/%61pi/nope']) {
      const res = await app.fastify.inject({ method: 'GET', url, headers: { cookie: victim } });
      expect(res.headers['cache-control'], url).toBe('no-store');
      expect(res.headers['content-security-policy'], url).toBeUndefined();
    }
    const refused = await app.fastify.inject({ method: 'POST', url: '/%61pi/guests', headers: { origin: EVIL } });
    expect(refused.headers['cache-control']).toBe('no-store');

    // The app's own origin still works, on the plain and the encoded path.
    const renamed = await app.fastify.inject({ method: 'PATCH', url: '/api/me', headers: { origin: ORIGIN, cookie: victim }, payload: { displayName: 'Plain' } });
    expect(renamed.statusCode).toBe(200);
    expect(await nameOf()).toBe('Plain');
    const encoded = await app.fastify.inject({ method: 'PATCH', url: '/%61pi/me', headers: { origin: ORIGIN, cookie: victim }, payload: { displayName: 'Encoded' } });
    expect(encoded.statusCode).toBe(200);
    expect(encoded.headers['cache-control']).toBe('no-store');
    expect(await nameOf()).toBe('Encoded');
    expect((await app.fastify.inject({ method: 'DELETE', url: `/api/tables/${tableId}`, headers: { origin: ORIGIN, cookie: victim } })).statusCode).toBe(200);
    expect(await seats()).toBe(0);
  });

  it('refuses malformed and oversized input without side effects', async () => {
    const cookie = await guest();
    const before = engine.sessions.size;
    const cases: unknown[] = [
      { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 1.5 },
      { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: -1 },
      { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'wizard' }], hostPosition: 0 },
      { gameId: 'fractured-fist', mode: 'sometimes', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0 },
      { gameId: 'fractured-fist', mode: 'live', seats: 'two', hostPosition: 0 },
      { gameId: 'fractured-fist', mode: 'live', seats: Array.from({ length: 9 }, () => ({ kind: 'ai' })), hostPosition: 0 },
      { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0, options: 'x'.repeat(10) },
    ];
    for (const payload of cases) {
      const res = await app.fastify.inject({ method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie }, payload: payload as never });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
    }
    // A body over the limit is refused before parsing.
    const huge = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ gameId: 'x'.repeat(2_000_000) }),
    });
    expect(huge.statusCode).toBe(413);
    expect(engine.sessions.size).toBe(before);
  });
});
