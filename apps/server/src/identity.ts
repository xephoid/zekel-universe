// Identity helpers: who is making this request, and how tokens hash.

import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function now(): string {
  return new Date().toISOString();
}

/** A request carries either a signed-in user or a guest, identified by cookie. */
export type Principal =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestId: string };

export function principalLabel(p: Principal): string {
  return p.kind === 'user' ? `user:${p.userId}` : `guest:${p.guestId}`;
}
