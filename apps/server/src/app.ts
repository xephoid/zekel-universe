// App assembly: Fastify REST + Socket.IO over the same HTTP server.
// Auth is two cookies, universe_auth (signed-in user session) and
// universe_guest (guest cookie), both holding bearer tokens hashed at rest.

import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Server as SocketServer, Socket } from 'socket.io';
import type { Kysely } from 'kysely';
import type {
  CreateTableRequest, CreateTableResponse, FriendsResponse, GameCatalogEntry, GameReferenceResponse, GameResponse,
  GamesResponse, InvitesResponse, JoinTableAck, JoinTableMessage, MeResponse, MoveAck, MoveMessage, MyTablesResponse, QueryAck, QueryMessage,
  SeatSummary, TableEventsResponse, TableInvite, TableResponse, TableStatus, TableSummary, UndoAck, UndoMessage, GameUpdate, UpdatesResponse, DesignerResponse, WatchResponse } from '@universe/shared';
import { SOCKET_EVENTS } from '@universe/shared';
import { EngineError } from '@universe/engine-client';

import type { DB } from './db/schema.js';
import { parseJson } from './db/index.js';
import { newId, newToken, hashToken, now, type Principal } from './identity.js';
import { consumeSignInLink, issueSignInLink, RateLimiter, SESSION_TTL_MS, sweepExpired } from './auth.js';
import type { Mailer } from './email.js';
import type { EngineService } from './engine.js';
import { isHostOf, TableError, TableService, type SeatRecord, type TableRecord } from './tables/service.js';
import { Realtime, MoveError } from './realtime.js';
import { ownsSeat, toWireEvent } from './events.js';
import { originAllowed } from './sockets.js';

export const AUTH_COOKIE = 'universe_auth';
export const GUEST_COOKIE = 'universe_guest';
const GUEST_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

import { DESIGNERS, ZEKEL_GAMES, ZEKEL_UPDATES } from './storefront.js';

export interface BuildAppOptions {
  db: Kysely<DB>;
  engine: EngineService;
  mailer: Mailer;
  secretKey: string;
  /** public origin, used in sign-in links */
  appOrigin: string;
  /** origins allowed to make state-changing requests and open sockets */
  allowedOrigins: string[];
  secureCookies: boolean;
  io?: SocketServer; // injected in tests; created by index.ts in production
  logger?: boolean;
  /** abuse limits, lowered in tests */
  limits?: { guestsPerIp?: number; tablesPerPrincipal?: number; lookupsPerUser?: number; linksPerIp?: number };
  /** By-turns email nudges: how long a player must be away and up before
   *  the email goes, and how often the server looks (0 disables the timer). */
  turnNudge?: { delayMs: number; sweepMs: number };
  /** Test-only: expose the ConsoleMailer's outbox at /api/test/outbox.
   *  Must never be set in production (index.ts enforces). */
  testOutbox?: boolean;
}

export interface UniverseApp {
  fastify: FastifyInstance;
  io: SocketServer | null;
  tableService: TableService;
  realtime: Realtime;
  /** Read a request's principal from its cookie header; null when anonymous. */
  principalFromCookies(cookieHeader: string | undefined): Promise<Principal | null>;
  /** Reload the game catalog from the engine (also done on startup). */
  refreshCatalog(): Promise<number>;
  /** Send the by-turns email nudges that are due (also done on a timer). */
  sendDueNudges(): Promise<number>;
}

