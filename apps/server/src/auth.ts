// Auth module: passwordless sign-in by email link, behind a small interface
// so the provider can be swapped without touching routes. The dev
// implementation logs the sign-in link to the console instead of sending it.

import { createHash, randomBytes } from 'node:crypto';

/** Sends the sign-in link with the given token to a person's email address. */
export interface EmailLinker {
  sendSignInLink(email: string, url: string): Promise<void>;
}

/** Development linker: prints the link so anyone can complete the flow. */
export class ConsoleEmailLinker implements EmailLinker {
  async sendSignInLink(email: string, url: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[auth] sign-in link for ${email}: ${url}`);
  }
}

// Pending email-link requests, kept in memory: fine at one-dyno scale and
// for development. A durable store replaces this when the volume asks for it.
interface PendingLink {
  tokenHash: string;
  email: string;
  expiresAt: number;
}

const pending = new Map<string, PendingLink>();
const TTL_MS = 15 * 60 * 1000;

export function issueLinkToken(email: string): string {
  const token = randomBytes(32).toString('base64url');
  const record: PendingLink = {
    tokenHash: createHash('sha256').update(token).digest('hex'),
    email,
    expiresAt: Date.now() + TTL_MS,
  };
  pending.set(record.tokenHash, record);
  return token;
}

/** Returns the email a token was issued to, consuming it. */
export function consumeLinkToken(token: string): string | null {
  const hash = createHash('sha256').update(token).digest('hex');
  const record = pending.get(hash);
  if (!record) return null;
  pending.delete(hash);
  if (record.expiresAt < Date.now()) return null;
  return record.email;
}
