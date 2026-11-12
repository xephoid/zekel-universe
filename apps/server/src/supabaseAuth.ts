// Sign-in with Discord or Google through Supabase (T09; decision D5).
//
// Supabase does only the trip to Discord or Google and back. The server
// runs Supabase's PKCE flow itself, so no Supabase token ever reaches the
// browser:
//
// 1. Start: the server makes a PKCE secret, keeps it in an HttpOnly cookie
//    in the browser that asked (page scripts cannot read it), and sends the
//    browser to Supabase's authorize address with the secret's hash.
// 2. Discord or Google send the player back through Supabase with a one-time
//    code. The page hands the code to the server.
// 3. The server trades code and secret for Supabase's tokens, checks the
//    access token, signs the player in with Universe's own cookie as the
//    email link does, and ends that Supabase session at once. The tokens are
//    then dropped; nothing keeps them.
//
// So a code is useless without the cookie of the browser that started the
// sign-in, Supabase accepts each code once, and the refresh token is never
// held anywhere that outlives the request.
//
// The access token is checked even though it comes straight from Supabase:
// signed by the project's own key (asymmetric only, so the project must use
// Supabase's "JWT signing keys"), for the project's issuer, for signed-in
// users, freshly made. Whether the email is confirmed comes from Supabase's
// own record of the user (GET /auth/v1/user), never from the token's
// user_metadata, which the user can edit.

import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** The sign-in buttons offered. */
export const SIGN_IN_PROVIDERS = ['discord', 'google'] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];

export function isSignInProvider(v: unknown): v is SignInProvider {
  return typeof v === 'string' && (SIGN_IN_PROVIDERS as readonly string[]).includes(v);
}

/** Who Supabase says signed in. */
export interface SupabaseSignIn {
  /** Supabase's user id: the identity's subject in Universe. */
  subject: string;
  /** The email, lower case, only when Supabase has it confirmed. */
  confirmedEmail: string | null;
  /** A name to start the account with, from Discord or Google. */
  displayName: string | null;
}

export interface SupabaseAuthOptions {
  /** The project's address, e.g. https://abcd.supabase.co */
  url: string;
  /** The project's publishable key (public; sent as Supabase's apikey). */
  publishableKey: string;
  /** Tests pass their own keys; otherwise the project's public keys. */
  keys?: JWTVerifyGetKey;
  /** Tests pass their own; otherwise fetch. */
  fetchFn?: typeof fetch;
  /** How old an access token may be, in seconds. */
  maxTokenAgeS?: number;
}

/** What the routes in app.ts need from Supabase. */
export interface SupabaseService {
  /** Supabase's address to send the browser to. */
  authorizeUrl(provider: SignInProvider, redirectTo: string, challenge: string): string;
  /** Trade a one-time code and its PKCE secret for an access token. Throws
   *  SupabaseTokenError, whose `final` says whether the code is spent. */
  exchange(code: string, verifier: string): Promise<string>;
  /** Check an access token and read Supabase's record of its user. */
  check(token: string): Promise<SupabaseSignIn>;
  /** End the Supabase session behind an access token. */
  end(token: string): Promise<void>;
}

/** A sign-in is refused. `reason` is for logs and tests, not for players.
 *  `final`: trying again with the same code cannot work. */
export class SupabaseTokenError extends Error {
  constructor(readonly reason: string, readonly final = true) { super(reason); }
}

/** Long enough for a slow server; the token was made a moment ago. */
export const DEFAULT_MAX_TOKEN_AGE_S = 300;

export function supabaseIssuer(url: string): string {
  return `${url.replace(/\/$/, '')}/auth/v1`;
}

/** A PKCE secret and its S256 hash (RFC 7636). The secret is 43 characters
 *  of base64url, inside the allowed 43 to 128. */
export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function isWellFormedVerifier(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
}

export function supabaseService(opts: SupabaseAuthOptions): SupabaseService {
  const issuer = supabaseIssuer(opts.url);
  const keys = opts.keys ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const fetchFn = opts.fetchFn ?? fetch;
  const maxTokenAge = opts.maxTokenAgeS ?? DEFAULT_MAX_TOKEN_AGE_S;
  const call = async (path: string, init: RequestInit, token?: string): Promise<Response> => {
    try {
      return await fetchFn(`${issuer}${path}`, {
        ...init,
        headers: {
          apikey: opts.publishableKey,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init.body ? { 'content-type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SupabaseTokenError('supabase_unreachable', false);
    }
  };

  return {
    authorizeUrl(provider, redirectTo, challenge) {
      const q = new URLSearchParams({
        provider, redirect_to: redirectTo, code_challenge: challenge, code_challenge_method: 's256',
      });
      return `${issuer}/authorize?${q.toString()}`;
    },

    async exchange(code, verifier) {
      const res = await call('/token?grant_type=pkce', {
        method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
      });
      // A 4xx: the code or secret is wrong, used or expired. A 429 or a 5xx:
      // Supabase did not take the code, which may still work later.
      if (!res.ok) throw new SupabaseTokenError(`exchange_status_${res.status}`, res.status < 500 && res.status !== 429);
      const body = (await res.json().catch(() => null)) as { access_token?: unknown } | null;
      if (!body || typeof body.access_token !== 'string' || !body.access_token) {
        throw new SupabaseTokenError('exchange_no_token');
      }
      return body.access_token;
    },

    async check(token) {
      if (!token || token.length > 8192) throw new SupabaseTokenError('missing_or_oversized');
      let payload;
      try {
        ({ payload } = await jwtVerify(token, keys, {
          issuer,
          audience: 'authenticated',
          algorithms: ['ES256', 'RS256'],
          maxTokenAge,
          requiredClaims: ['sub', 'exp', 'iat'],
        }));
      } catch (e) {
        throw new SupabaseTokenError(`token_rejected: ${(e as { code?: string }).code ?? 'unknown'}`);
      }
      if (payload['role'] !== 'authenticated') throw new SupabaseTokenError('not_authenticated_role');
      if (payload['is_anonymous'] === true) throw new SupabaseTokenError('anonymous_user');
      const subject = payload.sub!;

      // Supabase's own record of the user: the confirmed email lives here.
      const res = await call('/user', { method: 'GET' }, token);
      if (!res.ok) throw new SupabaseTokenError(`user_lookup_status_${res.status}`);
      const user = (await res.json().catch(() => null)) as SupabaseUserRecord | null;
      if (!user || user.id !== subject) throw new SupabaseTokenError('user_mismatch');
      if (user.is_anonymous === true) throw new SupabaseTokenError('anonymous_user');

      const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
      const confirmed = !!email && typeof user.email_confirmed_at === 'string' && user.email_confirmed_at !== '';
      return { subject, confirmedEmail: confirmed ? email : null, displayName: displayNameOf(user) };
    },

    async end(token) {
      const res = await call('/logout?scope=local', { method: 'POST' }, token);
      // 204 when ended; 401 or 404 when Supabase had already ended it.
      if (!res.ok && res.status !== 401 && res.status !== 404) throw new SupabaseTokenError(`logout_status_${res.status}`);
    },
  };
}

interface SupabaseUserRecord {
  id?: unknown;
  email?: unknown;
  email_confirmed_at?: unknown;
  is_anonymous?: unknown;
  user_metadata?: Record<string, unknown>;
}

/** A starting name only: the player can change it on their profile. */
function displayNameOf(user: SupabaseUserRecord): string | null {
  const m = user.user_metadata ?? {};
  for (const k of ['full_name', 'name', 'user_name', 'preferred_username']) {
    const v = m[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 40);
  }
  return null;
}