class HttpError extends Error {
  constructor(public statusCode: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function buildApp(opts: BuildAppOptions): UniverseApp {
  const app = Fastify({
    logger: opts.logger ?? process.env.NODE_ENV !== 'test',
    // Request logging would write sign-in tokens and cookies to logs.
    disableRequestLogging: true,
  });
  void app.register(fastifyCookie);
  const db = opts.db;

  const tableService = new TableService(db, opts.engine, opts.secretKey);
  const realtime = new Realtime(db, opts.engine, tableService, opts.mailer, { appOrigin: opts.appOrigin });

  // By turns: a player who is away when their turn comes gets one email
  // after a delay, so a quick return never draws one.
  const nudge = opts.turnNudge ?? { delayMs: 10 * 60 * 1000, sweepMs: 60 * 1000 };
  const sendDueNudges = () => realtime.sendDueNudges(nudge.delayMs);
  if (nudge.sweepMs > 0) {
    const timer = setInterval(() => { sendDueNudges().catch((err) => app.log.error(err)); }, nudge.sweepMs);
    timer.unref?.();
    app.addHook('onClose', async () => { clearInterval(timer); });
  }
  // Sign-in links: a small budget per address (it is that person's inbox)
  // and a larger one per client address, since one office or one test run
  // signs in more than one person.
  const linkLimiter = new RateLimiter(5, 15 * 60 * 1000);
  const linkIpLimiter = new RateLimiter(opts.limits?.linksPerIp ?? 30, 15 * 60 * 1000);
  const guestLimiter = new RateLimiter(opts.limits?.guestsPerIp ?? 30, 15 * 60 * 1000);
  const tableLimiter = new RateLimiter(opts.limits?.tablesPerPrincipal ?? 30, 60 * 60 * 1000);
  const referenceCache = new Map<string, GameReferenceResponse>();

  // ---- identity helpers ------------------------------------------------

  async function principalFromCookies(cookieHeader: string | undefined): Promise<Principal | null> {
    if (!cookieHeader) return null;
    const cookies = fastifyCookie.parse(cookieHeader);
    const authToken = cookies[AUTH_COOKIE];
    if (authToken) {
      const session = await db.selectFrom('auth_sessions').select(['user_id', 'expires_at'])
        .where('token_hash', '=', hashToken(authToken)).executeTakeFirst();
      if (session && new Date(session.expires_at).getTime() > Date.now()) {
        return { kind: 'user', userId: session.user_id };
      }
    }
    const guestToken = cookies[GUEST_COOKIE];
    if (guestToken) {
      const guest = await db.selectFrom('guests').select(['id', 'upgraded_to_user_id'])
        .where('token_hash', '=', hashToken(guestToken)).executeTakeFirst();
      // An upgraded guest's token is spent: its seats moved to the user, and
      // the token itself never acts as the user (that is the auth cookie's
      // job, and signing out must end it).
      if (guest && !guest.upgraded_to_user_id) return { kind: 'guest', guestId: guest.id };
    }
    return null;
  }

  function principalOf(req: FastifyRequest): Promise<Principal | null> {
    return principalFromCookies(req.headers.cookie);
  }

  async function requirePrincipal(req: FastifyRequest): Promise<Principal> {
    const p = await principalOf(req);
    if (!p) throw new HttpError(401, 'unauthorized', 'Sign in or call POST /api/guests first.');
    return p;
  }

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: opts.secureCookies,
  };

  // Every state-changing request must come from the app's own origin. The
  // cookies are SameSite=Lax already; this closes the remaining gap.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (!req.url.startsWith('/api/')) return;
    if (!originAllowed(req.headers.origin, opts.allowedOrigins)) {
      return reply.code(403).send({ error: 'origin_not_allowed' });
    }
  });

  // Security headers on every response; private API answers are never
  // cached by a shared cache. The policy allows the built app's own scripts,
  // inline styles (React style props), same-origin data, and the socket.
  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
    } else {
      reply.header('Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
        "font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    if (err instanceof TableError) return reply.code(400).send({ error: err.code, message: err.message });
    const e = err as { statusCode?: number; message?: string; code?: string };
    if (typeof e.statusCode === 'number' && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: e.code ?? 'bad_request', message: e.message });
    }
    app.log.error(err);
    return reply.code(500).send({ error: 'internal', message: 'Something went wrong on the server.' });
  });

  // Test-only outbox: lets e2e tests read sign-in links the console mailer
  // "sent". It exists only when asked for and only with a ConsoleMailer —
  // a real provider's mail is not recoverable here.
  if (opts.testOutbox) {
    const m = opts.mailer as { sent?: { to: string; subject: string; text: string }[] };
    if (!Array.isArray(m.sent)) {
      throw new Error('testOutbox requires the ConsoleMailer');
    }
    app.get('/api/test/outbox', async () => ({ mails: m.sent }));
  }

  // ---- people ------------------------------------------------------------

  app.post('/api/guests', async (req, reply) => {
    // Idempotent: a caller who already has a principal keeps it.
    const existing = await principalOf(req);
    if (existing?.kind === 'guest') {
      const g = await db.selectFrom('guests').selectAll().where('id', '=', existing.guestId).executeTakeFirst();
      if (g) return { guest: { id: g.id, displayName: g.display_name, upgradedToUserId: g.upgraded_to_user_id } };
    }
    if (existing?.kind === 'user') {
      return reply.code(409).send({ error: 'already_signed_in' });
    }
    if (!guestLimiter.allow(`ip:${req.ip}`)) {
      return reply.code(429).send({ error: 'too_many_requests', message: 'Try again in a few minutes.' });
    }
    const body = (req.body ?? {}) as { displayName?: string };
    const id = newId();
    const token = newToken();
    const displayName = body.displayName?.trim().slice(0, 40) || `Guest ${id.slice(0, 6)}`;
    await db.insertInto('guests').values({
      id, token_hash: hashToken(token), display_name: displayName, created_at: now(), upgraded_to_user_id: null,
    }).execute();
    reply.setCookie(GUEST_COOKIE, token, { ...cookieOptions, maxAge: GUEST_COOKIE_MAX_AGE_S });
    return { guest: { id, displayName, upgradedToUserId: null } };
  });

  app.get('/api/me', async (req): Promise<MeResponse> => {
    const p = await principalOf(req);
    if (!p) return { user: null, guest: null };
    if (p.kind === 'user') {
      const u = await db.selectFrom('users').selectAll().where('id', '=', p.userId).executeTakeFirst();
      return {
        user: u ? { id: u.id, displayName: u.display_name, avatarUrl: u.avatar_url, bio: u.bio, createdAt: u.created_at } : null,
        guest: null,
      };
    }
    const g = await db.selectFrom('guests').selectAll().where('id', '=', p.guestId).executeTakeFirst();
    return {
      user: null,
      guest: g ? { id: g.id, displayName: g.display_name, upgradedToUserId: g.upgraded_to_user_id } : null,
    };
  });

  app.patch('/api/me', async (req) => {
    const p = await requirePrincipal(req);
    const body = (req.body ?? {}) as { displayName?: string; bio?: string };
    const displayName = body.displayName?.trim().slice(0, 40);
    if (!displayName) throw new HttpError(400, 'display_name_required');
    if (p.kind === 'user') {
      await db.updateTable('users').set({ display_name: displayName, bio: body.bio?.slice(0, 280) ?? null })
        .where('id', '=', p.userId).execute();
    } else {
      await db.updateTable('guests').set({ display_name: displayName }).where('id', '=', p.guestId).execute();
    }
    return { ok: true };
  });

  // Passwordless email sign-in: ask for a link, then exchange it. The token
  // travels in the URL fragment, which browsers never send to the server, and
  // the landing page posts it in a body.
  app.post('/api/auth/email/link', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'email_required' });
    }
    if (!linkLimiter.allow(`email:${email}`) || !linkIpLimiter.allow(`ip:${req.ip}`)) {
      return reply.code(429).send({ error: 'too_many_requests', message: 'Try again in a few minutes.' });
    }
    await sweepExpired(db);
    const token = await issueSignInLink(db, email);
    const url = `${opts.appOrigin}/signin/complete#token=${encodeURIComponent(token)}`;
    await opts.mailer.send({
      to: email,
      subject: 'Your zekel sign-in link',
      text: `Open this link to sign in to zekel universe. It works once and expires in 15 minutes.\n\n${url}\n`,
    });
    return { ok: true };
  });

  app.post('/api/auth/email/complete', async (req, reply) => {
    const body = (req.body ?? {}) as { token?: string };
    const token = body.token ?? '';
    const email = token ? await consumeSignInLink(db, token) : null;
    if (!email) return reply.code(401).send({ error: 'invalid_or_expired_token' });

    // Find or create the user behind this email identity.
    const identity = await db.selectFrom('identities').select('user_id')
      .where('provider', '=', 'email').where('provider_subject', '=', email).executeTakeFirst();
    let userId: string;
    if (identity) {
      userId = identity.user_id;
    } else {
      userId = newId();
      await db.insertInto('users').values({
        id: userId, display_name: email.split('@')[0] ?? 'Player', avatar_url: null, bio: null, created_at: now(),
      }).execute();
      await db.insertInto('identities').values({
        id: newId(), user_id: userId, provider: 'email', provider_subject: email,
      }).execute();
    }

    // A guest cookie on this request keeps its seats, its tables and its
    // notifications: everything moves to the user.
    const guestToken = req.cookies[GUEST_COOKIE];
    if (guestToken) {
      const guest = await db.selectFrom('guests').select(['id', 'upgraded_to_user_id'])
        .where('token_hash', '=', hashToken(guestToken)).executeTakeFirst();
      if (guest && !guest.upgraded_to_user_id) {
        await db.updateTable('guests').set({ upgraded_to_user_id: userId }).where('id', '=', guest.id).execute();
        await db.updateTable('seats').set({ user_id: userId, guest_id: null }).where('guest_id', '=', guest.id).execute();
        await db.updateTable('tables').set({ host_user_id: userId, host_guest_id: null }).where('host_guest_id', '=', guest.id).execute();
        await db.updateTable('notifications').set({ user_id: userId, guest_id: null }).where('guest_id', '=', guest.id).execute();
      }
    }

    const sessionToken = newToken();
    await db.insertInto('auth_sessions').values({
      id: newId(), user_id: userId, token_hash: hashToken(sessionToken), created_at: now(),
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    }).execute();
    reply.setCookie(AUTH_COOKIE, sessionToken, { ...cookieOptions, maxAge: Math.floor(SESSION_TTL_MS / 1000) });
    return { ok: true, userId };
  });

  app.post('/api/auth/signout', async (req, reply) => {
    const token = req.cookies[AUTH_COOKIE];
    if (token) await db.deleteFrom('auth_sessions').where('token_hash', '=', hashToken(token)).execute();
    reply.clearCookie(AUTH_COOKIE, { path: '/' });
    // The guest cookie that was upgraded into this account is spent too.
    reply.clearCookie(GUEST_COOKIE, { path: '/' });
    return { ok: true };
  });

  // ---- friends -----------------------------------------------------------
  // Friends are signed-in users only (guests have no stable identity to
  // address). A request is addressed by the friend's sign-in email; that is
  // deliberately the one discovery channel in v0, and it is rate limited so
  // it cannot be trawled. Accepting a request when the other side already
  // asked turns both rows into one accepted friendship.

  async function requireUser(req: FastifyRequest): Promise<{ userId: string }> {
    const p = await requirePrincipal(req);
    if (p.kind !== 'user') throw new HttpError(403, 'sign_in_required', 'Friends need an account. Sign in first.');
    return { userId: p.userId };
  }

  async function userByEmail(email: string) {
    const identity = await db.selectFrom('identities').select('user_id')
      .where('provider', '=', 'email').where('provider_subject', '=', email).executeTakeFirst();
    if (!identity) return undefined;
    return db.selectFrom('users').select(['id', 'display_name']).where('id', '=', identity.user_id).executeTakeFirst();
  }

  async function friendshipBetween(a: string, b: string) {
    return db.selectFrom('friendships').selectAll()
      .where(({ eb, or, and }) => or([
        and([eb('requester_id', '=', a), eb('addressee_id', '=', b)]),
        and([eb('requester_id', '=', b), eb('addressee_id', '=', a)]),
      ])).executeTakeFirst();
  }

  // One budget for every lookup of another account by email address (friend
  // requests and invites): the answer says whether an address has an account,
  // so the budget is what stops trawling.
  const lookupLimiter = new RateLimiter(opts.limits?.lookupsPerUser ?? 20, 15 * 60 * 1000);

  app.get('/api/friends', async (req) => {
    const { userId } = await requireUser(req);
    const rows = await db.selectFrom('friendships').selectAll()
      .where(({ eb, or }) => or([eb('requester_id', '=', userId), eb('addressee_id', '=', userId)]))
      .execute();
    const otherIds = rows.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    const users = otherIds.length
      ? await db.selectFrom('users').select(['id', 'display_name']).where('id', 'in', otherIds).execute()
      : [];
    const nameOf = (id: string) => users.find((u) => u.id === id)?.display_name ?? 'Player';
    const friends: FriendsResponse['friends'] = [];
    const incoming: FriendsResponse['incoming'] = [];
    const outgoing: FriendsResponse['outgoing'] = [];
    for (const r of rows) {
      const other = r.requester_id === userId ? r.addressee_id : r.requester_id;
      if (r.status === 'accepted') {
        friends.push({ userId: other, displayName: nameOf(other), since: r.created_at });
      } else if (r.requester_id === userId) {
        outgoing.push({ id: r.id, userId: other, displayName: nameOf(other), createdAt: r.created_at });
      } else {
        incoming.push({ id: r.id, userId: other, displayName: nameOf(other), createdAt: r.created_at });
      }
    }
    return { friends, incoming, outgoing } satisfies FriendsResponse;
  });

  app.post('/api/friends/requests', async (req, reply) => {
    const { userId } = await requireUser(req);
    if (!lookupLimiter.allow(`user:${userId}`)) {
      throw new HttpError(429, 'too_many_requests', 'Try again in a few minutes.');
    }
    const body = (req.body ?? {}) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'email_required');
    const other = await userByEmail(email);
    if (!other) return reply.code(404).send({ error: 'no_user', message: 'No account with that address. They may still join by lobby link.' });
    if (other.id === userId) return reply.code(400).send({ error: 'cannot_friend_self' });
    const existing = await friendshipBetween(userId, other.id);
    if (existing) {
      if (existing.status === 'accepted') return reply.code(409).send({ error: 'already_friends' });
      if (existing.requester_id === userId) return reply.code(409).send({ error: 'already_requested' });
      // Cross-request: they asked first, so this accepts.
      await db.updateTable('friendships').set({ status: 'accepted' }).where('id', '=', existing.id).execute();
      return { ok: true, accepted: true, userId: other.id };
    }
    await db.insertInto('friendships').values({
      id: newId(), requester_id: userId, addressee_id: other.id, status: 'pending', created_at: now(),
    }).execute();
    return { ok: true, accepted: false, userId: other.id };
  });

  app.post('/api/friends/requests/:id/accept', async (req) => {
    const { userId } = await requireUser(req);
    const { id } = req.params as { id: string };
    const row = await db.selectFrom('friendships').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row || row.addressee_id !== userId || row.status !== 'pending') throw new HttpError(404, 'no_request');
    await db.updateTable('friendships').set({ status: 'accepted' }).where('id', '=', id).execute();
    return { ok: true };
  });

  // Decline an incoming request, cancel an outgoing one, or end a friendship:
  // one delete, checked to involve the caller on its own side.
  app.delete('/api/friends/requests/:id', async (req) => {
    const { userId } = await requireUser(req);
    const { id } = req.params as { id: string };
    const row = await db.selectFrom('friendships').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw new HttpError(404, 'no_request');
    const mine = row.addressee_id === userId || row.requester_id === userId;
    if (!mine) throw new HttpError(404, 'no_request');
    await db.deleteFrom('friendships').where('id', '=', id).execute();
    return { ok: true };
  });

  app.delete('/api/friends/:userId', async (req) => {
    const { userId } = await requireUser(req);
    const { userId: otherId } = req.params as { userId: string };
    const row = await friendshipBetween(userId, otherId);
    if (!row || row.status !== 'accepted') throw new HttpError(404, 'no_friendship');
    await db.deleteFrom('friendships').where('id', '=', row.id).execute();
    return { ok: true };
  });

  // ---- invites -------------------------------------------------------------
  // An invite names a table and an account. The recipient accepts to take an
  // open seat (the same path as joining by link) or declines. Anyone seated
  // at the table can invite while it is in the lobby.

  async function inviteToWire(row: { id: string; table_id: string; from_user_id: string; to_user_id: string; status: string }, includeTo: boolean): Promise<TableInvite> {
    const [table, from, to] = await Promise.all([
      db.selectFrom('tables').selectAll().where('id', '=', row.table_id).executeTakeFirst(),
      db.selectFrom('users').select(['display_name']).where('id', '=', row.from_user_id).executeTakeFirst(),
      db.selectFrom('users').select(['display_name']).where('id', '=', row.to_user_id).executeTakeFirst(),
    ]);
    const game = table
      ? await db.selectFrom('games').select('name').where('engine_game_id', '=', table.game_id).executeTakeFirst()
      : null;
    return {
      id: row.id,
      tableId: row.table_id,
      gameName: game?.name ?? table?.game_id ?? 'A table',
      fromDisplayName: from?.display_name ?? 'A player',
      ...(includeTo ? { toDisplayName: to?.display_name ?? 'A player' } : {}),
      status: row.status as TableInvite['status'],
    };
  }

  app.post('/api/tables/:id/invites', async (req, reply) => {
    const { userId } = await requireUser(req);
    const { id: tableId } = req.params as { id: string };
    const body = (req.body ?? {}) as { email?: string; userId?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email && !body.userId) throw new HttpError(400, 'email_required');
    const table = await tableService.getTable(tableId);
    if (!table) throw new HttpError(404, 'no_table');
    if (table.status !== 'lobby') throw new HttpError(400, 'already_started', 'This table has already started; share a spectator link later.');
    const mine = (await tableService.getSeats(tableId)).find((s) => s.userId === userId);
    if (!mine) throw new HttpError(403, 'not_seated', 'Only players at this table can invite to it');
    if (email && !lookupLimiter.allow(`user:${userId}`)) {
      throw new HttpError(429, 'too_many_requests', 'Try again in a few minutes.');
    }
    let to: { id: string; display_name: string } | undefined;
    if (body.userId) {
      // Inviting by id is for friends picked from a list: the user id alone
      // must not be a discovery channel, so only an accepted friend resolves.
      const f = await friendshipBetween(userId, body.userId);
      if (!f || f.status !== 'accepted') return reply.code(404).send({ error: 'no_user' });
      to = await db.selectFrom('users').select(['id', 'display_name']).where('id', '=', body.userId).executeTakeFirst();
    } else {
      to = await userByEmail(email!);
    }
    if (!to) return reply.code(404).send({ error: 'no_user', message: 'No account with that address. The lobby link works for them instead.' });
    if (to.id === userId) return reply.code(400).send({ error: 'cannot_invite_self' });
    const seats = await tableService.getSeats(tableId);
    if (seats.some((s) => s.userId === to.id)) return reply.code(409).send({ error: 'already_seated', message: 'They already have a seat at this table.' });
    if (!seats.some((s) => s.kind === 'human' && !s.userId && !s.guestId)) {
      return reply.code(409).send({ error: 'table_full', message: 'No open seats at this table.' });
    }
    const existing = await db.selectFrom('invites').selectAll()
      .where('table_id', '=', tableId).where('to_user_id', '=', to.id).where('status', '=', 'pending').executeTakeFirst();
    if (existing) return reply.code(409).send({ error: 'already_invited' });
    const inviteId = newId();
    await db.insertInto('invites').values({ id: inviteId, table_id: tableId, from_user_id: userId, to_user_id: to.id, status: 'pending' }).execute();
    await db.insertInto('notifications').values({
      id: newId(), user_id: to.id, guest_id: null, kind: 'invite', table_id: tableId, read: 0, created_at: now(),
    }).execute();
    return { ok: true, inviteId };
  });

  app.get('/api/tables/:id/invites', async (req) => {
    const { userId } = await requireUser(req);
    const { id: tableId } = req.params as { id: string };
    const mine = (await tableService.getSeats(tableId)).find((s) => s.userId === userId);
    if (!mine) throw new HttpError(403, 'not_seated');
    const rows = await db.selectFrom('invites').selectAll().where('table_id', '=', tableId).execute();
    const invites: TableInvite[] = [];
    for (const r of rows) invites.push(await inviteToWire(r, true));
    return { invites } satisfies InvitesResponse;
  });

  app.get('/api/invites', async (req) => {
    const { userId } = await requireUser(req);
    const rows = await db.selectFrom('invites').selectAll()
      .where('to_user_id', '=', userId).where('status', '=', 'pending').execute();
    const invites: TableInvite[] = [];
    for (const r of rows) invites.push(await inviteToWire(r, false));
    return { invites } satisfies InvitesResponse;
  });

  app.post('/api/invites/:id/accept', async (req) => {
    const { userId } = await requireUser(req);
    const { id } = req.params as { id: string };
    const row = await db.selectFrom('invites').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row || row.to_user_id !== userId || row.status !== 'pending') throw new HttpError(404, 'no_invite');
    // Accepting is joining: an open seat is taken or it fails the same way.
    await tableService.joinTable({ kind: 'user', userId }, row.table_id);
    await db.updateTable('invites').set({ status: 'accepted' }).where('id', '=', id).execute();
    return { ok: true, tableId: row.table_id };
  });

  app.post('/api/invites/:id/decline', async (req) => {
    const { userId } = await requireUser(req);
    const { id } = req.params as { id: string };
    const row = await db.selectFrom('invites').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row || row.to_user_id !== userId || row.status !== 'pending') throw new HttpError(404, 'no_invite');
    await db.updateTable('invites').set({ status: 'declined' }).where('id', '=', id).execute();
    return { ok: true };
  });

  // ---- catalog -----------------------------------------------------------------

  function catalogEntry(g: DB['games']): GameCatalogEntry {
    return {
      engineGameId: g.engine_game_id,
      name: g.name,
      designerName: g.designer_name,
      playerCount: g.player_count,
      minPlayers: g.min_players,
      maxPlayers: g.max_players,
      supportsAi: g.supports_ai === 1,
      playTime: g.play_time,
      tags: parseJson<string[]>(g.tags, []),
      coverImage: g.cover_image,
      description: g.description,
      rulesUrl: g.rules_url,
      visibility: g.visibility === 'unlisted' ? 'unlisted' : 'public',
      designerSlug: Object.values(DESIGNERS).find((d) => d.name === g.designer_name)?.slug ?? null,
    };
  }

  function updateEntry(u: DB['game_updates'], gameName: string): GameUpdate {
    return { id: u.id, gameId: u.game_id, gameName, title: u.title, body: u.body, postedAt: u.posted_at };
  }

  /** Updates newest first, with their game's name; optionally one game's. */
  async function listUpdates(gameId?: string, limit = 50): Promise<GameUpdate[]> {
    let q = db.selectFrom('game_updates').innerJoin('games', 'games.engine_game_id', 'game_updates.game_id')
      .select(['game_updates.id', 'game_updates.game_id', 'game_updates.title', 'game_updates.body', 'game_updates.posted_at', 'games.name'])
      .orderBy('game_updates.posted_at', 'desc').limit(limit);
    if (gameId) q = q.where('game_updates.game_id', '=', gameId);
    const rows = await q.execute();
    return rows.map((r) => updateEntry({ id: r.id, game_id: r.game_id, title: r.title, body: r.body, posted_at: r.posted_at }, r.name));
  }

  // Refresh the catalog from the engine's list; the extra fields stay local.
  async function refreshCatalog(): Promise<number> {
    const listed = await opts.engine.listGames();
    for (const g of listed.games) {
      const playerCount = g.min_players === g.max_players
        ? String(g.min_players)
        : `${g.min_players}–${g.max_players}`;
      const existing = await db.selectFrom('games').select('engine_game_id')
        .where('engine_game_id', '=', g.game_id).executeTakeFirst();
      const shared = {
        name: g.name ?? g.game_id,
        player_count: playerCount,
        min_players: g.min_players,
        max_players: g.max_players,
        supports_ai: g.supports_ai ? 1 : 0,
      };
      const own = ZEKEL_GAMES[g.game_id];
      const designerName = own ? DESIGNERS[own.designer]?.name ?? '' : '';
      if (existing) {
        await db.updateTable('games').set({
          ...shared,
          ...(own ? { designer_name: designerName, description: own.description, play_time: own.playTime, tags: JSON.stringify(own.tags) } : {}),
        }).where('engine_game_id', '=', g.game_id).execute();
      } else {
        await db.insertInto('games').values({
          engine_game_id: g.game_id,
          ...shared,
          designer_name: designerName,
          play_time: own?.playTime ?? '',
          tags: JSON.stringify(own?.tags ?? []),
          cover_image: null,
          description: own?.description ?? g.description ?? '',
          rules_url: null,
          visibility: 'public',
        }).execute();
      }
    }
    // The designer's posts, once each; a game the engine no longer lists
    // keeps no posts.
    const known = new Set(listed.games.map((g) => g.game_id));
    for (const u of ZEKEL_UPDATES) {
      if (!known.has(u.gameId)) continue;
      const have = await db.selectFrom('game_updates').select('id').where('id', '=', u.id).executeTakeFirst();
      if (have) continue;
      await db.insertInto('game_updates').values({ id: u.id, game_id: u.gameId, title: u.title, body: u.body, posted_at: u.postedAt }).execute();
    }
    return listed.games.length;
  }

  // ---- storefront ---------------------------------------------------------------

  app.get('/api/updates', async (req): Promise<UpdatesResponse> => {
    const q = req.query as { limit?: string };
    const limit = Math.max(1, Math.min(100, Number(q.limit) || 20));
    return { updates: await listUpdates(undefined, limit) };
  });

  app.get('/api/games/:id/updates', async (req): Promise<UpdatesResponse> => {
    const { id } = req.params as { id: string };
    const g = await db.selectFrom('games').select('engine_game_id').where('engine_game_id', '=', id).executeTakeFirst();
    if (!g) throw new HttpError(404, 'no_game');
    return { updates: await listUpdates(id) };
  });

  app.get('/api/designers/:slug', async (req): Promise<DesignerResponse> => {
    const { slug } = req.params as { slug: string };
    const designer = DESIGNERS[slug];
    if (!designer) throw new HttpError(404, 'no_designer');
    const rows = await db.selectFrom('games').selectAll().where('designer_name', '=', designer.name).orderBy('name', 'asc').execute();
    const games = rows.map(catalogEntry);
    const updates = (await listUpdates()).filter((u) => games.some((g) => g.engineGameId === u.gameId));
    return { designer, games, updates };
  });

  // Anyone with a table's link may watch it: the engine's public view (it
  // omits hidden information), the seats by display name, and the log of
  // event summaries. No seat's payload is ever read here, and the engine is
  // asked at most once every two seconds per table.
  const watchCache = new Map<string, { at: number; seq: number; view: unknown }>();
  app.get('/api/tables/:id/watch', async (req, reply): Promise<WatchResponse> => {
    const { id } = req.params as { id: string };
    const table = await tableService.getTable(id);
    if (!table) throw new HttpError(404, 'no_table');
    const seats = await tableService.getSeats(id);
    const names = await displayNamesFor(seats);
    const game = await db.selectFrom('games').select('name').where('engine_game_id', '=', table.gameId).executeTakeFirst();
    const events = await realtime.eventsAfter(id, 0);
    const last = events[events.length - 1];
    let view: unknown = null;
    if (table.engineSessionId && last) {
      const cached = watchCache.get(id);
      if (cached && cached.seq === last.seq && Date.now() - cached.at < 2000) {
        view = cached.view;
      } else {
        try {
          view = await opts.engine.getPublicView(table.gameId, table.engineSessionId);
        } catch (err) {
          app.log.warn(err);
          throw new HttpError(503, 'engine_unavailable', 'The rules engine did not answer. Try again in a moment.');
        }
        watchCache.set(id, { at: Date.now(), seq: last.seq, view });
      }
    }
    void reply.header('cache-control', 'no-store');
    return {
      table: {
        id: table.id, gameId: table.gameId, gameName: game?.name ?? table.gameId, mode: table.mode, status: table.status,
        nextActorPosition: table.nextActorPosition, result: table.result,
      },
      seats: seats.map((s) => ({
        position: s.position, kind: s.kind, aiDifficulty: s.aiDifficulty,
        displayName: s.kind === 'ai' ? `AI${s.aiDifficulty ? ` (${s.aiDifficulty})` : ''}` : names.get(s.position) ?? null,
      })),
      view,
      log: events.slice(-40).reverse().map((e) => ({ seq: e.seq, kind: e.kind, summary: e.summary, actorSeatPosition: e.actorSeatPosition, createdAt: e.createdAt })),
      seq: last?.seq ?? 0,
    };
  });

  app.get('/api/games', async (): Promise<GamesResponse> => {
    const rows = await db.selectFrom('games').selectAll().orderBy('name', 'asc').execute();
    return { games: rows.map(catalogEntry) };
  });

  app.get('/api/games/:id', async (req): Promise<GameResponse> => {
    const { id } = req.params as { id: string };
    const g = await db.selectFrom('games').selectAll().where('engine_game_id', '=', id).executeTakeFirst();
    if (!g) throw new HttpError(404, 'no_game');
    return { game: catalogEntry(g) };
  });

  app.get('/api/games/:id/reference', async (req): Promise<GameReferenceResponse> => {
    const { id } = req.params as { id: string };
    const cached = referenceCache.get(id);
    if (cached) return cached;
    const g = await db.selectFrom('games').select('engine_game_id').where('engine_game_id', '=', id).executeTakeFirst();
    if (!g) throw new HttpError(404, 'no_game');
    const [rules, listed] = await Promise.all([opts.engine.getRules(id), opts.engine.listGames()]);
    const meta = listed.games.find((x) => x.game_id === id);
    const ref: GameReferenceResponse = {
      gameId: id,
      rules: rules.rules,
      referenceData: rules.reference_data ?? null,
      moveSchema: rules.move_schema ?? null,
      optionsSchema: meta?.options_schema ?? null,
    };
    referenceCache.set(id, ref);
    return ref;
  });

  // ---- tables ------------------------------------------------------------------

  async function displayNamesFor(seats: SeatRecord[]): Promise<Map<number, string | null>> {
    const names = new Map<number, string | null>();
    const userIds = seats.map((s) => s.userId).filter((x): x is string => !!x);
    const guestIds = seats.map((s) => s.guestId).filter((x): x is string => !!x);
    const users = userIds.length
      ? await db.selectFrom('users').select(['id', 'display_name']).where('id', 'in', userIds).execute()
      : [];
    const guests = guestIds.length
      ? await db.selectFrom('guests').select(['id', 'display_name']).where('id', 'in', guestIds).execute()
      : [];
    for (const s of seats) {
      const name = s.userId
        ? users.find((u) => u.id === s.userId)?.display_name
        : s.guestId
          ? guests.find((g) => g.id === s.guestId)?.display_name
          : null;
      names.set(s.position, name ?? null);
    }
    return names;
  }

  async function tableSummary(table: TableRecord, seats: SeatRecord[], p: Principal): Promise<TableSummary> {
    const game = await db.selectFrom('games').select('name').where('engine_game_id', '=', table.gameId).executeTakeFirst();
    const next = table.nextActorPosition === null ? null : seats.find((s) => s.position === table.nextActorPosition);
    return {
      id: table.id,
      gameId: table.gameId,
      gameName: game?.name ?? table.gameId,
      mode: table.mode,
      status: table.status,
      createdAt: table.createdAt,
      finishedAt: table.finishedAt,
      hostIsMe: isHostOf(table, p),
      nextActorPosition: table.nextActorPosition,
      waitingOnMe: !!next && ownsSeat(next, p),
      deletable: isHostOf(table, p) && seats.every((s) => s.kind === 'ai' || !(s.userId || s.guestId) || ownsSeat(s, p)),
    };
  }

  app.post('/api/tables', async (req): Promise<CreateTableResponse> => {
    const p = await requirePrincipal(req);
    if (!tableLimiter.allow(p.kind === 'user' ? `user:${p.userId}` : `guest:${p.guestId}`)) {
      throw new HttpError(429, 'too_many_requests', 'You have opened many tables recently. Try again later.');
    }
    const body = (req.body ?? {}) as Partial<CreateTableRequest>;
    if (!body.gameId || !body.mode || !Array.isArray(body.seats) || body.hostPosition === undefined) {
      throw new HttpError(400, 'bad_request', 'gameId, mode, seats and hostPosition are required');
    }
    const setupMoves = Array.isArray(body.setupMoves) ? body.setupMoves : [];
    if (setupMoves.length > 20 || setupMoves.some((m) => !m || typeof m !== 'object' || Array.isArray(m))) {
      throw new HttpError(400, 'bad_request', 'setupMoves must be a short list of move objects');
    }
    try {
      return await tableService.createTable(p, {
        gameId: body.gameId,
        mode: body.mode,
        seatSpecs: body.seats,
        hostPosition: body.hostPosition,
        options: body.options && typeof body.options === 'object' ? body.options : {},
        setupMoves,
      });
    } catch (err) {
      // A setup choice the engine refused reads as a rule, not a fault.
      if (err instanceof EngineError && err.isRuleRejection) throw new HttpError(422, 'setup_rejected', err.message);
      throw err;
    }
  });

  app.delete('/api/tables/:id', async (req) => {
    const p = await requirePrincipal(req);
    const { id } = req.params as { id: string };
    const table = await tableService.getTable(id);
    if (!table) throw new HttpError(404, 'no_table');
    try {
      await tableService.deleteTable(p, id);
    } catch (err) {
      if (err instanceof TableError && err.code === 'cannot_delete') throw new HttpError(403, err.code, err.message);
      throw err;
    }
    return { ok: true };
  });

  app.post('/api/tables/:id/join', async (req) => {
    const p = await requirePrincipal(req);
    const { id } = req.params as { id: string };
    return tableService.joinTable(p, id);
  });

  app.post('/api/tables/:id/ready', async (req) => {
    const p = await requirePrincipal(req);
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { ready?: boolean };
    return tableService.setReady(p, id, body.ready !== false);
  });

  app.post('/api/tables/:id/start', async (req) => {
    const p = await requirePrincipal(req);
    const { id } = req.params as { id: string };
    return tableService.startTable(p, id);
  });

  app.get('/api/tables/:id', async (req): Promise<TableResponse> => {
    const p = await requirePrincipal(req);
    const { id } = req.params as { id: string };
    const table = await tableService.getTable(id);
    if (!table) throw new HttpError(404, 'no_table');
    const seats = await tableService.getSeats(id);
    const names = await displayNamesFor(seats);
    const seatSummaries: SeatSummary[] = seats.map((s) => ({
      position: s.position,
      kind: s.kind,
      aiDifficulty: s.aiDifficulty,
      ready: s.ready,
      mine: ownsSeat(s, p),
      taken: s.userId !== null || s.guestId !== null,
      displayName: s.kind === 'ai' ? `AI${s.aiDifficulty ? ` (${s.aiDifficulty})` : ''}` : names.get(s.position) ?? null,
    }));
    return {
      table: await tableSummary(table, seats, p),
      seats: seatSummaries,
      mySeats: seats.filter((s) => ownsSeat(s, p)).map((s) => s.position),
    };
  });

  // Per-seat event feed: only the requesting seat's payload is included.
  app.get('/api/tables/:id/events', async (req): Promise<TableEventsResponse> => {
    const p = await requirePrincipal(req);
    const { id } = req.params as { id: string };
    const { after } = req.query as { after?: string };
    const table = await tableService.getTable(id);
    if (!table) throw new HttpError(404, 'no_table');
    const mine = (await tableService.getSeats(id)).filter((s) => ownsSeat(s, p));
    if (mine.length === 0) throw new HttpError(403, 'not_seated', 'Only players at this table can read it');
    const seatPosition = mine[0]!.position;
    const events = await realtime.eventsAfter(id, Number(after ?? 0) || 0);
    return { events: events.map((e) => toWireEvent(e, seatPosition)) };
  });

  app.get('/api/my-tables', async (req): Promise<MyTablesResponse> => {
    const p = await requirePrincipal(req);
    const mySeats = await db.selectFrom('seats').select('table_id')
      .where(p.kind === 'user' ? 'user_id' : 'guest_id', '=', p.kind === 'user' ? p.userId : p.guestId)
      .execute();
    const tableIds = [...new Set(mySeats.map((s) => s.table_id))];
    if (tableIds.length === 0) return { tables: [] };
    const rows = await db.selectFrom('tables').selectAll()
      .where('id', 'in', tableIds)
      .orderBy('created_at', 'desc')
      .execute();
    const tables: TableSummary[] = [];
    for (const row of rows) {
      const table = await tableService.getTable(row.id);
      if (!table) continue;
      const seats = await tableService.getSeats(row.id);
      tables.push(await tableSummary(table, seats, p));
    }
    return { tables };
  });

  // ---- Socket.IO ----------------------------------------------------------

  const io: SocketServer | null = opts.io ?? null;
  if (io) wireSockets(io);

  function wireSockets(server: SocketServer): void {
    // Each socket remembers, per table, which seat it owns there. A socket
    // subscribed to two tables never has one table's seat used for the other.
    type SeatMap = Map<string, number>;
    const seatsOf = (socket: Socket): SeatMap => {
      if (!socket.data.seats) socket.data.seats = new Map<string, number>();
      return socket.data.seats as SeatMap;
    };

    realtime.onBroadcast((tableId, event) => {
      const room = server.sockets.adapter.rooms.get(`table:${tableId}`);
      if (!room) return;
      for (const socketId of room) {
        const socket = server.sockets.sockets.get(socketId);
        if (!socket) continue;
        const seat = seatsOf(socket).get(tableId);
        if (seat === undefined) continue; // not seated here: nothing to send
        socket.emit(SOCKET_EVENTS.tableEvent, toWireEvent(event, seat));
      }
    });

    server.use((socket, next) => {
      void principalFromCookies(socket.handshake.headers.cookie).then((p) => {
        if (!p) return next(new Error('unauthorized'));
        socket.data.principal = p;
        next();
      }).catch((err: Error) => next(err));
    });

    server.on('connection', (socket: Socket) => {
      const principal = socket.data.principal as Principal;

      socket.on(SOCKET_EVENTS.joinTable, async (msg: Partial<JoinTableMessage>, ack?: (r: JoinTableAck) => void) => {
        const respond = ack ?? (() => {});
        try {
          const tableId = msg?.tableId;
          if (!tableId) return respond({ error: 'bad_request' });
          const table = await tableService.getTable(tableId);
          if (!table) return respond({ error: 'no_table' });
          const mine = (await tableService.getSeats(tableId)).filter((s) => ownsSeat(s, principal));
          // v0 tables are not spectatable: a connection without a seat here
          // gets nothing, not even the move stream.
          if (mine.length === 0) return respond({ error: 'not_seated', message: 'You hold no seat at this table' });
          seatsOf(socket).set(tableId, mine[0]!.position);
          await socket.join(`table:${tableId}`);
          realtime.markConnected(tableId, principal);
          // Replay missed events so a reconnecting browser catches up.
          const missed = await realtime.eventsAfter(tableId, Number(msg.lastSeenSeq ?? 0) || 0);
          for (const e of missed) socket.emit(SOCKET_EVENTS.tableEvent, toWireEvent(e, mine[0]!.position));
          respond({ ok: true, seats: mine.map((s) => s.position), status: table.status as TableStatus });
          // Being here answers this table's notifications; and if a restart
          // left the table between events, the engine's next step is written
          // now and reaches this socket like any other event.
          await realtime.markNotificationsRead(tableId, principal);
          realtime.resumeTable(tableId).catch((err) => app.log.error(err));
        } catch (err) {
          app.log.error(err);
          respond({ error: 'internal' });
        }
      });

      socket.on(SOCKET_EVENTS.leaveTable, async (msg: { tableId?: string }) => {
        const tableId = msg?.tableId;
        if (!tableId) return;
        seatsOf(socket).delete(tableId);
        await socket.leave(`table:${tableId}`);
        realtime.markDisconnected(tableId, principal);
      });

      socket.on(SOCKET_EVENTS.move, async (msg: Partial<MoveMessage>, ack?: (r: MoveAck) => void) => {
        const respond = ack ?? (() => {});
        try {
          if (!msg?.tableId || typeof msg.seat !== 'number' || !msg.move || typeof msg.move !== 'object') {
            return respond({ error: 'bad_request' });
          }
          const result = await realtime.handleMove(principal, msg.tableId, msg.seat, msg.move);
          respond({ ok: true, lastSeq: result.lastSeq });
        } catch (err) {
          if (err instanceof MoveError) {
            respond({ error: err.code, reason: err.reason ?? err.message, lesson: err.lesson, legalMoves: err.legalMoves });
          } else {
            app.log.error(err);
            respond({ error: 'internal', reason: 'Something went wrong on the server.' });
          }
        }
      });

      // A read-only question about a decision being composed. Bounded: a short
      // name and a small argument object; the engine answers or refuses.
      socket.on(SOCKET_EVENTS.query, async (msg: Partial<QueryMessage>, ack?: (r: QueryAck) => void) => {
        const respond = ack ?? (() => {});
        try {
          const args = msg?.args ?? {};
          if (!msg?.tableId || typeof msg.seat !== 'number' || typeof msg.name !== 'string'
            || msg.name.length === 0 || msg.name.length > 64 || typeof args !== 'object' || Array.isArray(args)
            || JSON.stringify(args).length > 4096) {
            return respond({ error: 'bad_request' });
          }
          const answer = await realtime.handleQuery(principal, msg.tableId, msg.seat, msg.name, args as Record<string, unknown>);
          respond({ ok: true, answer });
        } catch (err) {
          if (err instanceof MoveError) respond({ error: err.code, reason: err.reason ?? err.message });
          else {
            app.log.error(err);
            respond({ error: 'internal', reason: 'Something went wrong on the server.' });
          }
        }
      });

      socket.on(SOCKET_EVENTS.undo, async (msg: Partial<UndoMessage>, ack?: (r: UndoAck) => void) => {
        const respond = ack ?? (() => {});
        try {
          if (!msg?.tableId) return respond({ error: 'bad_request' });
          const result = await realtime.handleUndo(principal, msg.tableId);
          respond({ ok: true, seq: result.seq });
        } catch (err) {
          if (err instanceof MoveError) respond({ error: err.code, message: err.message });
          else {
            app.log.error(err);
            respond({ error: 'internal' });
          }
        }
      });

      socket.on('disconnect', () => {
        for (const tableId of seatsOf(socket).keys()) realtime.markDisconnected(tableId, principal);
      });
    });
  }

  // In production the server also serves the built frontend. In dev, Vite
  // serves it, so this only runs when the build output is actually there.
  const webDist = path.resolve(import.meta.dirname, '../../web/dist');
  if (process.env.NODE_ENV === 'production' && existsSync(webDist)) {
    void app.register(fastifyStatic, { root: webDist });
    // Client-side routing: any GET that is not /api/* gets index.html back.
    app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'not_found' });
    });
  }

  return { fastify: app, io, tableService, realtime, principalFromCookies, refreshCatalog, sendDueNudges };
}
