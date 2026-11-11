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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as SocketServer } from 'socket.io';
import type { AddressInfo } from 'node:net';
import type { Kysely, KyselyPlugin, PluginTransformQueryArgs, PluginTransformResultArgs, QueryResult, RootOperationNode, UnknownRow, QueryId } from 'kysely';
import type { CreateTableResponse, JoinTableAck, MeResponse, MoveAck, TableEventWire } from '@universe/shared';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { createSocketServer } from './sockets.js';
import { FakeEngine } from './test-engine.js';
import { GUEST_TTL_MS, SESSION_TTL_MS } from './auth.js';

const ORIGIN = 'http://localhost:5173';

/** The table a query reads or writes, with its kind ('select', 'delete', ...). */
function describe_(node: RootOperationNode): string {
  const name = (t: unknown) => (t as { table?: { identifier?: { name?: string } } } | undefined)?.table?.identifier?.name ?? '?';
  switch (node.kind) {
    case 'SelectQueryNode': return `select:${name(node.from?.froms[0])}`;
    case 'DeleteQueryNode': return `delete:${name(node.from.froms[0])}`;
    case 'UpdateQueryNode': return `update:${name(node.table)}`;
    case 'InsertQueryNode': return `insert:${name(node.into)}`;
    default: return node.kind;
  }
}

/** Test-only database hooks: hold the request right after one query has
 *  run, or make one query fail, chosen by kind and table. Nothing is armed
 *  unless a test arms it, and each arming fires once. */
