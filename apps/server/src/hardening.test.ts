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
