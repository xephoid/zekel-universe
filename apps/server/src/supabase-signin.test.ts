// Sign-in with Discord or Google through Supabase (T09), run by the server.
// Supabase is stood in for: a key pair made here signs its tokens, and a
// fake answers its authorize, token, user and logout calls the way Supabase
// does (a code is tied to the PKCE hash it was issued for and trades once).
// No network. Covered: the start (the secret stays in an HttpOnly cookie,
// only its hash leaves); a code is useless in another browser, twice, or at
// once; every refused token changes nothing; which account a sign-in
// reaches; the guest's move; the old session's end; the admin check; the
// email link left alone; a lost answer; and the settings.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Kysely } from 'kysely';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import type { MeResponse } from '@universe/shared';
import type { DB } from './db/schema.js';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { isWellFormedVerifier, newPkcePair, pkceChallenge, supabaseIssuer, supabaseService } from './supabaseAuth.js';
import { parseSupabase } from './config.js';
import { FakeEngine } from './test-engine.js';

const ORIGIN = 'http://localhost:5173';
const PROJECT = 'https://testproject.supabase.co';
const KEY = 'sb_publishable_test';
const ADMIN = 'boss@example.com';

type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

interface FakeUser { id: string; email?: string; email_confirmed_at?: string | null; is_anonymous?: boolean; user_metadata?: Record<string, unknown> }

/** How the fake Supabase mints the token for a code: changes to its claims
 *  or key, to test the server's check. */
interface Minting { over?: JWTPayload; key?: 'other'; unsigned?: boolean; record?: FakeUser | null }