class Injector implements KyselyPlugin {
  private tags = new WeakMap<QueryId, string>();
  private pauses = new Map<string, { wait: Promise<void>; hit: () => void }>();
  private failures = new Set<string>();
  pauseAfter(tag: string): { reached: Promise<void>; open: () => void } {
    let open!: () => void;
    let hit!: () => void;
    const wait = new Promise<void>((r) => { open = r; });
    const reached = new Promise<void>((r) => { hit = r; });
    this.pauses.set(tag, { wait, hit });
    return { reached, open };
  }
  failNext(tag: string): void { this.failures.add(tag); }
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const tag = describe_(args.node);
    if (this.failures.delete(tag)) throw new Error(`injected failure: ${tag}`);
    this.tags.set(args.queryId, tag);
    return args.node;
  }
  async transformResult(args: PluginTransformResultArgs): Promise<QueryResult<UnknownRow>> {
    const tag = this.tags.get(args.queryId);
    const pause = tag ? this.pauses.get(tag) : undefined;
    if (pause) {
      this.pauses.delete(tag!);
      pause.hit();
      await pause.wait;
    }
    return args.result;
  }
}

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
  let io: SocketServer;
  let inject: Injector;

  async function boot(extra: { secureCookies?: boolean } = {}): Promise<void> {
    io = createSocketServer({ allowedOrigins: [ORIGIN] });
    inject = new Injector();
    app = buildApp({
      db: db.withPlugin(inject), engine, mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
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
    vi.restoreAllMocks();
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

  // ---- account switching (PR #18 review, finding 1) -----------------------

  it("signing in as another account ends the old session and cuts its sockets; sign-out then ends the new one (account switch)", async () => {
    const a = await signIn('a@example.com');
    const tableA = await aiTable(a);
    const aSocket = await seated(a, tableA);
    const aEvents: TableEventWire[] = [];
    aSocket.on('table_event', (e: TableEventWire) => aEvents.push(e));
    // A second browser signed in to A is not touched (positive control).
    const aElsewhere = await signIn('a@example.com');
    const elsewhere = await seated(aElsewhere, tableA);

    // The same browser completes a link for B: it still sends A's cookie.
    const { token, nonce } = await askForLink('b@example.com', a);
    const cut = disconnected(aSocket);
    const done = await post('/api/auth/email/complete', `${a}; ${nonce}`, { token });
    expect(done.statusCode).toBe(200);
    const b = cookieOf(done, 'universe_auth')!;
    expect(b).not.toBe(a);
    expect(await cut).toBe('io server disconnect');

    // A's cookie is dead everywhere it was this browser's.
    expect((await get('/api/me', a)).json<MeResponse>().user).toBeNull();
    expect(await refused(client(a))).toBe('unauthorized');
    // A's seat did not move to B, and B cannot join A's table.
    const bUserId = done.json<{ userId: string }>().userId;
    expect((await seatOwners(tableA)).every((s) => s.user_id !== bUserId)).toBe(true);
    const bSocket = client(b);
    await connected(bSocket);
    expect(await join(bSocket, tableA)).toMatchObject({ error: 'not_seated' });

    // A's other browser still plays, and the cut socket hears nothing of it.
    const appliedBefore = engine.applied.length;
    expect(await move(elsewhere, tableA)).toMatchObject({ ok: true });
    expect(engine.applied.length).toBe(appliedBefore + 1);
    expect(aEvents).toHaveLength(0);

    // Sign out of B: B's socket is cut, and A's cookie stays dead.
    const bCut = disconnected(bSocket);
    expect((await post('/api/auth/signout', b)).statusCode).toBe(200);
    expect(await bCut).toBe('io server disconnect');
    expect((await get('/api/me', b)).json<MeResponse>().user).toBeNull();
    expect((await get('/api/me', a)).json<MeResponse>().user).toBeNull();
    expect(await refused(client(a))).toBe('unauthorized');
    expect(await refused(client(b))).toBe('unauthorized');
  });

  it('signing in again as the same account replaces the old session; the guest upgrade still carries seats', async () => {
    const g = await guest();
    const tableId = await aiTable(g);
    const first = await signIn('same@example.com', g);
    const userId = (await get('/api/me', first)).json<MeResponse>().user!.id;
    expect((await seatOwners(tableId))[0]).toMatchObject({ user_id: userId, guest_id: null });
    const s = await seated(`${first}; ${g}`, tableId);
    const cut = disconnected(s);
    const { token, nonce } = await askForLink('same@example.com', `${first}; ${g}`);
    const done = await post('/api/auth/email/complete', `${first}; ${g}; ${nonce}`, { token });
    expect(done.statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');
    const second = cookieOf(done, 'universe_auth')!;
    expect((await get('/api/me', first)).json<MeResponse>().user).toBeNull();
    expect((await get('/api/me', second)).json<MeResponse>().user?.id).toBe(userId);
    expect((await seatOwners(tableId))[0]).toMatchObject({ user_id: userId, guest_id: null });
  });

  it('a refused completion leaves the signed-in session alone', async () => {
    const a = await signIn('a@example.com');
    const s = client(a);
    await connected(s);
    // No start cookie: refused before anything changes.
    const other = await askForLink('b@example.com');
    expect((await post('/api/auth/email/complete', a, { token: other.token })).statusCode).toBe(401);
    // A wrong token with this browser's own nonce: refused too.
    const own = await askForLink('b@example.com', a);
    expect((await post('/api/auth/email/complete', `${a}; ${own.nonce}`, { token: 'not-a-token' })).statusCode).toBe(401);
    expect((await get('/api/me', a)).json<MeResponse>().user).toBeTruthy();
    expect(s.connected).toBe(true);
  });

  // ---- handshake races (PR #18 review, finding 2) ---------------------------

  /** Resolves with 'cut' when the socket is disconnected by the server, or
   *  'still connected' if that has not happened within `ms`. */
  const cutWithin = (s: ClientSocket, ms = 1500) => Promise.race([
    disconnected(s).then((r) => (r === 'io server disconnect' ? 'cut' : r)),
    new Promise<string>((r) => setTimeout(() => r('still connected'), ms)),
  ]);

  function gate(): { wait: Promise<void>; open: () => void; reached: Promise<void>; hit: () => void } {
    let open!: () => void;
    let hit!: () => void;
    const wait = new Promise<void>((r) => { open = r; });
    const reached = new Promise<void>((r) => { hit = r; });
    return { wait, open, reached, hit };
  }

  it('a socket whose credential was read before sign-out is cut as soon as it connects, without sending anything', async () => {
    const auth = await signIn('p@example.com');
    // Runs after the app's own middleware, so after its database read.
    const g = gate();
    let armed = true;
    io.use((_socket, next) => {
      if (!armed) return next();
      armed = false;
      g.hit();
      void g.wait.then(() => next());
    });
    const s = client(auth);
    await g.reached;
    expect((await post('/api/auth/signout', auth)).statusCode).toBe(200);
    const result = cutWithin(s);
    g.open();
    expect(await result).toBe('cut');
  });

  it('a socket whose credential room was still being registered at sign-out gets no private event and is cut', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const otherAuth = await signIn('p@example.com');
    const other = await seated(otherAuth, tableId);

    // Make joining a credential room asynchronous and hold it, as a
    // clustered adapter's would be.
    const adapter = io.of('/').adapter;
    const addAll = adapter.addAll.bind(adapter);
    const g = gate();
    let armed = true;
    adapter.addAll = (id, rooms) => {
      if (armed && [...rooms].some((r) => r.startsWith('cred:'))) {
        armed = false;
        g.hit();
        return g.wait.then(() => addAll(id, rooms));
      }
      return addAll(id, rooms);
    };

    const s = client(auth);
    const events: TableEventWire[] = [];
    s.on('table_event', (e: TableEventWire) => events.push(e));
    await connected(s);
    await g.reached;
    const acks: JoinTableAck[] = [];
    s.emit('join_table', { tableId }, (a: JoinTableAck) => acks.push(a));
    // Give a join that skipped the wait the chance to finish first.
    await new Promise((r) => setTimeout(r, 100));
    expect((await post('/api/auth/signout', auth)).statusCode).toBe(200);
    const result = cutWithin(s);
    g.open();
    expect(await result).toBe('cut');

    // The other session plays; the revoked socket heard nothing.
    expect(await move(other, tableId)).toMatchObject({ ok: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(events).toHaveLength(0);
    expect(acks.every((a) => !('ok' in a))).toBe(true);
  });

  it('a sign-out that lands while join_table is reading the seats leaves no subscription behind', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const userId = (await get('/api/me', auth)).json<MeResponse>().user!.id;
    const otherAuth = await signIn('p@example.com');
    const other = await seated(otherAuth, tableId);
    // The other socket leaves, so presence below is only the raced one's.
    other.emit('leave_table', { tableId });

    const s = client(auth);
    await connected(s);
    const events: TableEventWire[] = [];
    s.on('table_event', (e: TableEventWire) => events.push(e));

    const getSeats = app.tableService.getSeats.bind(app.tableService);
    const g = gate();
    let armed = true;
    app.tableService.getSeats = async (id: string) => {
      const seats = await getSeats(id);
      if (armed) { armed = false; g.hit(); await g.wait; }
      return seats;
    };
    const acks: JoinTableAck[] = [];
    const cut = disconnected(s);
    s.emit('join_table', { tableId }, (a: JoinTableAck) => acks.push(a));
    await g.reached;
    expect((await post('/api/auth/signout', auth)).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');
    g.open();
    await new Promise((r) => setTimeout(r, 100));

    expect(io.of('/').adapter.rooms.get(`table:${tableId}`)?.size ?? 0).toBe(0);
    expect(app.realtime.isAnyoneConnected(tableId, { userId, guestId: null })).toBe(false);
    expect(await move(other, tableId)).toMatchObject({ ok: true });
    expect(events).toHaveLength(0);
    expect(acks.every((a) => !('ok' in a))).toBe(true);
  });

  // ---- revocation and failure (PR #18 second review) ------------------------

  /** Every table_event the server sends to this client's socket, recorded
   *  on the server side, so "nothing was sent" needs no waiting. */
  function serverSends(s: ClientSocket): unknown[] {
    const sent: unknown[] = [];
    const server = io.of('/').sockets.get(s.id!)!;
    const emit = server.emit.bind(server);
    server.emit = ((ev: string, ...args: unknown[]) => {
      if (ev === 'table_event') sent.push(args[0]);
      return emit(ev, ...args);
    }) as typeof server.emit;
    return sent;
  }

  /** Send one of the table's stored events to its room again, as a new
   *  event would be: the broadcast path with no engine involved. Takes a
   *  prepared sender when the database is busy (inside a held transaction
   *  SQLite's one connection serves nobody else). */
  async function rebroadcast(tableId: string): Promise<void> {
    (await broadcaster(tableId))();
  }
  async function broadcaster(tableId: string): Promise<() => void> {
    const events = await app.realtime.eventsAfter(tableId, 0);
    expect(events.length).toBeGreaterThan(0);
    const event = events[events.length - 1];
    return () => (app.realtime as unknown as { broadcast: (t: string, e: unknown) => void }).broadcast(tableId, event);
  }

  it('sign-out held right after its session delete: the socket hears no event, then is cut', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    const sent = serverSends(s);
    const held = inject.pauseAfter('delete:auth_sessions');
    const cut = disconnected(s);
    const out = post('/api/auth/signout', auth);
    await held.reached;
    await rebroadcast(tableId);
    expect(sent).toHaveLength(0);
    held.open();
    expect((await out).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');
  });

  it('account switch held right after the old session is deleted: the old socket hears no event, then is cut', async () => {
    const a = await signIn('a@example.com');
    const tableId = await aiTable(a);
    const s = await seated(a, tableId);
    const sent = serverSends(s);
    const { token, nonce } = await askForLink('b@example.com', a);
    const send = await broadcaster(tableId);
    const held = inject.pauseAfter('delete:auth_sessions');
    const cut = disconnected(s);
    const done = post('/api/auth/email/complete', `${a}; ${nonce}`, { token });
    await held.reached;
    send();
    expect(sent).toHaveLength(0);
    held.open();
    expect((await done).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');
  });

  it('guest upgrade held part way: the guest socket hears no event, then is cut', async () => {
    const g = await guest();
    const tableId = await aiTable(g);
    const s = await seated(g, tableId);
    const sent = serverSends(s);
    const { token, nonce } = await askForLink('up@example.com', g);
    const send = await broadcaster(tableId);
    const held = inject.pauseAfter('update:seats');
    const cut = disconnected(s);
    const done = post('/api/auth/email/complete', `${g}; ${nonce}`, { token });
    await held.reached;
    send();
    expect(sent).toHaveLength(0);
    held.open();
    expect((await done).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');
  });

  it('an account switch that fails after deleting the old session cuts the old socket, which hears nothing; the rollback keeps A signed in', async () => {
    const a = await signIn('a@example.com');
    const tableId = await aiTable(a);
    const s = await seated(a, tableId);
    const sent = serverSends(s);
    const { token, nonce } = await askForLink('b@example.com', a);
    inject.failNext('insert:auth_sessions');
    const cut = disconnected(s);
    const done = await post('/api/auth/email/complete', `${a}; ${nonce}`, { token });
    expect(done.statusCode).toBe(500);
    expect(cookieOf(done, 'universe_auth')).toBeNull();
    expect(await cut).toBe('io server disconnect');
    await rebroadcast(tableId);
    expect(sent).toHaveLength(0);
    // The transaction rolled back: A's session is as it was (no lockout),
    // and the same link still works.
    expect((await get('/api/me', a)).json<MeResponse>().user).toBeTruthy();
    const retry = await post('/api/auth/email/complete', `${a}; ${nonce}`, { token });
    expect(retry.statusCode).toBe(200);
    expect((await get('/api/me', a)).json<MeResponse>().user).toBeNull();
  });

  it('a sign-out that fails part way still cuts the socket, which hears nothing', async () => {
    const g = await guest();
    const tableId = await aiTable(g);
    const s = await seated(g, tableId);
    const sent = serverSends(s);
    inject.failNext('update:guests');
    const cut = disconnected(s);
    expect((await post('/api/auth/signout', g)).statusCode).toBe(500);
    expect(await cut).toBe('io server disconnect');
    await rebroadcast(tableId);
    expect(sent).toHaveLength(0);
  });

  /** Make the credential check inside join_table (the one after the room
   *  join) fail with a database error. */
  function failJoinCheck(): void {
    const getSeats = app.tableService.getSeats.bind(app.tableService);
    let armed = true;
    app.tableService.getSeats = async (id: string) => {
      const seats = await getSeats(id);
      if (armed) { armed = false; inject.failNext('select:auth_sessions'); }
      return seats;
    };
  }

  it('a database error in the check after a first join leaves no room, seat or presence, and cuts the socket', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const userId = (await get('/api/me', auth)).json<MeResponse>().user!.id;
    const s = client(auth);
    await connected(s);
    const sent = serverSends(s);
    failJoinCheck();
    const cut = disconnected(s);
    expect(await join(s, tableId)).toMatchObject({ error: 'internal' });
    expect(await cut).toBe('io server disconnect');
    expect(io.of('/').adapter.rooms.get(`table:${tableId}`)?.size ?? 0).toBe(0);
    expect(app.realtime.isAnyoneConnected(tableId, { userId, guestId: null })).toBe(false);
    await rebroadcast(tableId);
    expect(sent).toHaveLength(0);
  });

  it('a database error in the check on a repeated join drops the earlier seat too, and cuts the socket', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const userId = (await get('/api/me', auth)).json<MeResponse>().user!.id;
    const s = await seated(auth, tableId);
    expect(app.realtime.isAnyoneConnected(tableId, { userId, guestId: null })).toBe(true);
    const sent = serverSends(s);
    failJoinCheck();
    const cut = disconnected(s);
    expect(await join(s, tableId)).toMatchObject({ error: 'internal' });
    expect(await cut).toBe('io server disconnect');
    expect(io.of('/').adapter.rooms.get(`table:${tableId}`)?.size ?? 0).toBe(0);
    expect(app.realtime.isAnyoneConnected(tableId, { userId, guestId: null })).toBe(false);
    await rebroadcast(tableId);
    expect(sent).toHaveLength(0);
  });

  // ---- link status (PR #18 second review, sign-in retry) --------------------

  const linkStatus = (cookie: string | undefined, token: string) =>
    post('/api/auth/email/link-status', cookie, { token }).then((r) => r.json<{ signedIn: boolean; userId?: string }>());

  it('link-status says yes only for the session that this very link made', async () => {
    const a = await signIn('a@example.com');
    const { token, nonce } = await askForLink('a@example.com', a);
    // Before completion: the browser's session (A) was not made by it.
    expect(await linkStatus(a, token)).toEqual({ signedIn: false });
    const done = await post('/api/auth/email/complete', `${a}; ${nonce}`, { token });
    const again = cookieOf(done, 'universe_auth')!;
    const userId = done.json<{ userId: string }>().userId;
    // Same account, new session: the link made it.
    expect(await linkStatus(again, token)).toEqual({ signedIn: true, userId });
    // Not for another token, not without the cookie, not for the old session.
    expect(await linkStatus(again, 'other-token')).toEqual({ signedIn: false });
    expect(await linkStatus(undefined, token)).toEqual({ signedIn: false });
    expect(await linkStatus(a, token)).toEqual({ signedIn: false });
    // The proof is not the link row's own token hash.
    const row = await db.selectFrom('auth_sessions').select('link_hash').where('user_id', '=', userId)
      .where('link_hash', 'is not', null).executeTakeFirstOrThrow();
    const { hashToken } = await import('./identity.js');
    expect(row.link_hash).not.toBe(hashToken(token));
    // It changes nothing.
    expect((await get('/api/me', again)).json<MeResponse>().user?.id).toBe(userId);
  });

  // ---- third review: aborted requests, queued work, atomic upgrade ---------

  /** POST over a real HTTP connection, so the test can drop it mid-request. */
  function rawPost(url: string, cookie: string): { abort: () => void; closed: Promise<void> } {
    let closedResolve!: () => void;
    const closed = new Promise<void>((r) => { closedResolve = r; });
    const onRequest = (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === url) {
        app.fastify.server.off('request', onRequest);
        res.once('close', () => closedResolve());
      }
    };
    app.fastify.server.on('request', onRequest);
    const req = httpRequest({
      host: '127.0.0.1', port, method: 'POST', path: url,
      headers: { origin: ORIGIN, cookie, 'content-length': '0' },
    });
    req.on('error', () => {});
    req.end();
    return { abort: () => req.destroy(), closed };
  }

  it('a sign-out whose client drops the request before the delete: a socket reconnecting meanwhile is refused, and the mark is cleaned up', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const g = await guest(); // a second cookie gives sign-out a read before its delete
    const held = inject.pauseAfter('select:guests');
    const out = rawPost('/api/auth/signout', `${auth}; ${g}`);
    await held.reached;
    out.abort();
    await out.closed;

    // The session row is still there; a socket reconnecting with it now is
    // cut by its own check and does nothing.
    const s = client(auth);
    const events: TableEventWire[] = [];
    s.on('table_event', (e: TableEventWire) => events.push(e));
    const cut = disconnected(s);
    const acks: unknown[] = [];
    s.emit('join_table', { tableId }, (a: unknown) => acks.push(a));
    s.emit('move', { tableId, seat: 0, move: { type: 'pass' } }, (a: unknown) => acks.push(a));
    const appliedBefore = engine.applied.length;
    expect(await cut).toBe('io server disconnect');
    // Still marked: the session (the guest is added once it has been read).
    expect(app.revocationsInProgress()).toBe(1);

    held.open();
    await vi.waitFor(() => expect(app.revocationsInProgress()).toBe(0));
    expect((await get('/api/me', auth)).json<MeResponse>().user).toBeNull();
    expect(engine.applied.length).toBe(appliedBefore);
    expect(events).toHaveLength(0);
    expect(acks.every((a) => !(a as { ok?: boolean }).ok)).toBe(true);
  });

  it('join_table paused while reading the missed events: a revocation that begins then stops the replay', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = client(auth);
    await connected(s);
    const sent = serverSends(s);

    const eventsAfter = app.realtime.eventsAfter.bind(app.realtime);
    let release!: () => void;
    let reachedResolve!: () => void;
    const reached = new Promise<void>((r) => { reachedResolve = r; });
    const gateOpen = new Promise<void>((r) => { release = r; });
    let armed = true;
    app.realtime.eventsAfter = async (id: string, after: number) => {
      const rows = await eventsAfter(id, after);
      if (armed) { armed = false; reachedResolve(); await gateOpen; }
      return rows;
    };
    const acks: JoinTableAck[] = [];
    s.emit('join_table', { tableId }, (a: JoinTableAck) => acks.push(a));
    await reached;

    // Sign-out begins (and is held after its delete, before its cut).
    const held = inject.pauseAfter('delete:auth_sessions');
    const cut = disconnected(s);
    const out = post('/api/auth/signout', auth);
    await held.reached;
    release();
    expect(await cut).toBe('io server disconnect');
    expect(sent).toHaveLength(0);
    expect(acks.every((a) => !('ok' in a))).toBe(true);
    held.open();
    expect((await out).statusCode).toBe(200);
    expect(app.revocationsInProgress()).toBe(0);
  });

  it('a move waiting in its table queue when sign-out begins is never applied or written', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const otherAuth = await signIn('p@example.com');
    const mine = await seated(auth, tableId);
    const other = await seated(otherAuth, tableId);

    // Hold the first move inside the engine, so the table's queue is busy.
    const applyMove = engine.applyMove.bind(engine);
    let release!: () => void;
    let inEngine!: () => void;
    const engineReached = new Promise<void>((r) => { inEngine = r; });
    const gateOpen = new Promise<void>((r) => { release = r; });
    let armed = true;
    engine.applyMove = async (...args: Parameters<FakeEngine['applyMove']>) => {
      if (armed) { armed = false; inEngine(); await gateOpen; }
      return applyMove(...args);
    };
    // Know when the second move has passed its socket check and is queued.
    const handleMove = app.realtime.handleMove.bind(app.realtime);
    let queuedResolve!: () => void;
    const queued = new Promise<void>((r) => { queuedResolve = r; });
    let calls = 0;
    app.realtime.handleMove = (...args: Parameters<typeof handleMove>) => {
      const run = handleMove(...args);
      if (++calls === 2) queuedResolve();
      return run;
    };

    const first = new Promise<MoveAck>((r) => other.emit('move', { tableId, seat: 0, move: { type: 'pass', marker: 'first' } }, r));
    await engineReached;
    const mineAcks: unknown[] = [];
    mine.emit('move', { tableId, seat: 0, move: { type: 'pass', marker: 'queued' } }, (a: unknown) => mineAcks.push(a));
    await queued;

    const held = inject.pauseAfter('delete:auth_sessions');
    const out = post('/api/auth/signout', auth);
    await held.reached;
    release();
    expect(await first).toMatchObject({ ok: true });
    // A later move from the other session runs after the queued one.
    expect(await move(other, tableId)).toMatchObject({ ok: true });
    held.open();
    expect((await out).statusCode).toBe(200);

    expect(engine.applied.some((a) => a.move['marker'] === 'queued')).toBe(false);
    const rows = await db.selectFrom('table_events').selectAll().where('table_id', '=', tableId).execute();
    expect(JSON.stringify(rows)).not.toContain('queued');
    expect(mineAcks.every((a) => !(a as { ok?: boolean }).ok)).toBe(true);
  });

  for (const tag of [
    'delete:sign_in_links', 'insert:users', 'insert:identities', 'update:guests', 'update:seats',
    'update:tables', 'update:notifications', 'insert:auth_sessions',
  ]) {
    it(`a guest upgrade failing at ${tag} changes nothing, keeps the guest working, and the same link then moves everything`, async () => {
      const g = await guest();
      const tableId = await aiTable(g);
      const guestId = (await get('/api/me', g)).json<MeResponse>().guest!.id;
      await db.insertInto('notifications').values({
        id: 'n1', user_id: null, guest_id: guestId, kind: 'your_turn', table_id: tableId, read: 0,
        created_at: new Date().toISOString(), emailed_at: null,
      }).execute();
      const snapshot = async () => ({
        guest: await db.selectFrom('guests').select(['upgraded_to_user_id', 'expires_at']).where('id', '=', guestId).executeTakeFirstOrThrow(),
        seats: await seatOwners(tableId),
        table: await db.selectFrom('tables').select(['host_user_id', 'host_guest_id']).where('id', '=', tableId).executeTakeFirstOrThrow(),
        notes: await db.selectFrom('notifications').select(['user_id', 'guest_id']).execute(),
        users: (await db.selectFrom('users').select('id').execute()).length,
        sessions: (await db.selectFrom('auth_sessions').select('id').execute()).length,
        links: (await db.selectFrom('sign_in_links').select('id').execute()).length,
      });
      const { token, nonce } = await askForLink('up@example.com', g);
      const before = await snapshot();

      inject.failNext(tag);
      const failed = await post('/api/auth/email/complete', `${g}; ${nonce}`, { token });
      expect(failed.statusCode).toBe(500);
      expect(setCookies(failed)).toEqual([]); // no new session, nonce kept
      expect(await snapshot()).toEqual(before);
      expect((await get('/api/me', g)).json<MeResponse>().guest?.id).toBe(guestId);
      await vi.waitFor(() => expect(app.revocationsInProgress()).toBe(0));
      const again = await seated(g, tableId); // the guest still plays
      again.close();

      const ok = await post('/api/auth/email/complete', `${g}; ${nonce}`, { token });
      expect(ok.statusCode).toBe(200);
      const userId = ok.json<{ userId: string }>().userId;
      const auth = cookieOf(ok, 'universe_auth')!;
      expect((await get('/api/me', auth)).json<MeResponse>().user?.id).toBe(userId);
      expect((await seatOwners(tableId))[0]).toMatchObject({ user_id: userId, guest_id: null });
      expect(await db.selectFrom('tables').select(['host_user_id', 'host_guest_id']).where('id', '=', tableId).executeTakeFirstOrThrow())
        .toEqual({ host_user_id: userId, host_guest_id: null });
      expect(await db.selectFrom('notifications').select(['user_id', 'guest_id']).execute()).toEqual([{ user_id: userId, guest_id: null }]);
      const s = await seated(`${auth}; ${g}`, tableId);
      expect(await move(s, tableId)).toMatchObject({ ok: true });
    });
  }

  // ---- fourth review: the check right before the engine call, and acks ----

  /** The server's own promises for every move and undo it starts from now
   *  on, so a test can wait for an action to finish, however it ends,
   *  before asserting what it did not do. */
  function serverActions(): { settled: () => Promise<void>; count: () => number } {
    const runs: Promise<unknown>[] = [];
    const handleMove = app.realtime.handleMove.bind(app.realtime);
    const handleUndo = app.realtime.handleUndo.bind(app.realtime);
    app.realtime.handleMove = (...args: Parameters<typeof handleMove>) => { const r = handleMove(...args); runs.push(r); return r; };
    app.realtime.handleUndo = (...args: Parameters<typeof handleUndo>) => { const r = handleUndo(...args); runs.push(r); return r; };
    return {
      settled: async () => { await Promise.allSettled(runs); },
      count: () => runs.length,
    };
  }

  /** Move the server's clock (Date.now) forward without touching timers. */
  function clock(): { advance: (ms: number) => void; reset: () => void } {
    const real = Date.now.bind(Date);
    let offset = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => real() + offset);
    return { advance: (ms) => { offset += ms; }, reset: () => { offset = 0; } };
  }
  const PAST_SESSION_EXPIRY = SESSION_TTL_MS + 60_000;

  /** Hold the next host-token read: the last await before an engine call. */
  function holdHostToken(): { reached: Promise<void>; open: () => void } {
    const hostToken = app.tableService.hostToken.bind(app.tableService);
    let open!: () => void;
    let hit!: () => void;
    const wait = new Promise<void>((r) => { open = r; });
    const reached = new Promise<void>((r) => { hit = r; });
    let armed = true;
    app.tableService.hostToken = async (id: string) => {
      const token = await hostToken(id);
      if (armed) { armed = false; hit(); await wait; }
      return token;
    };
    return { reached, open };
  }

  it('a move past its queue check, held before its engine call when sign-out begins, never reaches the engine', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    const sent = serverSends(s);
    const actions = serverActions();
    const gap = holdHostToken();
    const acks: MoveAck[] = [];
    s.emit('move', { tableId, seat: 0, move: { type: 'pass', marker: 'gap' } }, (a: MoveAck) => acks.push(a));
    await gap.reached;

    const held = inject.pauseAfter('delete:auth_sessions');
    const cut = disconnected(s);
    const out = post('/api/auth/signout', auth);
    await held.reached;
    gap.open();
    held.open();
    expect((await out).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');
    // Wait for the move itself to finish on the server, however it ends.
    expect(actions.count()).toBe(1);
    await actions.settled();

    expect(engine.applied.some((a) => a.move['marker'] === 'gap')).toBe(false);
    const rows = await db.selectFrom('table_events').selectAll().where('table_id', '=', tableId).execute();
    expect(JSON.stringify(rows)).not.toContain('gap');
    expect(sent).toHaveLength(0);
    expect(acks.every((a) => !('ok' in a))).toBe(true);
  });

  it('an undo past its queue check, held before its engine call when sign-out begins, never reaches the engine', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    expect(await move(s, tableId)).toMatchObject({ ok: true }); // something to take back
    const eventsBefore = (await db.selectFrom('table_events').select('id').where('table_id', '=', tableId).execute()).length;
    const undo = engine.undo.bind(engine);
    let undoCalls = 0;
    engine.undo = async (...args: Parameters<FakeEngine['undo']>) => { undoCalls++; return undo(...args); };

    const actions = serverActions();
    const gap = holdHostToken();
    const acks: unknown[] = [];
    s.emit('undo', { tableId }, (a: unknown) => acks.push(a));
    await gap.reached;
    const held = inject.pauseAfter('delete:auth_sessions');
    const cut = disconnected(s);
    const out = post('/api/auth/signout', auth);
    await held.reached;
    gap.open();
    held.open();
    expect((await out).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');
    expect(actions.count()).toBe(1);
    await actions.settled();

    expect(undoCalls).toBe(0);
    expect((await db.selectFrom('table_events').select('id').where('table_id', '=', tableId).execute()).length).toBe(eventsBefore);
    expect(acks.every((a) => !(a as { ok?: boolean }).ok)).toBe(true);
  });

  it("an engine rejection already in flight when sign-out begins sends no legal moves to the revoked socket", async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);

    // Hold the illegal move inside the engine (the accepted case: it was
    // already there when revocation began), then let it reject.
    const applyMove = engine.applyMove.bind(engine);
    let release!: () => void;
    let inEngine!: () => void;
    const reached = new Promise<void>((r) => { inEngine = r; });
    const gateOpen = new Promise<void>((r) => { release = r; });
    engine.applyMove = async (...args: Parameters<FakeEngine['applyMove']>) => {
      inEngine();
      await gateOpen;
      return applyMove(...args);
    };
    const ack = new Promise<MoveAck>((r) => s.emit('move', { tableId, seat: 0, move: { type: 'illegal' } }, r));
    await reached;

    const held = inject.pauseAfter('delete:auth_sessions');
    const out = post('/api/auth/signout', auth);
    await held.reached; // the reply is still open: the socket is marked, not cut
    expect(s.connected).toBe(true);
    release();
    const got = await ack;
    expect(got).toMatchObject({ error: 'unauthorized' });
    expect(JSON.stringify(got)).not.toMatch(/legal|lesson/i);
    held.open();
    expect((await out).statusCode).toBe(200);

    // Positive control: a working session's rejection still explains itself.
    const auth2 = await signIn('q@example.com');
    const table2 = await aiTable(auth2);
    const s2 = await seated(auth2, table2);
    const ok = await new Promise<MoveAck>((r) => s2.emit('move', { tableId: table2, seat: 0, move: { type: 'illegal' } }, r));
    expect(ok).toMatchObject({ error: expect.any(String) });
    expect((ok as { legalMoves?: unknown[] }).legalMoves?.length ?? 0).toBeGreaterThan(0);
  });

  // ---- fifth review: natural expiry across an action ------------------------

  it('a move whose last credential read returns after the session expired never reaches the engine; a live one does', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    const t = clock();
    const actions = serverActions();
    const gap = holdHostToken();
    const acks: MoveAck[] = [];
    s.emit('move', { tableId, seat: 0, move: { type: 'pass', marker: 'late' } }, (a: MoveAck) => acks.push(a));
    await gap.reached;
    // The next session read is the one right before the engine call: hold
    // it after it has read the (still valid) row, then let the session expire.
    const read = inject.pauseAfter('select:auth_sessions');
    const cut = disconnected(s);
    gap.open();
    await read.reached;
    t.advance(PAST_SESSION_EXPIRY);
    read.open();
    // The refused check cuts the socket; wait for that and for the move
    // itself to finish on the server before asserting what it did not do.
    expect(await cut).toBe('io server disconnect');
    expect(actions.count()).toBe(1);
    await actions.settled();
    expect(engine.applied.some((a) => a.move['marker'] === 'late')).toBe(false);
    expect(acks.every((a) => !('ok' in a))).toBe(true);
    const rows = await db.selectFrom('table_events').selectAll().where('table_id', '=', tableId).execute();
    expect(JSON.stringify(rows)).not.toContain('late');

    // Positive control: with the clock back, a fresh session moves.
    t.reset();
    const live = await seated(await signIn('p@example.com'), tableId);
    expect(await move(live, tableId)).toMatchObject({ ok: true });
  });

  it('an undo whose last credential read returns after the session expired never reaches the engine; a live one does', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    expect(await move(s, tableId)).toMatchObject({ ok: true });
    const eventsBefore = (await db.selectFrom('table_events').select('id').where('table_id', '=', tableId).execute()).length;
    const undo = engine.undo.bind(engine);
    let undoCalls = 0;
    engine.undo = async (...args: Parameters<FakeEngine['undo']>) => { undoCalls++; return undo(...args); };
    const t = clock();
    const actions = serverActions();
    const gap = holdHostToken();
    const acks: unknown[] = [];
    s.emit('undo', { tableId }, (a: unknown) => acks.push(a));
    await gap.reached;
    const read = inject.pauseAfter('select:auth_sessions');
    const cut = disconnected(s);
    gap.open();
    await read.reached;
    t.advance(PAST_SESSION_EXPIRY);
    read.open();
    expect(await cut).toBe('io server disconnect');
    expect(actions.count()).toBe(1);
    await actions.settled();
    expect(acks.every((a) => !(a as { ok?: boolean }).ok)).toBe(true);
    expect(undoCalls).toBe(0);
    expect((await db.selectFrom('table_events').select('id').where('table_id', '=', tableId).execute()).length).toBe(eventsBefore);

    t.reset();
    const live = await seated(await signIn('p@example.com'), tableId);
    expect(await new Promise<{ ok?: boolean }>((r) => live.emit('undo', { tableId }, r))).toMatchObject({ ok: true });
    expect(undoCalls).toBe(1);
  });

  it('a rejection in flight across expiry sends no legal moves; a live session still gets them', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    const t = clock();
    const applyMove = engine.applyMove.bind(engine);
    let release!: () => void;
    let inEngine!: () => void;
    const reached = new Promise<void>((r) => { inEngine = r; });
    const gateOpen = new Promise<void>((r) => { release = r; });
    let armed = true;
    engine.applyMove = async (...args: Parameters<FakeEngine['applyMove']>) => {
      if (armed) { armed = false; inEngine(); await gateOpen; }
      return applyMove(...args);
    };
    const ack = new Promise<MoveAck>((r) => s.emit('move', { tableId, seat: 0, move: { type: 'illegal' } }, r));
    await reached;
    const cut = disconnected(s);
    t.advance(PAST_SESSION_EXPIRY);
    release();
    const got = await ack;
    expect(got).toMatchObject({ error: 'unauthorized' });
    expect(JSON.stringify(got)).not.toMatch(/legal|lesson|turn order/i);
    expect(await cut).toBe('io server disconnect');

    t.reset();
    const live = await seated(await signIn('p@example.com'), tableId);
    const ok = await new Promise<MoveAck>((r) => live.emit('move', { tableId, seat: 0, move: { type: 'illegal' } }, r));
    expect((ok as { legalMoves?: unknown[] }).legalMoves?.length ?? 0).toBeGreaterThan(0);
  });

  it('a query answered across expiry sends no answer; a live session still gets one', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    const t = clock();
    const queryChoice = engine.queryChoice.bind(engine);
    let release!: () => void;
    let inEngine!: () => void;
    const reached = new Promise<void>((r) => { inEngine = r; });
    const gateOpen = new Promise<void>((r) => { release = r; });
    let armed = true;
    engine.queryChoice = async (...args: Parameters<FakeEngine['queryChoice']>) => {
      if (armed) { armed = false; inEngine(); await gateOpen; }
      return queryChoice(...args);
    };
    const ask = (sock: ClientSocket) => new Promise<{ ok?: boolean; answer?: unknown; error?: string }>((r) =>
      sock.emit('query', { tableId, seat: 0, name: 'echo', args: { marker: 'secret-answer' } }, r));
    const ack = ask(s);
    await reached;
    const cut = disconnected(s);
    t.advance(PAST_SESSION_EXPIRY);
    release();
    const got = await ack;
    expect(got).toMatchObject({ error: 'unauthorized' });
    expect(got).not.toHaveProperty('answer');
    expect(JSON.stringify(got)).not.toContain('secret-answer');
    expect(await cut).toBe('io server disconnect');

    t.reset();
    const live = await seated(await signIn('p@example.com'), tableId);
    const ok = await ask(live);
    expect(ok).toMatchObject({ ok: true });
    expect(ok).toHaveProperty('answer');
  });

  it('the periodic recheck compares the expiry with the time after its read', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    const t = clock();
    const read = inject.pauseAfter('select:auth_sessions');
    const cut = disconnected(s);
    const recheck = app.recheckSockets();
    await read.reached;
    t.advance(PAST_SESSION_EXPIRY);
    read.open();
    expect(await recheck).toBe(1);
    expect(await cut).toBe('io server disconnect');
  });

  it('the action wait covers a move released only after its socket was cut', async () => {
    const auth = await signIn('p@example.com');
    const tableId = await aiTable(auth);
    const s = await seated(auth, tableId);
    const actions = serverActions();
    const gap = holdHostToken();
    s.emit('move', { tableId, seat: 0, move: { type: 'pass', marker: 'after-cut' } }, () => {});
    await gap.reached;
    const cut = disconnected(s);
    expect((await post('/api/auth/signout', auth)).statusCode).toBe(200);
    expect(await cut).toBe('io server disconnect');

    // The move is still held: the wait must not have finished yet.
    let finished = false;
    const done = actions.settled().then(() => { finished = true; });
    await Promise.resolve();
    expect(actions.count()).toBe(1);
    expect(finished).toBe(false);
    gap.open();
    await done;
    expect(finished).toBe(true);
    expect(engine.applied.some((a) => a.move['marker'] === 'after-cut')).toBe(false);
  });
});
