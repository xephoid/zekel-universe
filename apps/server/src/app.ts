// App assembly: Fastify REST + Socket.IO over the same HTTP server.
// Auth is two cookies, universe_auth (signed-in user session) and
// universe_guest (guest cookie), both holding bearer tokens hashed at rest.

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Socket } from 'socket.io';
import { Server as SocketServer } from 'socket.io';
import { eq, and, or, inArray } from 'drizzle-orm';

import type { DatabaseClient } from './db/index.js';
import {
  users, identities, authSessions, guests, games, tables, seats, notifications,
} from './db/schema.js';
import { newId, newToken, hashToken, now, type Principal } from './identity.js';
import { issueLinkToken, consumeLinkToken, type EmailLinker } from './auth.js';
import type { EmailSender } from './email.js';
import { EngineService } from './engine.js';
import { TableService, TableError, type SeatSpec } from './tables/service.js';
import { Realtime, MoveError } from './realtime.js';
import { ownsSeat, toWireEvent } from './events.js';

const AUTH_COOKIE = 'universe_auth';
const GUEST_COOKIE = 'universe_guest';
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

export interface BuildAppOptions {
  db: DatabaseClient;
  engine: EngineService;
  emailLinker: EmailLinker;
  emailSender: EmailSender;
  secretKey: string;
  io?: SocketServer; // injected in tests; created by index.ts in production
}

export interface UniverseApp {
  fastify: FastifyInstance;
  io: SocketServer | null;
  tableService: TableService;
  realtime: Realtime;
  /** Read a request's principal from its cookies; null when anonymous. */
  principalFromHeaders(cookieHeader: string | undefined, url?: string): Principal | null;
  /** Reload the game catalog from the engine (also done on startup). */
  refreshCatalog(): Promise<number>;
}

