// Passwordless sign-in by email link. Tokens are random, stored hashed in
// the database with a short expiry, and consumed on first use. Issuing is
// rate limited per address and per client so the endpoint cannot be used to
// spam an inbox.

import type { Kysely } from 'kysely';
import type { DB } from './db/schema.js';
import { newId, newToken, hashToken, now } from './identity.js';

export const LINK_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Issue a sign-in token for an address; returns the raw token to email. */
export async function issueSignInLink(db: Kysely<DB>, email: string): Promise<string> {
  const token = newToken();
  await db.insertInto('sign_in_links').values({
    id: newId(),
    token_hash: hashToken(token),
    email,
    created_at: now(),
    expires_at: new Date(Date.now() + LINK_TTL_MS).toISOString(),
  }).execute();
  return token;
}

/** Returns the email a token was issued to, consuming it; null when invalid. */
export async function consumeSignInLink(db: Kysely<DB>, token: string): Promise<string | null> {
  const hash = hashToken(token);
  const row = await db.selectFrom('sign_in_links')
    .select(['id', 'email', 'expires_at'])
    .where('token_hash', '=', hash)
    .executeTakeFirst();
  if (!row) return null;
  await db.deleteFrom('sign_in_links').where('id', '=', row.id).execute();
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
