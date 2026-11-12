import { describe, it, expect } from 'vitest';
import { createDatabase } from './db/index.js';
import { consumeSignInLink, issueSignInLink, RateLimiter } from './auth.js';
import { newToken } from './identity.js';
import { loadConfig } from './config.js';

describe('sign-in links', () => {
  it('issue then consume once; a second use fails', async () => {
    const database = await createDatabase(':memory:');
    const { db } = database;
    const nonce = newToken();
    const token = await issueSignInLink(db, 'a@example.com', nonce);
    expect(await consumeSignInLink(db, token, nonce)).toBe('a@example.com');
    expect(await consumeSignInLink(db, token, nonce)).toBeNull();
    expect(await consumeSignInLink(db, 'garbage', nonce)).toBeNull();
    await database.close();
  });

  it('a token with another browser\'s nonce, or none, is refused and left unused (SEC-03-F11)', async () => {
    const database = await createDatabase(':memory:');
    const { db } = database;
    const nonce = newToken();
    const token = await issueSignInLink(db, 'a@example.com', nonce);
    expect(await consumeSignInLink(db, token, newToken())).toBeNull();
    expect(await consumeSignInLink(db, token, '')).toBeNull();
    expect(await consumeSignInLink(db, token, 'short')).toBeNull();
    // The asking browser can still use it.
    expect(await consumeSignInLink(db, token, nonce)).toBe('a@example.com');
    await database.close();
  });
});

describe('rate limiter', () => {
  it('allows up to the limit inside the window, then refuses, then recovers', () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.allow('k', 0)).toBe(true);
    expect(rl.allow('k', 10)).toBe(true);
    expect(rl.allow('k', 20)).toBe(false);
    expect(rl.allow('other', 20)).toBe(true);
    expect(rl.allow('k', 1500)).toBe(true);
  });
});

describe('config', () => {
  it('fills development defaults and allows the dev origins', () => {
    const c = loadConfig({});
    expect(c.isProduction).toBe(false);
    expect(c.engineUrl).toBe('http://localhost:8787/mcp');
    expect(c.allowedOrigins).toContain('http://localhost:5173');
    expect(c.allowedOrigins).toContain('http://localhost:8788');
  });
  it('refuses to start in production without real secrets', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SECRET_KEY/);
    const c = loadConfig({
      NODE_ENV: 'production', SECRET_KEY: 's', ENGINE_TOKEN: 't', ENGINE_URL: 'http://e/mcp',
      APP_ORIGIN: 'https://play.example/', DATABASE_URL: 'postgres://x',
    });
    expect(c.isProduction).toBe(true);
    expect(c.allowedOrigins).toEqual(['https://play.example']);
  });
  it('listens on 127.0.0.1 outside production, 0.0.0.0 in production, and HOST wins', () => {
    const prod = { NODE_ENV: 'production', SECRET_KEY: 's', ENGINE_TOKEN: 't', ENGINE_URL: 'http://e/mcp', APP_ORIGIN: 'https://play.example', DATABASE_URL: 'postgres://x' };
    expect(loadConfig({}).host).toBe('127.0.0.1');
    expect(loadConfig({ NODE_ENV: 'development' }).host).toBe('127.0.0.1');
    expect(loadConfig({ HOST: '' }).host).toBe('127.0.0.1');
    expect(loadConfig(prod).host).toBe('0.0.0.0');
    expect(loadConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
    expect(loadConfig({ ...prod, HOST: '10.0.0.5' }).host).toBe('10.0.0.5');
  });
  it('takes the engine as a private host:port when no ENGINE_URL is set (render.yaml)', () => {
    const base = { NODE_ENV: 'production', SECRET_KEY: 's', ENGINE_TOKEN: 't', APP_ORIGIN: 'https://play.example', DATABASE_URL: 'postgres://x' };
    expect(() => loadConfig(base)).toThrow(/ENGINE_URL/);
    expect(loadConfig({ ...base, ENGINE_HOSTPORT: 'zekel-engine:8787' }).engineUrl).toBe('http://zekel-engine:8787/mcp');
    expect(loadConfig({ ...base, ENGINE_HOSTPORT: 'zekel-engine:8787', ENGINE_URL: 'http://e/mcp' }).engineUrl).toBe('http://e/mcp');
    for (const bad of ['zekel-engine', 'http://zekel-engine:8787', 'a:1/x', 'a b:1']) {
      expect(() => loadConfig({ ...base, ENGINE_HOSTPORT: bad }), bad).toThrow(/ENGINE_HOSTPORT/);
    }
  });
});

describe('dotenv', () => {
  it('reads KEY=value lines without overriding what is set', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { loadDotEnv } = await import('./config.js');
    const dir = mkdtempSync(join(tmpdir(), 'universe-env-'));
    writeFileSync(join(dir, '.env'), '# comment\nFOO=bar\nQUOTED="a b"\nSET_ALREADY=new\n');
    const env: NodeJS.ProcessEnv = { SET_ALREADY: 'old' };
    loadDotEnv(env, dir);
    expect(env.FOO).toBe('bar');
    expect(env.QUOTED).toBe('a b');
    expect(env.SET_ALREADY).toBe('old');
    loadDotEnv({ NODE_ENV: 'production' }, dir);
  });
});