export function buildApp(opts: BuildAppOptions): UniverseApp {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  void app.register(fastifyCookie);

  const tableService = new TableService(opts.db, opts.engine, opts.secretKey);
  const realtime = new Realtime(opts.db, opts.engine, tableService, opts.emailSender);

  // ---- identity helpers ------------------------------------------------

  function principalFromHeaders(cookieHeader: string | undefined, _url?: string): Principal | null {
    if (!cookieHeader) return null;
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((p) => {
        const idx = p.indexOf('=');
        return [p.slice(0, idx).trim(), decodeURIComponent(p.slice(idx + 1).trim())] as const;
      }),
    );
    const authToken = cookies[AUTH_COOKIE];
    if (authToken) {
      const session = opts.db.select().from(authSessions)
        .where(eq(authSessions.tokenHash, hashToken(authToken))).get();
      if (session) return { kind: 'user', userId: session.userId };
    }
    const guestToken = cookies[GUEST_COOKIE];
    if (guestToken) {
      const guest = opts.db.select().from(guests)
        .where(eq(guests.tokenHash, hashToken(guestToken))).get();
      if (guest) {
        if (guest.upgradedToUserId) return { kind: 'user', userId: guest.upgradedToUserId };
        return { kind: 'guest', guestId: guest.id };
      }
    }
    return null;
  }

  function principalOf(req: FastifyRequest): Principal | null {
    return principalFromHeaders(req.headers.cookie, req.url);
  }

  function requirePrincipal(req: FastifyRequest): Principal {
    const p = principalOf(req);
    if (!p) throw Object.assign(new Error('Sign in or call POST /api/guests first.'), { statusCode: 401 });
    return p;
  }

  // ---- REST --------------------------------------------------------------

  const publicGameFields = {
    engineGameId: games.engineGameId,
    name: games.name,
    designerName: games.designerName,
    playerCount: games.playerCount,
    playTime: games.playTime,
    tags: games.tags,
    coverImage: games.coverImage,
    description: games.description,
    rulesUrl: games.rulesUrl,
    visibility: games.visibility,
  };

  app.post('/api/guests', async (req, reply) => {
    const body = (req.body ?? {}) as { displayName?: string };
    const id = newId();
    const token = newToken();
    const displayName = body.displayName?.trim() || `Guest ${id.slice(0, 6)}`;
    opts.db.insert(guests).values({
      id, tokenHash: hashToken(token), displayName, createdAt: now(),
    }).run();
    reply.setCookie(GUEST_COOKIE, token, {
      path: '/', httpOnly: true, sameSite: 'lax', maxAge: COOKIE_MAX_AGE_S,
    });
    return { guest: { id, displayName, upgradedToUserId: null } };
  });

  app.get('/api/me', async (req) => {
    const p = principalOf(req);
    if (!p) return { user: null, guest: null };
    if (p.kind === 'user') {
      const u = opts.db.select().from(users).where(eq(users.id, p.userId)).get();
      return { user: u ?? null, guest: null };
    }
    const g = opts.db.select().from(guests).where(eq(guests.id, p.guestId)).get();
    return {
      user: null,
      guest: g ? { id: g.id, displayName: g.displayName, upgradedToUserId: g.upgradedToUserId } : null,
    };
  });

  // Passwordless email sign-in: ask for a link, then exchange it.
  app.post('/api/auth/email/link', async (req, reply) => {
    const body = (req.body ?? {}) as { email?: string };
    const email = body.email?.trim();
    if (!email || !email.includes('@')) {
      return reply.code(400).send({ error: 'email_required' });
    }
    const token = issueLinkToken(email);
    const url = `/api/auth/email/complete?token=${encodeURIComponent(token)}`;
    await opts.emailLinker.sendSignInLink(email, url);
    return { ok: true };
  });

  app.post('/api/auth/email/complete', async (req, reply) => {
    const body = (req.body ?? {}) as { token?: string };
    const token = body.token ?? '';
    const email = consumeLinkToken(token);
    if (!email) return reply.code(401).send({ error: 'invalid_or_expired_token' });

    // Find or create the user behind this email identity.
    let identity = opts.db.select().from(identities)
      .where(and(eq(identities.provider, 'email'), eq(identities.providerSubject, email)))
      .get();
    let userId: string;
    if (identity) {
      userId = identity.userId;
    } else {
      userId = newId();
      opts.db.insert(users).values({
        id: userId, displayName: email.split('@')[0] ?? 'Player', createdAt: now(),
      }).run();
      opts.db.insert(identities).values({
        id: newId(), userId, provider: 'email', providerSubject: email,
      }).run();
    }

    // A guest cookie on this request keeps its seats: point it at the user.
    const guestToken = req.cookies[GUEST_COOKIE];
    if (guestToken) {
      const guest = opts.db.select().from(guests)
        .where(eq(guests.tokenHash, hashToken(guestToken))).get();
      if (guest && !guest.upgradedToUserId) {
        opts.db.update(guests).set({ upgradedToUserId: userId })
          .where(eq(guests.id, guest.id)).run();
        opts.db.update(seats).set({ userId, guestId: null })
          .where(eq(seats.guestId, guest.id)).run();
      }
    }

    const sessionToken = newToken();
    opts.db.insert(authSessions).values({
      id: newId(), userId, tokenHash: hashToken(sessionToken), createdAt: now(),
    }).run();
    reply.setCookie(AUTH_COOKIE, sessionToken, {
      path: '/', httpOnly: true, sameSite: 'lax', maxAge: COOKIE_MAX_AGE_S,
    });
    return { ok: true, userId };
  });

  // Refresh the catalog from the engine's list; extra fields stay local.
  async function refreshCatalog(): Promise<number> {
    const listed = await opts.engine.listGames();
    for (const g of listed.games) {
      const playerCount = g.min_players === g.max_players
        ? String(g.min_players)
        : `${g.min_players}–${g.max_players}`;
      const existing = opts.db.select().from(games)
        .where(eq(games.engineGameId, g.game_id)).get();
      if (existing) {
        opts.db.update(games)
          .set({ name: g.name ?? existing.name, playerCount })
          .where(eq(games.engineGameId, g.game_id)).run();
      } else {
        opts.db.insert(games).values({
          engineGameId: g.game_id,
          name: g.name ?? g.game_id,
          playerCount,
        }).run();
      }
    }
    return listed.games.length;
  }

  app.post('/api/games/refresh', async () => ({ ok: true, count: await refreshCatalog() }));

  app.get('/api/games', async () => {
    return { games: opts.db.select(publicGameFields).from(games).all() };
  });

  app.post('/api/tables', async (req, reply) => {
    const p = requirePrincipal(req);
    const body = (req.body ?? {}) as {
      gameId?: string;
      mode?: 'live' | 'turns';
      seats?: SeatSpec[];
      hostPosition?: number;
    };
    if (!body.gameId || !body.mode || !Array.isArray(body.seats) || body.hostPosition === undefined) {
      return reply.code(400).send({ error: 'bad_request' });
    }
    try {
      const result = await tableService.createTable(p, {
        gameId: body.gameId,
        mode: body.mode,
        seatSpecs: body.seats,
        hostPosition: body.hostPosition,
      });
      return result;
    } catch (err) {
      if (err instanceof TableError) return reply.code(400).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post('/api/tables/:id/join', async (req, reply) => {
    const p = requirePrincipal(req);
    const { id } = req.params as { id: string };
    try {
      return tableService.joinTable(p, id);
    } catch (err) {
      if (err instanceof TableError) return reply.code(400).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post('/api/tables/:id/ready', async (req, reply) => {
    const p = requirePrincipal(req);
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { ready?: boolean };
    try {
      return tableService.setReady(p, id, body.ready !== false);
    } catch (err) {
      if (err instanceof TableError) return reply.code(400).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post('/api/tables/:id/start', async (req, reply) => {
    const p = requirePrincipal(req);
    const { id } = req.params as { id: string };
    try {
      return await tableService.startTable(p, id);
    } catch (err) {
      if (err instanceof TableError) return reply.code(400).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.get('/api/tables/:id', async (req, reply) => {
    const p = requirePrincipal(req);
    const { id } = req.params as { id: string };
    const table = tableService.getTable(id);
    if (!table) return reply.code(404).send({ error: 'no_table' });
    const tableSeats = tableService.getSeats(id).map((s) => ({
      position: s.position,
      kind: s.kind as 'human' | 'ai',
      aiDifficulty: s.aiDifficulty,
      ready: s.ready,
      mine: ownsSeat(s, p),
      taken: s.userId !== null || s.guestId !== null,
      setupChoices: s.setupChoices,
    }));
    return {
      table: {
        id: table.id,
        gameId: table.gameId,
        mode: table.mode as 'live' | 'turns',
        status: table.status as 'lobby' | 'playing' | 'finished',
        createdAt: table.createdAt,
        finishedAt: table.finishedAt,
      },
      seats: tableSeats,
    };
  });

  server_GetEvents(app);

  app.get('/api/my-tables', async (req) => {
    const p = requirePrincipal(req);
    const mySeats = opts.db.select().from(seats)
      .where(p.kind === 'user' ? eq(seats.userId, p.userId) : eq(seats.guestId, p.guestId))
      .all();
    const tableIds = [...new Set(mySeats.map((s) => s.tableId))];
    if (tableIds.length === 0) return { tables: [] };
    const mine = opts.db.select().from(tables)
      .where(and(inArray(tables.id, tableIds), inArray(tables.status, ['lobby', 'playing'])))
      .all();
    return {
      tables: mine.map((t) => ({
        id: t.id, gameId: t.gameId, mode: t.mode, status: t.status, createdAt: t.createdAt,
      })),
    };
  });

  // Per-seat event feed: only the requesting seat's view is included.
  function server_GetEvents(fastify: FastifyInstance) {
    fastify.get('/api/tables/:id/events', async (req, reply) => {
      const p = requirePrincipal(req);
      const { id } = req.params as { id: string };
      const { after } = req.query as { after?: string };
      const table = tableService.getTable(id);
      if (!table) return reply.code(404).send({ error: 'no_table' });
      const mySeats = tableService.getSeats(id).filter((s) => ownsSeat(s, p));
      const seatPosition = mySeats.length > 0 ? mySeats[0]!.position : null;
      const events = realtime.eventsAfter(id, Number(after ?? 0));
      return { events: events.map((e) => toWireEvent(e, seatPosition)) };
    });
  }

  // ---- Socket.IO ----------------------------------------------------------

  let io: SocketServer | null = opts.io ?? null;
  if (io) wireSockets(io);

  function wireSockets(server: SocketServer): void {
    realtime.onBroadcast((tableId, event) => {
      const room = server.sockets.adapter.rooms.get(`table:${tableId}`);
      if (!room) return;
      for (const socketId of room) {
        const socket = server.sockets.sockets.get(socketId);
        if (!socket) continue;
        const seat = (socket.data.ownedSeat as number | null) ?? null;
        socket.emit('table_event', toWireEvent(event, seat));
      }
    });

    server.use((socket, next) => {
      const cookies = socket.handshake.headers.cookie ?? '';
      const p = principalFromHeaders(cookies);
      if (!p) return next(new Error('unauthorized'));
      socket.data.principal = p;
      next();
    });

    server.on('connection', (socket: Socket) => {
      const principal = socket.data.principal as Principal;

      socket.on('join_table', (msg: { tableId?: string; lastSeenSeq?: number }, ack?: (r: unknown) => void) => {
        const respond = ack ?? (() => {});
        const tableId = msg.tableId;
        if (!tableId) return respond({ error: 'bad_request' });
        const table = tableService.getTable(tableId);
        if (!table) return respond({ error: 'no_table' });
        const mine = tableService.getSeats(tableId).filter((s) => ownsSeat(s, principal));
        socket.data.tableId = tableId;
        socket.data.ownedSeat = mine.length > 0 ? mine[0]!.position : null;
        void socket.join(`table:${tableId}`);
        realtime.markConnected(tableId, principal);
        // Replay missed events so a reconnecting browser catches up.
        const missed = realtime.eventsAfter(tableId, Number(msg.lastSeenSeq ?? 0));
        for (const e of missed) {
          socket.emit('table_event', toWireEvent(e, socket.data.ownedSeat));
        }
        respond({ ok: true, seats: mine.map((s) => s.position) });
      });

      socket.on('move', async (
        msg: { tableId?: string; seat?: number; move?: Record<string, unknown> },
        ack?: (r: unknown) => void,
      ) => {
        const respond = ack ?? (() => {});
        try {
          if (!msg.tableId || msg.seat === undefined || !msg.move) {
            return respond({ error: 'bad_request' });
          }
          const result = await realtime.handleMove(principal, msg.tableId, msg.seat, msg.move);
          respond({ ok: true, lastSeq: result.lastSeq });
        } catch (err) {
          if (err instanceof MoveError) {
            respond({ error: err.code, reason: err.reason, lesson: err.lesson });
          } else {
            respond({ error: 'internal' });
          }
        }
      });

      socket.on('undo', async (msg: { tableId?: string }, ack?: (r: unknown) => void) => {
        const respond = ack ?? (() => {});
        try {
          if (!msg.tableId) return respond({ error: 'bad_request' });
          const result = await realtime.handleUndo(principal, msg.tableId);
          respond({ ok: true, seq: result.seq });
        } catch (err) {
          if (err instanceof MoveError) respond({ error: err.code });
          else respond({ error: 'internal' });
        }
      });

      socket.on('disconnect', () => {
        const tableId = socket.data.tableId as string | undefined;
        if (tableId) realtime.markDisconnected(tableId, principal);
      });
    });
  }

  // In production the server also serves the built frontend. In dev, Vite
  // serves it, so this only runs when the build output is actually there.
  const webDist = path.resolve(import.meta.dirname, '../../web/dist');
  if (process.env.NODE_ENV === 'production' && existsSync(webDist)) {
    void app.register(fastifyStatic, { root: webDist });
    // Client-side routing: any GET that is not /api/* gets index.html back.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({ error: 'not_found' });
    });
  }

  return { fastify: app, io, tableService, realtime, principalFromHeaders, refreshCatalog };
}
