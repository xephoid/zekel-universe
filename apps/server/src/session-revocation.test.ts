// Regressions for two launch blockers from the security reviews:
//
// - SEC-03-F11: a sign-in link only works in the browser that asked for it.
//   A browser without the start cookie is refused, the token is not used
//   up, and that browser's guest seats never move.
// - SEC-04-F12: sockets stop working after sign-out, session expiry, guest
//   upgrade and guest expiry, whether they send messages or only listen.
//
// Real Socket.IO clients against the app on a loopback port, with the fake
// engine; every refusal is checked for no engine write and no seat change.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import type { Kysely } from 'kysely';
import type { CreateTableResponse, JoinTableAck, MeResponse, MoveAck } from '@universe/shared';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { createSocketServer } from './sockets.js';
import { FakeEngine } from './test-engine.js';
import { GUEST_TTL_MS } from './auth.js';

const ORIGIN = 'http://localhost:5173';

type Res = { statusCode: number; headers: Record<string, unknown>; json<T = unknown>(): T };

function setCookies(res: Res): string[] {
  const raw = res.headers['set-cookie'];
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);
}

function cookieOf(res: Res, name: string): string | null {
  const hit = setCookies(res).find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0]! : null;
}

describe('sign-in binding and socket revocation', () => {
  let database: DatabaseClient;
  let db: Kysely<DB>;
  let app: UniverseApp;
  let mailer: ConsoleMailer;
  let engine: FakeEngine;
  let port: number;
  let sockets: ClientSocket[] = [];

  async function boot(extra: { secureCookies?: boolean } = {}): Promise<void> {
    const io = createSocketServer({ allowedOrigins: [ORIGIN] });
    app = buildApp({
      db, engine, mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: extra.secureCookies ?? false, logger: false, io,
      // The timer is driven by hand through recheckSockets().
      socketRecheckMs: 0,
    });
    await app.fastify.ready();
    io.attach(app.fastify.server);
    await new Promise<void>((res) => app.fastify.server.listen(0, '127.0.0.1', () => res()));
    port = (app.fastify.server.address() as AddressInfo).port;
    await app.refreshCatalog();
  }

  beforeEach(async () => {
    database = await createDatabase(':memory:');
    db = database.db;
    engine = new FakeEngine();
    mailer = new ConsoleMailer();
    await boot();
  });

  afterEach(async () => {
    for (const s of sockets) s.close();
    sockets = [];
    await app.fastify.close();
    await database.close();
  });

  const post = (url: string, cookie?: string, payload?: unknown) => app.fastify.inject({
    method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, ...(payload ? { payload } : {}),
  }) as unknown as Promise<Res>;
  const get = (url: string, cookie?: string) =>
    app.fastify.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} }) as unknown as Promise<Res>;

  async function guest(): Promise<string> {
    const res = await post('/api/guests');
    expect(res.statusCode).toBe(200);
    return cookieOf(res, 'universe_guest')!;
  }

  async function aiTable(cookie: string): Promise<string> {
    const res = await post('/api/tables', cookie, {
      gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0,
    });
    expect(res.statusCode).toBe(200);
    return res.json<CreateTableResponse>().tableId;
  }

  /** Ask for a link from a browser holding `cookie`; returns the token and the nonce cookie. */
  async function askForLink(email: string, cookie?: string): Promise<{ token: string; nonce: string }> {
    const res = await post('/api/auth/email/link', cookie, { email });
    expect(res.statusCode).toBe(200);
    const url = /https?:\/\/\S+/.exec(mailer.sent[mailer.sent.length - 1]!.text)![0];
    return { token: decodeURIComponent(url.split('#token=')[1]!), nonce: cookieOf(res, 'universe_signin')! };
  }

  async function signIn(email: string, guestCookie?: string): Promise<string> {
    const { token, nonce } = await askForLink(email, guestCookie);
    const done = await post('/api/auth/email/complete', guestCookie ? `${guestCookie}; ${nonce}` : nonce, { token });
    expect(done.statusCode).toBe(200);
    return cookieOf(done, 'universe_auth')!;
  }

  async function seatOwners(tableId: string) {
    return db.selectFrom('seats').select(['position', 'user_id', 'guest_id']).where('table_id', '=', tableId)
      .orderBy('position').execute();
  }

  function client(cookie: string): ClientSocket {
    const s = ioClient(`http://127.0.0.1:${port}`, {
      extraHeaders: { cookie, origin: ORIGIN }, transports: ['websocket'], reconnection: false,
    });
    sockets.push(s);
    return s;
  }
  const connected = (s: ClientSocket) => new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', (err) => reject(err));
  });
  const refused = (s: ClientSocket) => new Promise<string>((resolve) => {
    s.once('connect', () => resolve('connected'));
    s.once('connect_error', (err) => resolve(err.message));
  });
  const disconnected = (s: ClientSocket) => new Promise<string>((resolve) => s.once('disconnect', (reason) => resolve(reason)));
  const join = (s: ClientSocket, tableId: string) =>
    new Promise<JoinTableAck>((r) => s.emit('join_table', { tableId }, r));
  const move = (s: ClientSocket, tableId: string) =>
    new Promise<MoveAck>((r) => s.emit('move', { tableId, seat: 0, move: { type: 'pass' } }, r));

  /** A socket at the table with its seat joined, ready to move. */
  async function seated(cookie: string, tableId: string): Promise<ClientSocket> {
    const s = client(cookie);
    await connected(s);
    expect(await join(s, tableId)).toMatchObject({ ok: true });
    return s;
  }

  // ---- SEC-03-F11 ----------------------------------------------------------

  it("a link opened in a browser that did not ask for it is refused, and the guest's seats stay put (F11)", async () => {
    // The victim plays as a guest at a table of their own.
    const victim = await guest();
    const tableId = await aiTable(victim);
    const before = await seatOwners(tableId);

    // The attacker asks for a link to their own address in their own
    // browser, then hands the URL to the victim.
    const attacker = await askForLink('attacker@example.com');

    // The victim's browser has its guest cookie but no start cookie.
    const res = await post('/api/auth/email/complete', victim, { token: attacker.token });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'sign_in_wrong_browser' });
    expect(cookieOf(res, 'universe_auth')).toBeNull();

    // Nothing moved: the seat, the host, the guest row, the identity.
    expect(await seatOwners(tableId)).toEqual(before);
    const g = await db.selectFrom('guests').select(['upgraded_to_user_id']).executeTakeFirstOrThrow();
    expect(g.upgraded_to_user_id).toBeNull();
    const t = await db.selectFrom('tables').select(['host_guest_id', 'host_user_id']).where('id', '=', tableId).executeTakeFirstOrThrow();
    expect(t.host_user_id).toBeNull();
    expect(t.host_guest_id).not.toBeNull();
    expect((await get('/api/me', victim)).json<MeResponse>().guest).toBeTruthy();
    expect(await db.selectFrom('users').select('id').execute()).toHaveLength(0);

    // The token was not used up by the refusal: the attacker's own browser
    // still signs in with it, and gets none of the victim's seats.
    const own = await post('/api/auth/email/complete', attacker.nonce, { token: attacker.token });
    expect(own.statusCode).toBe(200);
    expect(await seatOwners(tableId)).toEqual(before);
  });

  it('a browser holding its own, different start cookie cannot use another browser\'s link either (F11)', async () => {
    const victim = await guest();
    const tableId = await aiTable(victim);
    const before = await seatOwners(tableId);
    const victimLink = await askForLink('victim@example.com', victim);
    const attacker = await askForLink('attacker@example.com');
    expect(victimLink.nonce).not.toBe(attacker.nonce);

    const res = await post('/api/auth/email/complete', `${victim}; ${victimLink.nonce}`, { token: attacker.token });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: 'invalid_or_expired_token' });
    expect(await seatOwners(tableId)).toEqual(before);

    // Positive control: the victim's own link, in the victim's browser,
    // signs in and carries the seat across.
    const ok = await post('/api/auth/email/complete', `${victim}; ${victimLink.nonce}`, { token: victimLink.token });
    expect(ok.statusCode).toBe(200);
    const userId = ok.json<{ userId: string }>().userId;
    expect((await seatOwners(tableId))[0]).toMatchObject({ user_id: userId, guest_id: null });
    // The start cookie is spent on success.
    expect(setCookies(ok).some((c) => c.startsWith('universe_signin=') && /Max-Age=0|Expires/i.test(c))).toBe(true);
  });

  it('the start cookie is HttpOnly, SameSite=Lax, short-lived, and kept when the browser asks twice', async () => {
    const first = await post('/api/auth/email/link', undefined, { email: 'a@example.com' });
    const raw = setCookies(first).find((c) => c.startsWith('universe_signin='))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
    expect(raw).toMatch(/Path=\//);
    expect(raw).toMatch(/Max-Age=900/);
    const nonce = cookieOf(first, 'universe_signin')!;
    const firstToken = decodeURIComponent(/#token=(\S+)/.exec(mailer.sent[0]!.text)![1]!);

    // Asking again from the same browser keeps the same nonce, so the first
    // mail's link still works there.
    const second = await post('/api/auth/email/link', nonce, { email: 'a@example.com' });
    expect(cookieOf(second, 'universe_signin')).toBe(nonce);
    expect((await post('/api/auth/email/complete', nonce, { token: firstToken })).statusCode).toBe(200);
  });

  it('over HTTPS the start cookie is Secure and carries the __Host- prefix', async () => {
    await app.fastify.close();
    await boot({ secureCookies: true });
    const res = await post('/api/auth/email/link', undefined, { email: 'a@example.com' });
    const raw = setCookies(res).find((c) => c.startsWith('__Host-universe_signin='))!;
    expect(raw).toMatch(/Secure/i);
    expect(raw).toMatch(/Path=\//);
    expect(raw).not.toMatch(/Domain=/i);
    // The unprefixed name is not accepted in this mode.
    const token = decodeURIComponent(/#token=(\S+)/.exec(mailer.sent[0]!.text)![1]!);
    const value = raw.split(';')[0]!.split('=')[1]!;
    expect((await post('/api/auth/email/complete', `universe_signin=${value}`, { token })).statusCode).toBe(401);
    expect((await post('/api/auth/email/complete', `__Host-universe_signin=${value}`, { token })).statusCode).toBe(200);
  });

  // ---- SEC-04-F12 ----------------------------------------------------------

  it("sign-out disconnects that session's sockets; their moves never reach the engine (F12)", async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    // A second browser signed in to the same account is not touched.
    const otherAuth = await signIn('p@example.com');
    const mine = await seated(auth, tableId);
    const other = await seated(otherAuth, tableId);

    const cut = disconnected(mine);
    expect((await post('/api/auth/signout', auth)).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');

    // The old cookie opens no new socket.
    expect(await refused(client(auth))).toBe('unauthorized');
    // The other session still plays (positive control).
    const appliedBefore = engine.applied.length;
    expect(await move(other, tableId)).toMatchObject({ ok: true });
    expect(engine.applied.length).toBe(appliedBefore + 1);
  });

  it('a message on a socket whose session was ended is refused before the engine sees it (F12)', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    // Revoked without going through sign-out (so nothing disconnects it
    // first): an operator deleting the row, or a race with sign-out.
    await db.deleteFrom('auth_sessions').execute();

    const appliedBefore = engine.applied.length;
    const cut = disconnected(s);
    expect(await move(s, tableId)).toMatchObject({ error: 'unauthorized' });
    expect(await cut).toBe('io server disconnect');
    expect(engine.applied.length).toBe(appliedBefore);
  });

  it('an expired session stops its socket: on the next message, and on the timer for one that only listens (F12)', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const talker = await seated(auth, tableId);
    const listener = await seated(auth, tableId);
    await db.updateTable('auth_sessions').set({ expires_at: new Date(Date.now() - 1000).toISOString() }).execute();

    const appliedBefore = engine.applied.length;
    expect(await move(talker, tableId)).toMatchObject({ error: 'unauthorized' });
    expect(engine.applied.length).toBe(appliedBefore);

    const cut = disconnected(listener);
    expect(await app.recheckSockets()).toBeGreaterThanOrEqual(1);
    expect(await cut).toBe('io server disconnect');
    expect((await get('/api/me', auth)).json<MeResponse>().user).toBeNull();
  });

  it('the timer leaves working sockets alone', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    expect(await app.recheckSockets()).toBe(0);
    expect(s.connected).toBe(true);
    expect(await move(s, tableId)).toMatchObject({ ok: true });
  });

  it("guest upgrade disconnects the guest's sockets, and the browser reconnects as the user (F12)", async () => {
    const g = await guest();
    const tableId = await aiTable(g);
    const s = await seated(g, tableId);

    const cut = disconnected(s);
    const auth = await signIn('up@example.com', g);
    expect(await cut).toBe('io server disconnect');
    // The spent guest token opens no socket; the new session does, keeps the
    // seat and plays.
    expect(await refused(client(g))).toBe('unauthorized');
    const again = await seated(`${auth}; ${g}`, tableId);
    expect(await move(again, tableId)).toMatchObject({ ok: true });
  });

  it('a guest token expires on the server: REST, new sockets and open sockets all stop (F12)', async () => {
    const g = await guest();
    const tableId = await aiTable(g);
    const row = await db.selectFrom('guests').select(['expires_at', 'created_at']).executeTakeFirstOrThrow();
    // New guests carry their own expiry, the cookie's lifetime.
    expect(new Date(row.expires_at!).getTime() - new Date(row.created_at).getTime()).toBe(GUEST_TTL_MS);
    const s = await seated(g, tableId);

    await db.updateTable('guests').set({ expires_at: new Date(Date.now() - 1000).toISOString() }).execute();
    expect((await get('/api/me', g)).json<MeResponse>()).toEqual({ user: null, guest: null });
    expect((await get(`/api/tables/${tableId}/events`, g)).statusCode).toBe(401);
    expect(await refused(client(g))).toBe('unauthorized');
    const appliedBefore = engine.applied.length;
    expect(await move(s, tableId)).toMatchObject({ error: 'unauthorized' });
    expect(engine.applied.length).toBe(appliedBefore);
    // An expired guest cannot be upgraded into an account either.
    const before = await seatOwners(tableId);
    await signIn('late@example.com', g);
    expect(await seatOwners(tableId)).toEqual(before);
  });

  it('a guest row from before the expiry column expires a year after it was made', async () => {
    const g = await guest();
    await db.updateTable('guests').set({ expires_at: null }).execute();
    expect((await get('/api/me', g)).json<MeResponse>().guest).toBeTruthy();
    await db.updateTable('guests').set({ created_at: new Date(Date.now() - GUEST_TTL_MS - 1000).toISOString() }).execute();
    expect((await get('/api/me', g)).json<MeResponse>().guest).toBeNull();
  });

  it("signing out with a guest cookie ends that guest on the server and cuts its sockets", async () => {
    const g = await guest();
    const tableId = await aiTable(g);
    const s = await seated(g, tableId);
    const cut = disconnected(s);
    expect((await post('/api/auth/signout', g)).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');
    expect((await get('/api/me', g)).json<MeResponse>().guest).toBeNull();
  });
});