describe('sign-in through Supabase', () => {
  let database: DatabaseClient;
  let db: Kysely<DB>;
  let app: UniverseApp;
  let mailer: ConsoleMailer;
  let projectKey: KeyPair;
  let otherKey: KeyPair;
  /** Supabase's user records, by access token (deleted on logout). */
  let users: Map<string, FakeUser>;
  /** Codes Supabase has issued: the PKCE hash, the user, how to mint. */
  let codes: Map<string, { challenge: string; user: FakeUser; minting: Minting }>;
  let exchanges: number;
  let lookups: number;
  let logouts: number;
  let exchangeDown: boolean;
  let logoutFails: boolean;
  let codeSeq = 0;

  beforeEach(async () => {
    projectKey = await generateKeyPair('ES256');
    otherKey = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(projectKey.publicKey)), kid: 'k1', alg: 'ES256' };
    users = new Map();
    codes = new Map();
    exchanges = 0; lookups = 0; logouts = 0;
    exchangeDown = false; logoutFails = false;

    const fetchFn = (async (url: string | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.apikey).toBe(KEY);
      const u = String(url);
      if (u === `${PROJECT}/auth/v1/token?grant_type=pkce`) {
        exchanges++;
        if (exchangeDown) return new Response('{}', { status: 503 });
        const { auth_code, code_verifier } = JSON.parse(String(init?.body)) as { auth_code: string; code_verifier: string };
        const issued = codes.get(auth_code);
        // Supabase: a code trades once, and only with the secret whose hash it was issued for.
        if (!issued || pkceChallenge(code_verifier) !== issued.challenge) return new Response('{"error":"invalid_grant"}', { status: 400 });
        codes.delete(auth_code);
        const token = await mint(issued.user, issued.minting);
        return new Response(JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer' }), { status: 200 });
      }
      const token = (headers.authorization ?? '').replace(/^Bearer /, '');
      if (u === `${PROJECT}/auth/v1/logout?scope=local`) {
        expect(init?.method).toBe('POST');
        logouts++;
        if (logoutFails) return new Response('{}', { status: 500 });
        return users.delete(token) ? new Response(null, { status: 204 }) : new Response('{}', { status: 401 });
      }
      if (u === `${PROJECT}/auth/v1/user`) {
        lookups++;
        const user = users.get(token);
        return user ? new Response(JSON.stringify(user), { status: 200 }) : new Response('{}', { status: 401 });
      }
      throw new Error(`unexpected Supabase call ${u}`);
    }) as typeof fetch;

    database = await createDatabase(':memory:');
    db = database.db;
    mailer = new ConsoleMailer();
    app = buildApp({
      db, engine: new FakeEngine(), mailer, secretKey: 's', appOrigin: ORIGIN, allowedOrigins: [ORIGIN],
      secureCookies: false, logger: false, adminEmails: [ADMIN],
      supabase: supabaseService({ url: PROJECT, publishableKey: KEY, keys: createLocalJWKSet({ keys: [jwk] }), fetchFn }),
    });
    await app.fastify.ready();
  });

  afterEach(async () => {
    await app.fastify.close();
    await database.close();
  });

  /** A token as Supabase would make it for this user. */
  async function mint(user: FakeUser, m: Minting = {}): Promise<string> {
    const nowS = Math.floor(Date.now() / 1000);
    const over = m.over ?? {};
    let token: string;
    if (m.unsigned) {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      token = `${b64({ alg: 'none' })}.${b64({ sub: user.id, iss: supabaseIssuer(PROJECT), aud: 'authenticated', role: 'authenticated', iat: nowS, exp: nowS + 3600 })}.`;
    } else {
      token = await new SignJWT({ role: 'authenticated', is_anonymous: false, email: user.email, ...over })
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setSubject(user.id)
        .setIssuer(typeof over.iss === 'string' ? over.iss : supabaseIssuer(PROJECT))
        .setAudience(typeof over.aud === 'string' ? over.aud : 'authenticated')
        .setIssuedAt(typeof over.iat === 'number' ? over.iat : nowS)
        .setExpirationTime(typeof over.exp === 'number' ? over.exp : nowS + 3600)
        .sign((m.key === 'other' ? otherKey : projectKey).privateKey);
    }
    if (m.record !== null) users.set(token, m.record ?? user);
    return token;
  }

  function cookieOf(res: { headers: Record<string, unknown> }, name: string): string | null {
    const raw = res.headers['set-cookie'];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const hit = list.find((c) => typeof c === 'string' && c.startsWith(`${name}=`)) as string | undefined;
    return hit ? hit.split(';')[0]! : null;
  }
  function setCookieLine(res: { headers: Record<string, unknown> }, name: string): string | null {
    const raw = res.headers['set-cookie'];
    const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);
    return list.find((c) => c.startsWith(`${name}=`)) ?? null;
  }

  const post = (url: string, payload: object, cookie?: string) => app.fastify.inject({
    method: 'POST', url, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) }, payload,
  });

  /** A browser starts a sign-in; Discord says yes; Supabase issues a code
   *  for that browser's PKCE hash. Returns the browser's cookie and the code. */
  async function viaDiscord(user: FakeUser, minting: Minting = {}, provider = 'discord'): Promise<{ oauth: string; code: string; url: URL }> {
    const res = await post('/api/auth/supabase/start', { provider });
    expect(res.statusCode).toBe(200);
    const url = new URL(res.json().url);
    const code = `code-${++codeSeq}`;
    codes.set(code, { challenge: url.searchParams.get('code_challenge')!, user, minting });
    return { oauth: cookieOf(res, 'universe_oauth')!, code, url };
  }

  const complete = (code: unknown, cookie?: string) => post('/api/auth/supabase/complete', { code }, cookie);
  const join = (...c: Array<string | null | undefined>) => c.filter(Boolean).join('; ');

  const me = async (cookie: string): Promise<MeResponse> =>
    (await app.fastify.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json();

  async function emailLink(email: string): Promise<{ signin: string; token: string }> {
    const link = await post('/api/auth/email/link', { email });
    const url = /https?:\/\/\S+/.exec(mailer.sent[mailer.sent.length - 1]!.text)![0];
    return { signin: cookieOf(link, 'universe_signin')!, token: decodeURIComponent(url.split('#token=')[1]!) };
  }
  async function emailSignIn(email: string): Promise<{ cookie: string; userId: string }> {
    const { signin, token } = await emailLink(email);
    const done = await post('/api/auth/email/complete', { token }, signin);
    expect(done.statusCode).toBe(200);
    return { cookie: cookieOf(done, 'universe_auth')!, userId: done.json().userId };
  }

  /** The whole trip, one browser; returns the completion's answer. */
  async function signInWith(user: FakeUser, cookie?: string, minting: Minting = {}) {
    const { oauth, code } = await viaDiscord(user, minting);
    return complete(code, join(oauth, cookie));
  }

  const discordUser = (over: Partial<FakeUser> = {}): FakeUser => ({
    id: 'sb-user-1', email: 'Player@Example.com', email_confirmed_at: '2026-11-12T00:00:00Z',
    user_metadata: { full_name: 'Ada from Discord' }, ...over,
  });

  it('the providers route lists the buttons, and gives the page nothing else', async () => {
    const res = await app.fastify.inject({ method: 'GET', url: '/api/auth/providers' });
    expect(res.json()).toEqual({ providers: ['discord', 'google'] });
  });

  it('start keeps the PKCE secret in an HttpOnly cookie and sends only its hash to Supabase', async () => {
    const res = await post('/api/auth/supabase/start', { provider: 'google' });
    const line = setCookieLine(res, 'universe_oauth')!;
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//);
    expect(line).toMatch(/Max-Age=600/);
    const verifier = cookieOf(res, 'universe_oauth')!.split('=')[1]!;
    expect(isWellFormedVerifier(verifier)).toBe(true);
    const url = new URL(res.json().url);
    expect(`${url.origin}${url.pathname}`).toBe(`${PROJECT}/auth/v1/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      provider: 'google', redirect_to: `${ORIGIN}/auth/callback`,
      code_challenge: pkceChallenge(verifier), code_challenge_method: 's256',
    });
    expect(res.body).not.toContain(verifier);
    // The email link's cookie is not touched.
    expect(setCookieLine(res, 'universe_signin')).toBeNull();
  });

  it('start refuses a provider that is not offered', async () => {
    expect((await post('/api/auth/supabase/start', { provider: 'github' })).statusCode).toBe(400);
    expect((await post('/api/auth/supabase/start', {})).statusCode).toBe(400);
  });

  it('a first sign-in makes an account named from Discord, records its confirmed email, and ends the Supabase session', async () => {
    const res = await signInWith(discordUser());
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/access_token|refresh/);
    const cookie = cookieOf(res, 'universe_auth')!;
    expect((await me(cookie)).user).not.toBeNull();
    const ids = await db.selectFrom('identities').select(['provider', 'provider_subject']).where('user_id', '=', res.json().userId).orderBy('provider').execute();
    expect(ids).toEqual([
      { provider: 'email', provider_subject: 'player@example.com' },
      { provider: 'supabase', provider_subject: 'sb-user-1' },
    ]);
    const user = await db.selectFrom('users').select('display_name').where('id', '=', res.json().userId).executeTakeFirstOrThrow();
    expect(user.display_name).toBe('Ada from Discord');
    expect(logouts).toBe(1);
    expect(users.size).toBe(0); // Supabase no longer knows the token
    expect(setCookieLine(res, 'universe_oauth')).toMatch(/^universe_oauth=;/);
  });

  it('signing in again reaches the same account, and nothing is recorded twice', async () => {
    const first = (await signInWith(discordUser())).json().userId;
    const again = await signInWith(discordUser());
    expect(again.json().userId).toBe(first);
    expect(await db.selectFrom('identities').select('id').where('user_id', '=', first).execute()).toHaveLength(2);
  });

  it('a confirmed email joins the account that already signs in with it by email link', async () => {
    const { userId } = await emailSignIn('player@example.com');
    const res = await signInWith(discordUser());
    expect(res.json().userId).toBe(userId);
    const ids = await db.selectFrom('identities').select('provider').where('user_id', '=', userId).execute();
    expect(ids.map((i) => i.provider).sort()).toEqual(['email', 'supabase']);
  });

  it('an unconfirmed email never joins an account and is not recorded', async () => {
    const { userId } = await emailSignIn('player@example.com');
    const res = await signInWith(discordUser({ email_confirmed_at: null }));
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).not.toBe(userId);
    const ids = await db.selectFrom('identities').select('provider').where('user_id', '=', res.json().userId).execute();
    expect(ids.map((i) => i.provider)).toEqual(['supabase']);
  });

  it('a token\'s own user_metadata cannot claim a confirmed email: only Supabase\'s record counts', async () => {
    const { userId } = await emailSignIn('player@example.com');
    const user = discordUser({ email_confirmed_at: null, user_metadata: { email_verified: true } });
    const res = await signInWith(user, undefined, { over: { user_metadata: { email_verified: true }, email_confirmed_at: 'now' } });
    expect(res.json().userId).not.toBe(userId);
  });

  it('the admin page opens for a Discord sign-in whose confirmed email is an admin email, and not for an unconfirmed one', async () => {
    const res = await signInWith(discordUser({ email: ADMIN }));
    expect((await me(cookieOf(res, 'universe_auth')!)).isAdmin).toBe(true);
    const unconfirmed = await signInWith(discordUser({ id: 'sb-user-2', email: ADMIN, email_confirmed_at: null }));
    expect((await me(cookieOf(unconfirmed, 'universe_auth')!)).isAdmin).toBe(false);
  });

  it('a guest\'s account takes over the guest, and the browser\'s old session ends', async () => {
    const guestRes = await post('/api/guests', { displayName: 'Guest' });
    const guestCookie = cookieOf(guestRes, 'universe_guest')!;
    const guestId = (await db.selectFrom('guests').select('id').executeTakeFirstOrThrow()).id;
    const { cookie: oldSession } = await emailSignIn('someone-else@example.com');

    const res = await signInWith(discordUser(), join(guestCookie, oldSession));
    expect(res.statusCode).toBe(200);
    const guest = await db.selectFrom('guests').select('upgraded_to_user_id').where('id', '=', guestId).executeTakeFirstOrThrow();
    expect(guest.upgraded_to_user_id).toBe(res.json().userId);
    expect((await me(oldSession)).user).toBeNull();
  });

  describe('a code is useless anywhere but the browser that started its sign-in, and only once', () => {
    async function nothingChanges(run: () => Promise<{ statusCode: number; json(): { error?: string } }>, error = 'sign_in_refused') {
      const { cookie } = await emailSignIn('someone-else@example.com');
      const before = { s: await db.selectFrom('auth_sessions').select('id').execute(), u: await db.selectFrom('users').select('id').execute() };
      const res = await run();
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe(error);
      expect(await db.selectFrom('auth_sessions').select('id').execute()).toEqual(before.s);
      expect(await db.selectFrom('users').select('id').execute()).toEqual(before.u);
      expect((await me(cookie)).user).not.toBeNull();
      return cookie;
    }

    it('in another browser, even one that started its own sign-in', async () => {
      const victim = await viaDiscord(discordUser());
      const attacker = await viaDiscord(discordUser({ id: 'sb-attacker' }));
      await nothingChanges(() => complete(victim.code, attacker.oauth));
      // The rightful browser can still finish.
      expect((await complete(victim.code, victim.oauth)).statusCode).toBe(200);
    });

    it('in a browser with no sign-in in progress: refused before Supabase is asked', async () => {
      const { code } = await viaDiscord(discordUser());
      await nothingChanges(() => complete(code), 'sign_in_wrong_browser');
      expect(exchanges).toBe(0);
    });

    it('twice', async () => {
      const { oauth, code } = await viaDiscord(discordUser());
      expect((await complete(code, oauth)).statusCode).toBe(200);
      await nothingChanges(() => complete(code, oauth));
    });

    it('twice at the same moment: one sign-in', async () => {
      const { oauth, code } = await viaDiscord(discordUser());
      const [a, b] = await Promise.all([complete(code, oauth), complete(code, oauth)]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 401]);
      expect(await db.selectFrom('auth_sessions').select('id').execute()).toHaveLength(1);
    });

    it('a code Supabase never issued, or none', async () => {
      const { oauth } = await viaDiscord(discordUser());
      await nothingChanges(() => complete('made-up', oauth));
      await nothingChanges(() => complete(undefined, oauth));
    });
  });

  describe('a token that fails the check changes nothing, and its Supabase session is still ended', () => {
    async function refused(minting: Minting, user = discordUser()) {
      const { cookie } = await emailSignIn('someone-else@example.com');
      const before = { s: await db.selectFrom('auth_sessions').select('id').execute(), u: await db.selectFrom('users').select('id').execute() };
      const res = await signInWith(user, cookie, minting);
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('sign_in_refused');
      expect(cookieOf(res, 'universe_auth')).toBeNull();
      expect(await db.selectFrom('auth_sessions').select('id').execute()).toEqual(before.s);
      expect(await db.selectFrom('users').select('id').execute()).toEqual(before.u);
      expect((await me(cookie)).user).not.toBeNull();
      expect(logouts).toBe(1);
    }
    it('signed by another key', async () => { await refused({ key: 'other' }); });
    it('unsigned (alg none)', async () => { await refused({ unsigned: true }); });
    it('from another project', async () => { await refused({ over: { iss: 'https://evil.supabase.co/auth/v1' } }); });
    it('for another audience', async () => { await refused({ over: { aud: 'anon' } }); });
    it('expired', async () => {
      const nowS = Math.floor(Date.now() / 1000);
      await refused({ over: { iat: nowS - 7200, exp: nowS - 3600 } });
    });
    it('made more than five minutes ago', async () => { await refused({ over: { iat: Math.floor(Date.now() / 1000) - 600 } }); });
    it('an anonymous Supabase user', async () => { await refused({ over: { is_anonymous: true } }, discordUser({ is_anonymous: true })); });
    it('a token whose user Supabase does not know', async () => { await refused({ record: null }); });
    it('Supabase\'s record is for someone else', async () => { await refused({ record: discordUser({ id: 'sb-someone-else' }) }); });
    it('the signature is checked before Supabase is asked about the user', async () => {
      await refused({ key: 'other' });
      expect(lookups).toBe(0);
    });
  });

  it('when Supabase cannot answer the trade, the sign-in can be tried again with the same code', async () => {
    const { oauth, code } = await viaDiscord(discordUser());
    exchangeDown = true;
    const down = await complete(code, oauth);
    expect(down.statusCode).toBe(503);
    expect(setCookieLine(down, 'universe_oauth')).toBeNull(); // the secret stays
    exchangeDown = false;
    expect((await complete(code, oauth)).statusCode).toBe(200);
  });

  it('when Supabase cannot end its session, the sign-in still stands', async () => {
    logoutFails = true;
    const res = await signInWith(discordUser());
    expect(res.statusCode).toBe(200);
    expect(cookieOf(res, 'universe_auth')).toBeTruthy();
  });

  it('when the answer is lost, the browser can ask whether that code signed it in', async () => {
    const { oauth, code } = await viaDiscord(discordUser());
    const res = await complete(code, oauth);
    const cookie = cookieOf(res, 'universe_auth')!;
    const status = (c: unknown, k?: string) => post('/api/auth/supabase/status', { code: c }, k);
    expect((await status(code, cookie)).json()).toEqual({ signedIn: true, userId: res.json().userId });
    expect((await status('another-code', cookie)).json()).toEqual({ signedIn: false });
    expect((await status(code)).json()).toEqual({ signedIn: false });
    const { cookie: otherBrowser } = await emailSignIn('someone-else@example.com');
    expect((await status(code, otherBrowser)).json()).toEqual({ signedIn: false });
  });

  it('a pending email link survives a Discord sign-in in the same browser, and the other way round', async () => {
    // Email link asked, then Discord completed, then the link opened.
    const pending = await emailLink('player@example.com');
    const discord = await signInWith(discordUser({ id: 'sb-a', email: 'a@example.com' }), pending.signin);
    expect(setCookieLine(discord, 'universe_signin')).toBeNull();
    expect((await post('/api/auth/email/complete', { token: pending.token }, pending.signin)).statusCode).toBe(200);
    // Discord started, then an email link completed, then Discord finished.
    const trip = await viaDiscord(discordUser({ id: 'sb-b', email: 'b@example.com' }));
    const link = await emailLink('c@example.com');
    const emailDone = await post('/api/auth/email/complete', { token: link.token }, join(link.signin, trip.oauth));
    expect(emailDone.statusCode).toBe(200);
    expect(setCookieLine(emailDone, 'universe_oauth')).toBeNull();
    expect((await complete(trip.code, trip.oauth)).statusCode).toBe(200);
  });

  it('the page security policy is unchanged: the browser never talks to Supabase itself', async () => {
    const res = await app.fastify.inject({ method: 'GET', url: '/signin' });
    expect(String(res.headers['content-security-policy'])).toContain("connect-src 'self' ws: wss:;");
  });

  it('another site cannot start or finish a sign-in (the Origin check)', async () => {
    const hostile = { origin: 'https://evil.example' };
    expect((await app.fastify.inject({ method: 'POST', url: '/api/auth/supabase/start', headers: hostile, payload: { provider: 'discord' } })).statusCode).toBe(403);
    const { oauth, code } = await viaDiscord(discordUser());
    expect((await app.fastify.inject({ method: 'POST', url: '/api/auth/supabase/complete', headers: { ...hostile, cookie: oauth }, payload: { code } })).statusCode).toBe(403);
  });
});

describe('sign-in through Supabase, not set up', () => {
  it('offers nothing and the routes answer 404', async () => {
    const database = await createDatabase(':memory:');
    const app = buildApp({
      db: database.db, engine: new FakeEngine(), mailer: new ConsoleMailer(), secretKey: 's', appOrigin: ORIGIN,
      allowedOrigins: [ORIGIN], secureCookies: false, logger: false,
    });
    await app.fastify.ready();
    const send = (url: string, payload: object) => app.fastify.inject({ method: 'POST', url, headers: { origin: ORIGIN }, payload });
    expect((await app.fastify.inject({ method: 'GET', url: '/api/auth/providers' })).json()).toEqual({ providers: [] });
    expect((await send('/api/auth/supabase/start', { provider: 'discord' })).statusCode).toBe(404);
    expect((await send('/api/auth/supabase/complete', { code: 'x' })).statusCode).toBe(404);
    expect((await send('/api/auth/supabase/status', { code: 'x' })).json()).toEqual({ signedIn: false });
    await app.fastify.close();
    await database.close();
  });
});

describe('PKCE and the Supabase settings', () => {
  it('the secret and its hash follow RFC 7636 (its own example)', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const a = newPkcePair();
    const b = newPkcePair();
    expect(isWellFormedVerifier(a.verifier)).toBe(true);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).toBe(pkceChallenge(a.verifier));
  });

  it('settings: both or neither, https, the project address only', () => {
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
