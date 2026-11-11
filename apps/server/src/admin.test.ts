// The admin page's API (T06): only an account in ADMIN_EMAILS gets in; an
// edit is what the storefront then shows and survives a catalog refresh (a
// restart); a removed update stays removed; uploaded images are checked and
// served back; the engine's own fields are not editable.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import type {
  AdminContentResponse, AdminGameEdit, DesignerResponse, DesignersResponse, GameResponse, GamesResponse, MeResponse,
  UpdatesResponse } from '@universe/shared';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { parseAdminEmails } from './admin.js';
import { FakeEngine } from './test-engine.js';

const ORIGIN = 'http://localhost:5173';
const ADMIN = 'boss@example.com';

// A 1x1 PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('admin', () => {
  let database: DatabaseClient;
  let db: Kysely<DB>;
  let app: UniverseApp;
  let mailer: ConsoleMailer;

  beforeEach(async () => {
    database = await createDatabase(':memory:');
    db = database.db;
    mailer = new ConsoleMailer();
    app = buildApp({
      db, engine: new FakeEngine(), mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: false, logger: false, adminEmails: [ADMIN],
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

  async function signIn(email: string): Promise<string> {
    const link = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email } });
    const url = /https?:\/\/\S+/.exec(mailer.sent[mailer.sent.length - 1]!.text)![0];
    const token = decodeURIComponent(url.split('#token=')[1]!);
    const done = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/complete', headers: { origin: ORIGIN, cookie: cookieOf(link, 'universe_signin') }, payload: { token } });
    expect(done.statusCode).toBe(200);
    return cookieOf(done, 'universe_auth');
  }

  const send = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, cookie?: string, payload?: unknown) =>
    app.fastify.inject({ method, url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, ...(payload !== undefined ? { payload: payload as object } : {}) });

  function ffEdit(over: Partial<AdminGameEdit> = {}): AdminGameEdit {
    return {
      name: 'Fractured Fist', description: 'New blurb.', playTime: '15 min', tags: ['duel'],
      coverImage: '/art/covers/fractured-fist.webp', coverFocus: '50% 30%', screenshots: [],
      designerSlug: 'zekel-games', featuredRank: null, visibility: 'public', ...over,
    };
  }

  it('reads ADMIN_EMAILS in lower case, split on commas or spaces', () => {
    expect(parseAdminEmails(' A@x.com, b@y.org  c@z.net,,nonsense ')).toEqual(['a@x.com', 'b@y.org', 'c@z.net']);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });

  it('lets in only a signed-in account whose email is listed', async () => {
    expect((await send('GET', '/api/admin/content')).statusCode).toBe(401);
    const guest = cookieOf(await send('POST', '/api/guests'), 'universe_guest');
    expect((await send('GET', '/api/admin/content', guest)).statusCode).toBe(401);
    const someone = await signIn('someone@example.com');
    expect((await send('GET', '/api/admin/content', someone)).statusCode).toBe(403);
    expect((await send('PUT', '/api/admin/games/fractured-fist', someone, ffEdit())).statusCode).toBe(403);
    expect((await send('GET', '/api/me', someone)).json<MeResponse>().isAdmin).toBe(false);

    // The address matches whatever case it was typed in.
    const boss = await signIn('Boss@Example.com');
    expect((await send('GET', '/api/me', boss)).json<MeResponse>().isAdmin).toBe(true);
    const content = (await send('GET', '/api/admin/content', boss)).json<AdminContentResponse>();
    expect(content.games.map((g) => g.engineGameId)).toContain('fractured-fist');
    expect(content.designers.map((d) => d.slug)).toEqual(['zekel-games']);
    expect(content.updates.length).toBeGreaterThan(0);
  });

  it('a refused write changes no row (R2)', async () => {
    const snapshot = async () => JSON.stringify(await Promise.all([
      db.selectFrom('games').selectAll().orderBy('engine_game_id').execute(),
      db.selectFrom('designers').selectAll().orderBy('slug').execute(),
      db.selectFrom('game_updates').selectAll().orderBy('id').execute(),
      db.selectFrom('media').select('id').execute(),
    ]));
    const before = await snapshot();
    const someone = await signIn('someone@example.com');
    const boss = await signIn(ADMIN);
    const updateId = (await db.selectFrom('game_updates').select('id').executeTakeFirstOrThrow()).id;
    const writes: Array<['POST' | 'PUT' | 'DELETE', string, unknown]> = [
      ['PUT', '/api/admin/games/fractured-fist', ffEdit({ name: 'Changed' })],
      ['POST', '/api/admin/designers', { slug: 'new-one', name: 'N', bio: '', avatarImage: null }],
      ['PUT', '/api/admin/designers/zekel-games', { name: 'Changed', bio: '', avatarImage: null }],
      ['POST', '/api/admin/updates', { gameId: 'fractured-fist', title: 'x', body: 'y' }],
      ['PUT', `/api/admin/updates/${updateId}`, { gameId: 'fractured-fist', title: 'x', body: 'y' }],
      ['DELETE', `/api/admin/updates/${updateId}`, undefined],
      ['POST', '/api/admin/media', { contentType: 'image/png', data: PNG }],
    ];
    for (const [method, url, payload] of writes) {
      expect((await send(method, url, undefined, payload)).statusCode, `${method} ${url} anonymous`).toBe(401);
      expect((await send(method, url, someone, payload)).statusCode, `${method} ${url} non-admin`).toBe(403);
      const foreign = await app.fastify.inject({ method, url, headers: { origin: 'https://evil.example', cookie: boss }, ...(payload ? { payload: payload as object } : {}) });
      expect(foreign.statusCode, `${method} ${url} foreign origin`).toBe(403);
    }
    expect(await snapshot()).toBe(before);
  });

  it('refuses an edit from another origin', async () => {
    const boss = await signIn(ADMIN);
    const res = await app.fastify.inject({
      method: 'PUT', url: '/api/admin/games/fractured-fist', headers: { origin: 'https://evil.example', cookie: boss }, payload: ffEdit() as unknown as object,
    });
    expect(res.statusCode).toBe(403);
  });

  it('a game edit shows on the storefront and survives a catalog refresh', async () => {
    const boss = await signIn(ADMIN);
    const res = await send('PUT', '/api/admin/games/fractured-fist', boss, ffEdit({
      name: 'Fractured Fist: Arcade', screenshots: ['/art/covers/fractured-fist.webp'], featuredRank: 1,
    }));
    expect(res.statusCode).toBe(200);
    await app.refreshCatalog(); // what a restart does
    const g = (await send('GET', '/api/games/fractured-fist')).json<GameResponse>().game;
    expect(g.name).toBe('Fractured Fist: Arcade');
    expect(g.description).toBe('New blurb.');
    expect(g.playTime).toBe('15 min');
    expect(g.tags).toEqual(['duel']);
    expect(g.coverFocus).toBe('50% 30%');
    expect(g.screenshots).toEqual(['/art/covers/fractured-fist.webp']);
    expect(g.featuredRank).toBe(1);
    // The engine's fields still come from the engine.
    expect(g.minPlayers).toBe(2);
    expect(g.supportsAi).toBe(true);
  });

  it('checks every game field it is given', async () => {
    const boss = await signIn(ADMIN);
    const tries: Array<Partial<AdminGameEdit>> = [
      { name: '' },
      { name: 'x'.repeat(81) },
      { coverImage: 'https://elsewhere.example/a.png' },
      { coverImage: 'javascript:alert(1)' },
      { coverImage: '/art/../../etc/passwd' },
      { screenshots: ['/media//x'] },
      { coverFocus: 'center; color: red' },
      { designerSlug: 'nobody' },
      { featuredRank: 0 },
      { featuredRank: 1.5 },
      { visibility: 'secret' as 'public' },
      { tags: Array.from({ length: 9 }, (_, i) => `t${i}`) },
    ];
    for (const t of tries) {
      const res = await send('PUT', '/api/admin/games/fractured-fist', boss, ffEdit(t));
      expect(res.statusCode, JSON.stringify(t)).toBe(400);
    }
    expect((await send('PUT', '/api/admin/games/nope', boss, ffEdit())).statusCode).toBe(404);
  });

  it('an unlisted game leaves the designer page but keeps its own page', async () => {
    const boss = await signIn(ADMIN);
    await send('PUT', '/api/admin/games/fractured-fist', boss, ffEdit({ visibility: 'unlisted' }));
    const d = (await send('GET', '/api/designers/zekel-games')).json<DesignerResponse>();
    expect(d.games.map((g) => g.engineGameId)).not.toContain('fractured-fist');
    expect((await send('GET', '/api/games/fractured-fist')).statusCode).toBe(200);
    const games = (await send('GET', '/api/games')).json<GamesResponse>().games;
    expect(games.find((g) => g.engineGameId === 'fractured-fist')?.visibility).toBe('unlisted');
  });

  it('designers: create one, edit one, and the games carry the new name', async () => {
    const boss = await signIn(ADMIN);
    expect((await send('POST', '/api/admin/designers', boss, { slug: 'Bad Slug', name: 'X', bio: '', avatarImage: null })).statusCode).toBe(400);
    expect((await send('POST', '/api/admin/designers', boss, { slug: 'zekel-games', name: 'X', bio: '', avatarImage: null })).statusCode).toBe(409);
    expect((await send('POST', '/api/admin/designers', boss, { slug: 'river-works', name: 'River Works', bio: 'Rivers.', avatarImage: null })).statusCode).toBe(200);
    const list = (await send('GET', '/api/designers')).json<DesignersResponse>();
    expect(list.designers.map((d) => d.slug)).toEqual(['river-works', 'zekel-games']);
    expect(list.designers.find((d) => d.slug === 'river-works')?.gameCount).toBe(0);

    await send('PUT', '/api/admin/games/fractured-fist', boss, ffEdit({ designerSlug: 'river-works' }));
    expect((await send('PUT', '/api/admin/designers/river-works', boss, { name: 'River Works Co.', bio: 'Rivers.', avatarImage: null })).statusCode).toBe(200);
    await app.refreshCatalog();
    const g = (await send('GET', '/api/games/fractured-fist')).json<GameResponse>().game;
    expect(g.designerSlug).toBe('river-works');
    expect(g.designerName).toBe('River Works Co.');
    const d = (await send('GET', '/api/designers/river-works')).json<DesignerResponse>();
    expect(d.games.map((x) => x.engineGameId)).toEqual(['fractured-fist']);
    expect((await send('PUT', '/api/admin/designers/nobody', boss, { name: 'N', bio: '', avatarImage: null })).statusCode).toBe(404);
  });

  it('updates: post, edit, remove; a removed seeded update never comes back', async () => {
    const boss = await signIn(ADMIN);
    const made = await send('POST', '/api/admin/updates', boss, { gameId: 'fractured-fist', title: 'Hello', body: 'News.' });
    expect(made.statusCode).toBe(200);
    const id = made.json<{ id: string }>().id;
    expect((await send('PUT', `/api/admin/updates/${id}`, boss, { gameId: 'fractured-fist', title: 'Hello again', body: 'News.', postedAt: '2030-01-01T00:00:00Z' })).statusCode).toBe(200);
    let feed = (await send('GET', '/api/updates?limit=50')).json<UpdatesResponse>().updates;
    expect(feed[0]).toMatchObject({ id, title: 'Hello again', postedAt: '2030-01-01T00:00:00.000Z' });

    expect((await send('POST', '/api/admin/updates', boss, { gameId: 'nope', title: 'x', body: 'y' })).statusCode).toBe(400);
    expect((await send('POST', '/api/admin/updates', boss, { gameId: 'fractured-fist', title: '', body: 'y' })).statusCode).toBe(400);

    const seeded = feed.find((u) => u.id !== id)!;
    expect((await send('DELETE', `/api/admin/updates/${seeded.id}`, boss)).statusCode).toBe(200);
    expect((await send('DELETE', `/api/admin/updates/${seeded.id}`, boss)).statusCode).toBe(404);
    await app.refreshCatalog();
    feed = (await send('GET', '/api/updates?limit=50')).json<UpdatesResponse>().updates;
    expect(feed.map((u) => u.id)).not.toContain(seeded.id);
    const devlog = (await send('GET', '/api/games/fractured-fist/updates')).json<UpdatesResponse>().updates;
    expect(devlog.map((u) => u.id)).not.toContain(seeded.id);
  });

  it('images: an upload is checked, stored, and served back with its type', async () => {
    const boss = await signIn(ADMIN);
    const someone = await signIn('someone@example.com');
    expect((await send('POST', '/api/admin/media', someone, { contentType: 'image/png', data: PNG })).statusCode).toBe(403);
    expect((await send('POST', '/api/admin/media', boss, { contentType: 'image/svg+xml', data: PNG })).statusCode).toBe(400);
    expect((await send('POST', '/api/admin/media', boss, { contentType: 'image/jpeg', data: PNG })).statusCode).toBe(400);
    expect((await send('POST', '/api/admin/media', boss, { contentType: 'image/png', data: 'not base64!' })).statusCode).toBe(400);
    const tooBig = Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(1024 * 1024)]).toString('base64');
    expect((await send('POST', '/api/admin/media', boss, { contentType: 'image/png', data: tooBig })).statusCode).toBe(400);

    const up = await send('POST', '/api/admin/media', boss, { contentType: 'image/png', data: PNG });
    expect(up.statusCode).toBe(200);
    const url = up.json<{ url: string }>().url;
    expect(url).toMatch(/^\/media\/[0-9a-f-]{36}$/);
    const got = await app.fastify.inject({ method: 'GET', url });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/png');
    expect(got.headers['x-content-type-options']).toBe('nosniff');
    expect(got.rawPayload.equals(Buffer.from(PNG, 'base64'))).toBe(true);
    expect((await app.fastify.inject({ method: 'GET', url: '/media/00000000-0000-0000-0000-000000000000' })).statusCode).toBe(404);
    expect((await app.fastify.inject({ method: 'GET', url: '/media/..%2F..%2Fetc' })).statusCode).toBe(404);

    // The upload's path is a valid screenshot.
    expect((await send('PUT', '/api/admin/games/fractured-fist', boss, ffEdit({ screenshots: [url] }))).statusCode).toBe(200);
  });

  it('nobody is an admin when ADMIN_EMAILS is empty', async () => {
    const plain = buildApp({
      db, engine: new FakeEngine(), mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: false, logger: false,
    });
    await plain.fastify.ready();
    const link = await plain.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email: ADMIN } });
    const u = /https?:\/\/\S+/.exec(mailer.sent[mailer.sent.length - 1]!.text)![0];
    const done = await plain.fastify.inject({
      method: 'POST', url: '/api/auth/email/complete',
      headers: { origin: ORIGIN, cookie: cookieOf(link, 'universe_signin') }, payload: { token: decodeURIComponent(u.split('#token=')[1]!) },
    });
    const cookie = cookieOf(done, 'universe_auth');
    expect((await plain.fastify.inject({ method: 'GET', url: '/api/admin/content', headers: { cookie } })).statusCode).toBe(403);
    await plain.fastify.close();
  });
});
