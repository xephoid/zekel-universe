// Sign-in with Discord or Google through Supabase (T09). The token check
// runs for real, against a key pair made here (no network): Supabase's
// public keys and its user record are stood in for. Covered: which tokens
// are refused, and that a refusal changes nothing; which account a sign-in
// reaches (new, returning, joined by a confirmed email, never by an
// unconfirmed one); the guest's move; the old session's end; the admin
// check; and the settings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import type { MeResponse } from '@universe/shared';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { supabaseChecker, supabaseIssuer } from './supabaseAuth.js';
import { parseSupabase } from './config.js';
import { FakeEngine } from './test-engine.js';

const ORIGIN = 'http://localhost:5173';
const PROJECT = 'https://testproject.supabase.co';
const KEY = 'sb_publishable_test';
const ADMIN = 'boss@example.com';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

interface FakeUser { id: string; email?: string; email_confirmed_at?: string | null; is_anonymous?: boolean; user_metadata?: Record<string, unknown> }

describe('sign-in through Supabase', () => {
  let database: DatabaseClient;
  let db: Kysely<DB>;
  let app: UniverseApp;
  let mailer: ConsoleMailer;
  let projectKey: KeyPair;
  let otherKey: KeyPair;
  /** Supabase's user records, by the token that asks. */
  let users: Map<string, FakeUser>;
  let lookups: number;

  beforeEach(async () => {
    projectKey = await generateKeyPair('ES256');
    otherKey = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(projectKey.publicKey)), kid: 'k1', alg: 'ES256' };
    users = new Map();
    lookups = 0;
    const fetchFn = (async (url: string | URL, init?: RequestInit) => {
      lookups++;
      expect(String(url)).toBe(`${PROJECT}/auth/v1/user`);
      const headers = init?.headers as Record<string, string>;
      expect(headers.apikey).toBe(KEY);
      const user = users.get(headers.authorization!.replace(/^Bearer /, ''));
      return user ? new Response(JSON.stringify(user), { status: 200 }) : new Response('{}', { status: 401 });
    }) as typeof fetch;
    const check = supabaseChecker({ url: PROJECT, publishableKey: KEY, keys: createLocalJWKSet({ keys: [jwk] }), fetchFn });

    database = await createDatabase(':memory:');
    db = database.db;
    mailer = new ConsoleMailer();
    app = buildApp({
      db, engine: new FakeEngine(), mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: false, logger: false, adminEmails: [ADMIN],
      supabase: { url: PROJECT, publishableKey: KEY, check },
    });
    await app.fastify.ready();
  });

  afterEach(async () => {
    await app.fastify.close();
    await database.close();
  });

  /** A token as Supabase would make it; `over` changes any claim. */
  async function tokenFor(user: FakeUser, over: JWTPayload = {}, key: KeyPair = projectKey, alg = 'ES256'): Promise<string> {
    const nowS = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ role: 'authenticated', is_anonymous: false, email: user.email, ...over })
      .setProtectedHeader({ alg, kid: 'k1' })
      .setSubject(user.id)
      .setIssuer(typeof over.iss === 'string' ? over.iss : supabaseIssuer(PROJECT))
      .setAudience(typeof over.aud === 'string' ? over.aud : 'authenticated')
      .setIssuedAt(typeof over.iat === 'number' ? over.iat : nowS)
      .setExpirationTime(typeof over.exp === 'number' ? over.exp : nowS + 3600)
      .sign(key.privateKey);
    users.set(token, user);
    return token;
  }

  function cookieOf(res: { headers: Record<string, unknown> }, name: string): string | null {
    const raw = res.headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const hit = list.find((c) => typeof c === 'string' && c.startsWith(`${name}=`)) as string | undefined;
    return hit ? hit.split(';')[0]! : null;
  }

  const complete = (accessToken: unknown, cookie?: string) => app.fastify.inject({
    method: 'POST', url: '/api/auth/supabase/complete',
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload: { accessToken },
  });

  const me = async (cookie: string): Promise<MeResponse> =>
    (await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json();

  async function emailSignIn(email: string): Promise<{ cookie: string; userId: string }> {
    const link = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN }, payload: { email } });
    const url = /https?:\/\/\S+/.exec(mailer.sent[mailer.sent.length - 1]!.text)![0];
    const token = decodeURIComponent(url.split('#token=')[1]!);
    const done = await app.fastify.inject({ method: 'POST', url: '/api/auth/email/complete', headers: { origin: ORIGIN, cookie: cookieOf(link, 'universe_signin')! }, payload: { token } });
    expect(done.statusCode).toBe(200);
    return { cookie: cookieOf(done, 'universe_auth')!, userId: done.json().userId };
  }

  const discordUser = (over: Partial<FakeUser> = {}): FakeUser => ({
    id: 'sb-user-1', email: 'Player@Example.com', email_confirmed_at: '2026-11-12T00:00:00Z',
    user_metadata: { full_name: 'Ada from Discord' }, ...over,
  });

  it('the providers route tells the page the project address and public key', async () => {
    const res = await app.fastify.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(res.json()).toEqual({ supabase: { url: PROJECT, publishableKey: KEY } });
  });

  it('a first sign-in makes an account named from Discord, with its confirmed email recorded', async () => {
    const res = await complete(await tokenFor(discordUser()));
    expect(res.statusCode).toBe(200);
    const cookie = cookieOf(res, 'universe_auth')!;
    expect(cookie).toBeTruthy();
    const who = await me(cookie);
    expect(who.user).not.toBeNull();
    const ids = await db.selectFrom('identities').select(['provider', 'provider_subject']).where('user_id', '=', res.json().userId).orderBy('provider').execute();
    expect(ids).toEqual([
      { provider: 'email', provider_subject: 'player@example.com' },
      { provider: 'supabase', provider_subject: 'sb-user-1' },
    ]);
    const user = await db.selectFrom('users').select('display_name').where('id', '=', res.json().userId).executeTakeFirstOrThrow();
    expect(user.display_name).toBe('Ada from Discord');
  });

  it('signing in again reaches the same account, and nothing is recorded twice', async () => {
    const first = (await complete(await tokenFor(discordUser()))).json().userId;
    const again = await complete(await tokenFor(discordUser()));
    expect(again.json().userId).toBe(first);
    const ids = await db.selectFrom('identities').select('id').where('user_id', '=', first).execute();
    expect(ids).toHaveLength(2);
  });

  it('a confirmed email joins the account that already signs in with it by email link', async () => {
    const { userId } = await emailSignIn('player@example.com');
    const res = await complete(await tokenFor(discordUser()));
    expect(res.json().userId).toBe(userId);
    const ids = await db.selectFrom('identities').select('provider').where('user_id', '=', userId).execute();
    expect(ids.map((i) => i.provider).sort()).toEqual(['email', 'supabase']);
  });

  it('an unconfirmed email never joins an account and is not recorded', async () => {
    const { userId } = await emailSignIn('player@example.com');
    const res = await complete(await tokenFor(discordUser({ email_confirmed_at: null })));
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).not.toBe(userId);
    const ids = await db.selectFrom('identities').select('provider').where('user_id', '=', res.json().userId).execute();
    expect(ids.map((i) => i.provider)).toEqual(['supabase']);
  });

  it('a token\'s own user_metadata cannot claim a confirmed email: only Supabase\'s record counts', async () => {
    const { userId } = await emailSignIn('player@example.com');
    const user = discordUser({ email_confirmed_at: null, user_metadata: { email_verified: true } });
    const res = await complete(await tokenFor(user, { user_metadata: { email_verified: true }, email_confirmed_at: 'now' }));
    expect(res.json().userId).not.toBe(userId);
  });

  it('the admin page opens for a Discord sign-in whose confirmed email is an admin email', async () => {
    const res = await complete(await tokenFor(discordUser({ email: ADMIN })));
    const who = await me(cookieOf(res, 'universe_auth')!);
    expect(who.isAdmin).toBe(true);
    const unconfirmed = await complete(await tokenFor(discordUser({ id: 'sb-user-2', email: ADMIN, email_confirmed_at: null })));
    expect((await me(cookieOf(unconfirmed, 'universe_auth')!)).isAdmin).toBe(false);
  });

  it('a guest\'s account takes over the guest, and the browser\'s old session ends', async () => {
    const guestRes = await app.fastify.inject({ method: 'POST', url: '/api/guests', headers: { origin: ORIGIN }, payload: { displayName: 'Guest' } });
    const guestCookie = cookieOf(guestRes, 'universe_guest')!;
    const guestId = guestRes.json().guest?.id ?? (await db.selectFrom('guests').select('id').executeTakeFirstOrThrow()).id;
    const { cookie: oldSession } = await emailSignIn('someone-else@example.com');

    const res = await complete(await tokenFor(discordUser()), `${guestCookie}; ${oldSession}`);
    expect(res.statusCode).toBe(200);
    const guest = await db.selectFrom('guests').select('upgraded_to_user_id').where('id', '=', guestId).executeTakeFirstOrThrow();
    expect(guest.upgraded_to_user_id).toBe(res.json().userId);
    const old = await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie: oldSession } });
    expect((old.json() as MeResponse).user).toBeNull();
  });

  describe('refused tokens change nothing', () => {
    async function refused(token: unknown) {
      const { cookie } = await emailSignIn('someone-else@example.com');
      const sessionsBefore = await db.selectFrom('auth_sessions').select('id').execute();
      const usersBefore = await db.selectFrom('users').select('id').execute();
      const res = await complete(token, cookie);
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('sign_in_refused');
      expect(cookieOf(res, 'universe_auth')).toBeNull();
      expect(await db.selectFrom('auth_sessions').select('id').execute()).toEqual(sessionsBefore);
      expect(await db.selectFrom('users').select('id').execute()).toEqual(usersBefore);
      // The browser is still signed in as before.
      expect((await me(cookie)).user).not.toBeNull();
    }

    it('no token, or not a token', async () => {
      await refused(undefined);
      await refused('not-a-token');
    });
    it('signed by another key', async () => { await refused(await tokenFor(discordUser(), {}, otherKey)); });
    it('from another project', async () => { await refused(await tokenFor(discordUser(), { iss: 'https://evil.supabase.co/auth/v1' })); });
    it('for another audience', async () => { await refused(await tokenFor(discordUser(), { aud: 'anon' })); });
    it('expired', async () => {
      const nowS = Math.floor(Date.now() / 1000);
      await refused(await tokenFor(discordUser(), { iat: nowS - 7200, exp: nowS - 3600 }));
    });
    it('too old, though not expired: made more than five minutes ago', async () => {
      await refused(await tokenFor(discordUser(), { iat: Math.floor(Date.now() / 1000) - 600 }));
    });
    it('an anonymous Supabase user', async () => { await refused(await tokenFor(discordUser({ is_anonymous: true }), { is_anonymous: true })); });
    it('a token whose user Supabase does not know', async () => {
      const t = await tokenFor(discordUser());
      users.delete(t);
      await refused(t);
    });
    it('Supabase\'s record is for someone else', async () => {
      const t = await tokenFor(discordUser());
      users.set(t, discordUser({ id: 'sb-someone-else' }));
      await refused(t);
    });
    it('unsigned (alg none)', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const nowS = Math.floor(Date.now() / 1000);
      const t = `${b64({ alg: 'none' })}.${b64({ sub: 'sb-user-1', iss: supabaseIssuer(PROJECT), aud: 'authenticated', role: 'authenticated', iat: nowS, exp: nowS + 3600 })}.`;
      users.set(t, discordUser());
      await refused(t);
    });
    it('the token is checked before Supabase is asked about the user', async () => {
      await refused(await tokenFor(discordUser(), {}, otherKey));
      expect(lookups).toBe(0);
    });
  });

  it('another site cannot post a token (the Origin check)', async () => {
    const res = await app.fastify.inject({
      method: 'POST', url: '/api/auth/supabase/complete', headers: { origin: 'https://evil.example' },
      payload: { accessToken: await tokenFor(discordUser()) },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('sign-in through Supabase, not set up', () => {
  it('offers nothing and the route answers 404', async () => {
    const database = await createDatabase(':memory:');
    const app = buildApp({
      db: database.db, engine: new FakeEngine(), mailer: new ConsoleMailer(), secretKey: 's', appOrigin: ORIGIN,
      allowedOrigins: [ORIGIN], secureCookies: false, logger: false,
    });
    await app.fastify.ready();
    expect((await app.fastify.inject({ method: 'GET', url: '/api/auth/providers' })).json()).toEqual({ supabase: null });
    const res = await app.fastify.inject({ method: 'POST', url: '/api/auth/supabase/complete', headers: { origin: ORIGIN }, payload: { accessToken: 'x' } });
    expect(res.statusCode).toBe(404);
    await app.fastify.close();
    await database.close();
  });
});

describe('the Supabase settings', () => {
  it('both or neither, https, the project address only', () => {
    expect(parseSupabase(undefined, undefined)).toBeNull();
    expect(parseSupabase(' ', '')).toBeNull();
    expect(parseSupabase('https://abc.supabase.co/', 'k')).toEqual({ url: 'https://abc.supabase.co', publishableKey: 'k' });
    expect(parseSupabase('http://localhost:54321', 'k')).toEqual({ url: 'http://localhost:54321', publishableKey: 'k' });
    expect(() => parseSupabase('https://abc.supabase.co', undefined)).toThrow(/together/);
    expect(() => parseSupabase(undefined, 'k')).toThrow(/together/);
    expect(() => parseSupabase('http://abc.supabase.co', 'k')).toThrow(/https/);
    expect(() => parseSupabase('https://abc.supabase.co/auth/v1', 'k')).toThrow(/no path/);
    expect(() => parseSupabase('not a url', 'k')).toThrow(/not an address/);
  });
});
