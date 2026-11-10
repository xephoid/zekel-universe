// Passwordless sign-in by email link. Tokens are random, stored hashed in
// the database with a short expiry, and consumed on first use. Issuing is
// rate limited per address and per client so the endpoint cannot be used to
// spam an inbox.
//
// A link only works in the browser that asked for it (SEC-03-F11): asking
// sets a random nonce in a cookie, the link row stores its hash, and
// redemption must present the same nonce. Someone who mails their own link
// to another person cannot sign that person's browser into their account,
// and so cannot take that browser's guest seats.

import type { Kysely } from 'kysely';
import type { DB } from './db/schema.js';
import { newId, newToken, hashToken, now } from './identity.js';

export const LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A guest token works this long after it is made: the cookie's own
 *  lifetime, now enforced by the server as well (SEC-04-F12). */
export const GUEST_TTL_MS = 365 * 24 * 60 * 60 * 1000;

/** A nonce cookie value is a token from newToken(): 32 bytes, base64url. */
export function isWellFormedNonce(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** When a guest row stops working. Rows from before schema 6 carry no
 *  expiry of their own and expire GUEST_TTL_MS after they were made. */
export function guestExpiresAt(row: { created_at: string; expires_at: string | null }): number {
  if (row.expires_at) return new Date(row.expires_at).getTime();
  const created = new Date(row.created_at).getTime();
  return Number.isFinite(created) ? created + GUEST_TTL_MS : 0;
}

/** Issue a sign-in token for an address, bound to the asking browser's
 *  nonce; returns the raw token to email. */
export async function issueSignInLink(db: Kysely<DB>, email: string, nonce: string): Promise<string> {
  const token = newToken();
  await db.insertInto('sign_in_links').values({
    id: newId(),
    token_hash: hashToken(token),
    email,
    created_at: now(),
    expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
    nonce_hash: hashToken(nonce),
  }).execute();
  return token;
}

/** Returns the email a token was issued to, consuming it; null when invalid.
 *  The delete is the check: exactly one concurrent redemption can win. A
 *  token presented with the wrong nonce matches no row, so it is refused
 *  and left for the browser that asked for it. */
export async function consumeSignInLink(db: Kysely<DB>, token: string, nonce: string): Promise<string | null> {
  if (!isWellFormedNonce(nonce)) return null;
  const row = await db.deleteFrom('sign_in_links')
    .where('token_hash', '=', hashToken(token))
    .where('nonce_hash', '=', hashToken(nonce))
    .returning(['email', 'expires_at'])
    .executeTakeFirst();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row.email;
}

/** Drop expired links and sessions; called opportunistically. */
export async function sweepExpired(db: Kysely<DB>): Promise<void> {
  const cutoff = now();
  await db.deleteFrom('sign_in_links').where('expires_at', '<', cutoff).execute();
  await db.deleteFrom('auth_sessions').where('expires_at', '<', cutoff).execute();
}

/**
 * A small sliding-window rate limiter kept in memory. One dyno serves the
 * first instance, so this is enough; a shared store replaces it when the
 * server scales past one process.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private limit: number, private windowMs: number) {}

  /** Records a hit and returns false when the key is over its limit. */
  allow(key: string, at: number = Date.now()): boolean {
    const since = at - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(at);
    this.hits.set(key, list);
    return true;
  }
}
