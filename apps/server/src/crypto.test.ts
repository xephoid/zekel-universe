import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken } from './crypto.js';

describe('host token encryption', () => {
  it('round-trips with a hex key', () => {
    const key = 'ab'.repeat(32);
    const stored = encryptToken('host-token-123', key);
    expect(stored).not.toContain('host-token-123');
    expect(decryptToken(stored, key)).toBe('host-token-123');
  });

  it('round-trips with a passphrase', () => {
    const stored = encryptToken('another-token', 'some dev passphrase');
    expect(decryptToken(stored, 'some dev passphrase')).toBe('another-token');
  });

  it('fails with the wrong key', () => {
    const stored = encryptToken('x', 'cd'.repeat(32));
    expect(() => decryptToken(stored, 'ef'.repeat(32))).toThrow();
  });
});
