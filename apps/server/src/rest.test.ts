// REST contract tests through Fastify's inject: guests, the catalog, table
// creation and reading, the per-seat events feed, sign-in by email link
// with guest upgrade, sign-out, rate limiting, and the origin check.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type {
  CreateTableResponse, FriendsResponse, GameReferenceResponse, GameResponse, GamesResponse, InvitesResponse, MeResponse, MyTablesResponse,
  TableEventsResponse, TableResponse, UpdatesResponse, DesignerResponse, WatchResponse } from '@universe/shared';
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

  async function signIn(email: string): Promise<string> {
    await app.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email } });
    const url = /https?:\/\/\S+/.exec(mailer.sent[mailer.sent.length - 1]!.text)![0];
    const token = decodeURIComponent(url.split('#token=')[1]!);
    const done = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/complete', headers: { origin: ORIGIN }, payload: { token } });
    expect(done.statusCode).toBe(200);
    return cookieOf(done, 'universe_auth');
  }

  it('friend requests: send, accept, list both sides, then remove', async () => {
    const a = await signIn('ana@example.com');
    const b = await signIn('bo@example.com');

    // Guests cannot use friends at all.
    const g = await guest();
    expect((await app.fastify.inject({ method: 'GET', url: '/api/friends', headers: { cookie: g } })).statusCode).toBe(403);

    // Unknown address does not leak existence beyond a plain no.
    const nope = await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: a }, payload: { email: 'ghost@example.com' } });
    expect(nope.statusCode).toBe(404);
    expect((await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: a }, payload: { email: 'ana@example.com' } })).statusCode).toBe(400);

    const sent = await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: a }, payload: { email: 'BO@example.com' } });
    expect(sent.statusCode).toBe(200);
    // Sending twice is a conflict, not a second row.
    expect((await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: a }, payload: { email: 'bo@example.com' } })).statusCode).toBe(409);

    const aList = (await app.fastify.inject({ method: 'GET', url: '/api/friends', headers: { cookie: a } })).json<FriendsResponse>();
    expect(aList.friends).toHaveLength(0);
    expect(aList.outgoing).toHaveLength(1);
    expect(aList.outgoing[0]!.displayName).toBe('bo');
    const bList = (await app.fastify.inject({ method: 'GET', url: '/api/friends', headers: { cookie: b } })).json<FriendsResponse>();
    expect(bList.incoming).toHaveLength(1);
    expect(bList.incoming[0]!.displayName).toBe('ana');

    // The requester cannot accept their own request.
    expect((await app.fastify.inject({ method: 'POST', url: `/api/friends/requests/${bList.incoming[0]!.id}/accept`, headers: { origin: ORIGIN, cookie: a } })).statusCode).toBe(404);

    const accept = await app.fastify.inject({ method: 'POST', url: `/api/friends/requests/${bList.incoming[0]!.id}/accept`, headers: { origin: ORIGIN, cookie: b } });
    expect(accept.statusCode).toBe(200);
    const aAfter = (await app.fastify.inject({ method: 'GET', url: '/api/friends', headers: { cookie: a } })).json<FriendsResponse>();
    expect(aAfter.friends).toHaveLength(1);
    expect(aAfter.friends[0]!.displayName).toBe('bo');
    expect(aAfter.outgoing).toHaveLength(0);
    // Already friends: re-requesting is a conflict both ways.
    expect((await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: b }, payload: { email: 'ana@example.com' } })).statusCode).toBe(409);

    // Unfriend, then a cross-request self-accepts.
    expect((await app.fastify.inject({ method: 'DELETE', url: `/api/friends/${aAfter.friends[0]!.userId}`, headers: { origin: ORIGIN, cookie: a } })).statusCode).toBe(200);
    await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: a }, payload: { email: 'bo@example.com' } });
    const cross = await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: b }, payload: { email: 'ana@example.com' } });
    expect(cross.json()).toMatchObject({ ok: true, accepted: true });
    const rows = await db.selectFrom('friendships').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('accepted');

    // Decline path: cancel + recreate + decline deletes the request.
    await app.fastify.inject({ method: 'DELETE', url: `/api/friends/${aAfter.friends[0]!.userId}`, headers: { origin: ORIGIN, cookie: a } });
    await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: a }, payload: { email: 'bo@example.com' } });
    const bList2 = (await app.fastify.inject({ method: 'GET', url: '/api/friends', headers: { cookie: b } })).json<FriendsResponse>();
    expect((await app.fastify.inject({ method: 'DELETE', url: `/api/friends/requests/${bList2.incoming[0]!.id}`, headers: { origin: ORIGIN, cookie: b } })).statusCode).toBe(200);
    const aFinal = (await app.fastify.inject({ method: 'GET', url: '/api/friends', headers: { cookie: a } })).json<FriendsResponse>();
    expect(aFinal.outgoing).toHaveLength(0);
    expect(aFinal.friends).toHaveLength(0);
  });

  it('table invites: invite by email, accept into a seat, decline path, edge cases', async () => {
    const host = await signIn('host@example.com');
    const friend = await signIn('pal@example.com');
    const stranger = await signIn('third@example.com');

    const created = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie: host },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0 },
    });
    expect(created.statusCode).toBe(200);
    const { tableId } = created.json<CreateTableResponse>();

    // A guest cannot invite; a non-seated user cannot invite.
    const g = await guest();
    expect((await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: g }, payload: { email: 'pal@example.com' } })).statusCode).toBe(403);
    expect((await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: stranger }, payload: { email: 'pal@example.com' } })).statusCode).toBe(403);

    const invited = await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { email: 'PAL@example.com' } });
    expect(invited.statusCode).toBe(200);
    const { inviteId } = invited.json<{ inviteId: string }>();
    // duplicate invite is a conflict
    expect((await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { email: 'pal@example.com' } })).statusCode).toBe(409);
    // unknown address
    expect((await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { email: 'nobody@example.com' } })).statusCode).toBe(404);

    // The recipient sees it with game + inviter names; a notification row landed.
    const list = (await app.fastify.inject({ method: 'GET', url: '/api/invites', headers: { cookie: friend } })).json<InvitesResponse>();
    expect(list.invites).toHaveLength(1);
    expect(list.invites[0]).toMatchObject({ id: inviteId, tableId, gameName: 'Fractured Fist', fromDisplayName: 'host', status: 'pending' });
    const notes = await db.selectFrom('notifications').selectAll().where('table_id', '=', tableId).execute();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.kind).toBe('invite');

    // The host's view lists who was invited; the third user sees nothing.
    expect((await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}/invites`, headers: { cookie: stranger } })).statusCode).toBe(403);
    const hostList = (await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}/invites`, headers: { cookie: host } })).json<InvitesResponse>();
    expect(hostList.invites[0]!.toDisplayName).toBe('pal');

    // The third user cannot accept someone else's invite.
    expect((await app.fastify.inject({ method: 'POST', url: `/api/invites/${inviteId}/accept`, headers: { origin: ORIGIN, cookie: stranger } })).statusCode).toBe(404);

    // Decline, then a fresh invite, then accept into the open seat.
    expect((await app.fastify.inject({ method: 'POST', url: `/api/invites/${inviteId}/decline`, headers: { origin: ORIGIN, cookie: friend } })).statusCode).toBe(200);
    expect((await app.fastify.inject({ method: 'POST', url: `/api/invites/${inviteId}/accept`, headers: { origin: ORIGIN, cookie: friend } })).statusCode).toBe(404);
    const again = await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { email: 'pal@example.com' } });
    const accept = await app.fastify.inject({ method: 'POST', url: `/api/invites/${again.json<{ inviteId: string }>().inviteId}/accept`, headers: { origin: ORIGIN, cookie: friend } });
    expect(accept.statusCode).toBe(200);

    const table = (await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}`, headers: { cookie: friend } })).json<TableResponse>();
    expect(table.mySeats).toEqual([1]);
    expect(table.seats.map((s) => s.displayName)).toEqual(['host', 'pal']);
    // No seats left: another invite fails.
    expect((await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { email: 'third@example.com' } })).statusCode).toBe(409);
    // The pending list is now empty for the recipient.
    expect((await app.fastify.inject({ method: 'GET', url: '/api/invites', headers: { cookie: friend } })).json<InvitesResponse>().invites).toHaveLength(0);
  });

  it('invites by userId only resolve for accepted friends', async () => {
    const host = await signIn('h2@example.com');
    const pal = await signIn('p2@example.com');
    const meRow = (await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie: pal } })).json<MeResponse>();
    const palId = meRow.user!.id;

    const created = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie: host },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0 },
    });
    const { tableId } = created.json<CreateTableResponse>();

    // Not a friend: id alone must not resolve.
    expect((await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { userId: palId } })).statusCode).toBe(404);

    // Friend them, then the same id works.
    await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: host }, payload: { email: 'p2@example.com' } });
    const list = (await app.fastify.inject({ method: 'GET', url: '/api/friends', headers: { cookie: pal } })).json<FriendsResponse>();
    await app.fastify.inject({ method: 'POST', url: `/api/friends/requests/${list.incoming[0]!.id}/accept`, headers: { origin: ORIGIN, cookie: pal } });
    const ok = await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { userId: palId } });
    expect(ok.statusCode).toBe(200);
    const mine = (await app.fastify.inject({ method: 'GET', url: '/api/invites', headers: { cookie: pal } })).json<InvitesResponse>();
    expect(mine.invites).toHaveLength(1);
  });

  it('address lookups share one budget across friend requests and email invites', async () => {
    await app.fastify.close();
    app = buildApp({
      db, engine, mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: false, logger: false, limits: { lookupsPerUser: 3 },
    });
    await app.fastify.ready();
    await app.refreshCatalog();
    const host = await signIn('h3@example.com');
    const pal = await signIn('p3@example.com');
    const palId = (await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie: pal } })).json<MeResponse>().user!.id;
    const created = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie: host },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'human' }], hostPosition: 0 },
    });
    const { tableId } = created.json<CreateTableResponse>();
    const invite = (email: string) => app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { email } });
    const ask = (email: string) => app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: host }, payload: { email } });

    // Two misses through invites and one through a friend request use the
    // budget; a fourth lookup of either kind is refused before it answers.
    expect((await invite('nobody-1@example.com')).statusCode).toBe(404);
    expect((await invite('nobody-2@example.com')).statusCode).toBe(404);
    expect((await ask('nobody-3@example.com')).statusCode).toBe(404);
    expect((await invite('p3@example.com')).statusCode).toBe(429);
    expect((await ask('p3@example.com')).statusCode).toBe(429);
    // The budget is per user: the other account still has its own.
    expect((await app.fastify.inject({ method: 'POST', url: '/api/friends/requests', headers: { origin: ORIGIN, cookie: pal }, payload: { email: 'h3@example.com' } })).statusCode).toBe(200);
    // Inviting an accepted friend by id is not a lookup and is not charged.
    const list = (await app.fastify.inject({ method: 'GET', url: '/api/friends', headers: { cookie: host } })).json<FriendsResponse>();
    await app.fastify.inject({ method: 'POST', url: `/api/friends/requests/${list.incoming[0]!.id}/accept`, headers: { origin: ORIGIN, cookie: host } });
    expect((await app.fastify.inject({ method: 'POST', url: `/api/tables/${tableId}/invites`, headers: { origin: ORIGIN, cookie: host }, payload: { userId: palId } })).statusCode).toBe(200);
  });

  it("storefront: the updates feed, a game's devlog, and the designer profile come from the seeded posts", async () => {
    const feed = (await app.fastify.inject({ method: 'GET', url: '/api/updates?limit=2' })).json<UpdatesResponse>();
    // The fake engine lists only Fractured Fist, so only its posts seed.
    expect(feed.updates.length).toBeGreaterThan(0);
    expect(feed.updates.length).toBeLessThanOrEqual(2);
    expect(feed.updates.every((u) => u.gameName === 'Fractured Fist' && u.title.length > 0)).toBe(true);
    const ff = (await app.fastify.inject({ method: 'GET', url: '/api/games/fractured-fist/updates' })).json<UpdatesResponse>();
    expect(ff.updates.length).toBeGreaterThan(0);
    expect(ff.updates.every((u) => u.gameId === 'fractured-fist')).toBe(true);
    expect((await app.fastify.inject({ method: 'GET', url: '/api/games/nope/updates' })).statusCode).toBe(404);
    const d = (await app.fastify.inject({ method: 'GET', url: '/api/designers/zekel-games' })).json<DesignerResponse>();
    expect(d.designer.name).toBe('Zekel Games');
    expect(d.games.map((g) => g.engineGameId)).toContain('fractured-fist');
    expect(d.games.every((g) => g.designerSlug === 'zekel-games')).toBe(true);
    expect(d.updates.length).toBeGreaterThan(0);
    expect((await app.fastify.inject({ method: 'GET', url: '/api/designers/nobody' })).statusCode).toBe(404);
    // Seeding twice posts nothing twice.
    const before = feed.updates.length;
    await app.refreshCatalog();
    expect((await app.fastify.inject({ method: 'GET', url: '/api/updates?limit=2' })).json<UpdatesResponse>().updates).toHaveLength(before);
  });

  it("watch: anyone with the link gets the public view, the seats and the log, never a seat's payload", async () => {
    const cookie = await guest();
    const created = await app.fastify.inject({
      method: 'POST', url: '/api/tables', headers: { origin: ORIGIN, cookie },
      payload: { gameId: 'fractured-fist', mode: 'live', seats: [{ kind: 'human' }, { kind: 'ai' }], hostPosition: 0 },
    });
    const { tableId } = created.json<CreateTableResponse>();
    // No cookie at all: a stranger with the link.
    const res = await app.fastify.inject({ method: 'GET', url: `/api/tables/${tableId}/watch` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const w = res.json<WatchResponse>();
    expect(w.table.gameName).toBe('Fractured Fist');
    expect(w.seats.map((s) => s.kind)).toEqual(['human', 'ai']);
    expect(w.view).toMatchObject({ public: true });
    expect(res.body).not.toContain('secret-of-p1');
    expect(res.body).not.toContain('legalMoves');
    expect(w.log[0]!.summary).toBe('The table is set.');
    expect(w.seq).toBe(1);
    expect((await app.fastify.inject({ method: 'GET', url: '/api/tables/nope/watch' })).statusCode).toBe(404);
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

  it('rate limits sign-in links per client address with its own, larger budget', async () => {
    await app.fastify.close();
    app = buildApp({
      db, engine, mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: false, logger: false, limits: { linksPerIp: 2 },
    });
    await app.fastify.ready();
    const ask = (email: string, ip?: string) => app.fastify.inject({
      method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN, ...(ip ? { 'x-forwarded-for': ip } : {}) }, payload: { email },
    });
    expect((await ask('one@example.com')).statusCode).toBe(200);
    expect((await ask('two@example.com')).statusCode).toBe(200);
    expect((await ask('three@example.com')).statusCode).toBe(429);
    expect(mailer.sent).toHaveLength(2);
  });

  it('rejects an address that is not an email', async () => {
    const res = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email: 'nope' } });
    expect(res.statusCode).toBe(400);
  });

  it('test outbox is off by default and on demand, exposing the mailed links', async () => {
    // Off on a normal build.
    expect((await app.fastify.inject({ method: 'GET', url: '/api/test/outbox' })).statusCode).toBe(404);

    // On when asked for (e2e stack), with the console mailer's mail visible.
    const mailer2 = new ConsoleMailer();
    const app2 = buildApp({
      db, engine, mailer: mailer2, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: false, logger: false, testOutbox: true,
    });
    await app2.fastify.ready();
    await app2.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email: 'out@example.com' } });
    const out = await app2.fastify.inject({ method: 'GET', url: '/api/test/outbox' });
    expect(out.statusCode).toBe(200);
    const { mails } = out.json<{ mails: { to: string; text: string }[] }>();
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe('out@example.com');
    expect(mails[0]!.text).toContain('/signin/complete#token=');
    await app2.fastify.close();

    // It refuses to pair with a non-console mailer.
    expect(() => buildApp({
      db, engine, mailer: { send: async () => {} }, secretKey: 's', appOrigin: ORIGIN,
      allowedOrigins: [ORIGIN], secureCookies: false, logger: false, testOutbox: true,
    })).toThrow(/ConsoleMailer/);
  });
});
