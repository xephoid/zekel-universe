// Sign-in with Discord or Google through Supabase (T09; decision D5).
//
// Supabase does only the trip to Discord or Google and back. The browser
// hands the server the access token Supabase gave it; the server checks it
// here and then signs the player in with Universe's own session cookie, as
// the email link does. Universe's accounts, sessions, guests and socket
// checks are unchanged.
//
// What is trusted, and why:
// - The token must be signed by our Supabase project's own key (its public
//   keys, fetched from the project), for our project's issuer, for signed-in
//   users, and fresh: it was made by a sign-in that just happened in this
//   browser. Only asymmetric keys are accepted, so the project must use
//   Supabase's "JWT signing keys", not the old shared secret.
// - Whether the email is confirmed comes from Supabase's own record of the
//   user (GET /auth/v1/user), never from the token's user_metadata, which
//   the user can edit.
// - Which browser it is: the browser trades Supabase's one-time code for
//   the token with the PKCE secret it kept when the sign-in began, so a code
//   or token mailed to someone else's browser does not work there, and the
//   server refuses POSTs from other sites (the Origin check in app.ts).

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

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
  /** How old a token may be, in seconds. */
  maxTokenAgeS?: number;
}

/** A token is refused. `reason` is for logs and tests, not for players. */
export class SupabaseTokenError extends Error {
  constructor(readonly reason: string) { super(reason); }
}

/** Long enough for a slow redirect back from Discord or Google; short
 *  enough that a token taken from somewhere later is useless. */
export const DEFAULT_MAX_TOKEN_AGE_S = 300;

export function supabaseIssuer(url: string): string {
  return `${url.replace(/\/$/, '')}/auth/v1`;
}

/** Returns a checker for this project's tokens. */
export function supabaseChecker(opts: SupabaseAuthOptions): (token: string) => Promise<SupabaseSignIn> {
  const issuer = supabaseIssuer(opts.url);
  const keys = opts.keys ?? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const fetchFn = opts.fetchFn ?? fetch;
  const maxTokenAge = opts.maxTokenAgeS ?? DEFAULT_MAX_TOKEN_AGE_S;

  return async (token: string) => {
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
    let res: Response;
    try {
      res = await fetchFn(`${issuer}/user`, {
        headers: { apikey: opts.publishableKey, authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SupabaseTokenError('user_lookup_failed');
    }
    if (!res.ok) throw new SupabaseTokenError(`user_lookup_status_${res.status}`);
    const user = (await res.json().catch(() => null)) as SupabaseUserRecord | null;
    if (!user || user.id !== subject) throw new SupabaseTokenError('user_mismatch');
    if (user.is_anonymous === true) throw new SupabaseTokenError('anonymous_user');

    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    const confirmed = !!email && typeof user.email_confirmed_at === 'string' && user.email_confirmed_at !== '';
    return {
      subject,
      confirmedEmail: confirmed ? email : null,
      displayName: displayNameOf(user),
    };
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

/** Returns a function that ends the Supabase session behind a token
 *  (POST /auth/v1/logout, this session only). Called once the token has
 *  signed a player in: Supabase then refuses that token, so it cannot sign
 *  anyone in a second time, whatever the browser does next. */
export function supabaseSessionEnder(opts: Pick<SupabaseAuthOptions, 'url' | 'publishableKey' | 'fetchFn'>): (token: string) => Promise<void> {
  const issuer = supabaseIssuer(opts.url);
  const fetchFn = opts.fetchFn ?? fetch;
  return async (token: string) => {
    const res = await fetchFn(`${issuer}/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: opts.publishableKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    // 204 when ended; 401 or 404 when Supabase had already ended it.
    if (!res.ok && res.status !== 401 && res.status !== 404) throw new SupabaseTokenError(`logout_status_${res.status}`);
  };
}
