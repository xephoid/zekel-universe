// Site analytics settings: what POSTHOG_KEY and POSTHOG_HOST accept, what
// /api/config hands the page, and the one origin the page policy gains.

import { describe, it, expect, afterEach } from 'vitest';
import type { ConfigResponse } from '@universe/shared';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { FakeEngine } from './test-engine.js';
import { DEFAULT_POSTHOG_HOST, parseAnalytics } from './analytics.js';
import { loadConfig } from './config.js';

// A made-up key of the right shape; not a real project.
const KEY = 'phc_' + 'a1'.repeat(16);
const ORIGIN = 'http://localhost:5173';

describe('parseAnalytics', () => {
  it('is off when no key is set', () => {
    expect(parseAnalytics(undefined, undefined)).toBeNull();
    expect(parseAnalytics('  ', '')).toBeNull();
  });

  it('defaults the host to the US cloud and trims a trailing slash', () => {
    expect(parseAnalytics(KEY, undefined)).toEqual({ key: KEY, host: DEFAULT_POSTHOG_HOST });
    expect(parseAnalytics(KEY, 'https://eu.i.posthog.com/')).toEqual({ key: KEY, host: 'https://eu.i.posthog.com' });
  });

  it('refuses a host without a key, a malformed key, and any host that is not a bare https origin', () => {
    expect(() => parseAnalytics('', 'https://us.i.posthog.com')).toThrow(/POSTHOG_KEY/);
    expect(() => parseAnalytics('phx_personal', undefined)).toThrow(/project key/);
    expect(() => parseAnalytics(`${KEY}'; script-src *`, undefined)).toThrow(/project key/);
    for (const host of ['http://us.i.posthog.com', 'https://us.i.posthog.com/ingest', 'us.i.posthog.com',
      "https://x.example 'unsafe-inline'", 'https://x.example; script-src *', 'https://x.example?q=1']) {
      expect(() => parseAnalytics(KEY, host), host).toThrow(/POSTHOG_HOST/);
    }
  });

  it('is read by loadConfig', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).analytics).toBeNull();
    expect(loadConfig({ NODE_ENV: 'test', POSTHOG_KEY: KEY }).analytics).toEqual({ key: KEY, host: DEFAULT_POSTHOG_HOST });
  });
});

describe('/api/config and the page policy', () => {
  let database: DatabaseClient;
  let app: UniverseApp;

  async function start(analytics: { key: string; host: string } | null): Promise<void> {
    database = await createDatabase(':memory:');
    app = buildApp({
      db: database.db, engine: new FakeEngine(), mailer: new ConsoleMailer(), secretKey: 's',
      appOrigin: ORIGIN, allowedOrigins: [ORIGIN], secureCookies: false, logger: false, analytics,
    });
    await app.fastify.ready();
  }

  afterEach(async () => {
    await app.fastify.close();
    await database.close();
  });

  it('says analytics is off and leaves the policy alone when unset', async () => {
    await start(null);
    const res = await app.fastify.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json<ConfigResponse>()).toEqual({ analytics: null });
    expect(res.headers['cache-control']).toBe('no-store');
    const page = await app.fastify.inject({ method: 'GET', url: '/nothing-here' });
    expect(String(page.headers['content-security-policy'])).toContain("connect-src 'self' ws: wss:;");
  });

  it('hands over the key and host, and lets the page send to that host only', async () => {
    await start({ key: KEY, host: DEFAULT_POSTHOG_HOST });
    const res = await app.fastify.inject({ method: 'GET', url: '/api/config' });
    expect(res.json<ConfigResponse>()).toEqual({ analytics: { key: KEY, host: DEFAULT_POSTHOG_HOST } });
    const csp = String((await app.fastify.inject({ method: 'GET', url: '/nothing-here' })).headers['content-security-policy']);
    expect(csp).toContain(`connect-src 'self' ws: wss: ${DEFAULT_POSTHOG_HOST};`);
    // PostHog's own scripts are never allowed in.
    expect(csp).toContain("script-src 'self';");
    expect(csp.match(/posthog/g)).toHaveLength(1);
  });
});
