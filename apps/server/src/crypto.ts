// AES-256-GCM encryption for engine host tokens at rest.
// The key comes from SECRET_KEY in the environment; a fixed dev key is used
// when it is unset so local development needs no setup.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'v1:';

function keyFromSecret(secret: string): Buffer {
  // Accept hex keys of the right length directly, hash anything else down to
  // 32 bytes so a passphrase also works.
  if (/^[0-9a-f]{64}$/i.test(secret)) return Buffer.from(secret, 'hex');
  return createHash('sha256').update(secret).digest();
}

export function encryptToken(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptToken(stored: string, secret: string): string {
  if (!stored.startsWith(PREFIX)) throw new Error('unrecognized token format');
  const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
