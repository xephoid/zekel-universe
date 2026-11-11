// The per-client limits behind a proxy (SEC-16-F13, launch blocker T36).
// Behind Render every request's peer is the platform's proxy. With
// CLIENT_IP_HEADER set (cf-connecting-ip on Render), the header the
// platform writes keys the guest and sign-in-link budgets; X-Forwarded-For,
// which a caller can write, is never read. Unset, nothing changes.

import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type DatabaseClient } from './db/index.js';
import { ConsoleMailer } from './email.js';
import { buildApp, type UniverseApp } from './app.js';
import { FakeEngine } from './test-engine.js';
import { loadConfig, parseClientIpHeader } from './config.js';

const ORIGIN = 'http://localhost:5173';

describe('client address for the per-client limits', () => {
  let database: DatabaseClient;
  let app: UniverseApp;

  async function boot(clientIpHeader?: string): Promise<void> {
    database = await createDatabase(':memory:');
    app = buildApp({
      db: database.db, engine: new FakeEngine(), mailer: new ConsoleMailer(), secretKey: 's',
      appOrigin: ORIGIN, allowedOrigins: [ORIGIN], secureCookies: false, logger: false,
      limits: { guestsPerIp: 2, linksPerIp: 2 }, clientIpHeader, socketRecheckMs: 0,
    });
    await app.fastify.ready();
  }

  afterEach(async () => {
    await app.fastify.close();
    await database.close();
  });

  const newGuest = (headers: Record<string, string> = {}) =>
    app.fastify.inject({ method: 'POST', url: '/api/guests', headers: { origin: ORIGIN, ...headers } }).then((r) => r.statusCode);
  let n = 0;
  const askLink = (headers: Record<string, string> = {}) => app.fastify.inject({
    method: 'POST', url: '/api/auth/email/link', headers: { origin: ORIGIN, ...headers }, payload: { email: `p${n++}@example.com` },
  }).then((r) => r.statusCode);

  it('with the header set, two clients get separate guest and link budgets', async () => {
    await boot('cf-connecting-ip');
    const a = { 'cf-connecting-ip': '203.0.113.7' };
    const b = { 'cf-connecting-ip': '2001:db8::7' };
    expect([await newGuest(a), await newGuest(a), await newGuest(a)]).toEqual([200, 200, 429]);
    expect([await newGuest(b), await newGuest(b), await newGuest(b)]).toEqual([200, 200, 429]);
    expect([await askLink(a), await askLink(a), await askLink(a)]).toEqual([200, 200, 429]);
    expect([await askLink(b), await askLink(b)]).toEqual([200, 200]);
  });

  it('with the header set, a spoofed X-Forwarded-For buys no new budget', async () => {
    await boot('cf-connecting-ip');
    const codes: number[] = [];
    for (const xff of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
      codes.push(await newGuest({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': xff }));
    }
    expect(codes).toEqual([200, 200, 429]);
  });

  it('a missing, repeated or malformed header value falls back to the peer address, one shared budget', async () => {
    await boot('cf-connecting-ip');
    const codes = [
      await newGuest(),
      await newGuest({ 'cf-connecting-ip': 'not-an-address' }),
      await newGuest({ 'cf-connecting-ip': '203.0.113.7, 203.0.113.8' }),
    ];
    expect(codes).toEqual([200, 200, 429]);
  });

  it('unset (local), neither header changes the budget', async () => {
    await boot();
    const codes = [
      await newGuest({ 'cf-connecting-ip': '203.0.113.1' }),
      await newGuest({ 'x-forwarded-for': '203.0.113.2' }),
      await newGuest({ 'cf-connecting-ip': '203.0.113.3', 'x-forwarded-for': '203.0.113.4' }),
    ];
    expect(codes).toEqual([200, 200, 429]);
  });

  it('CLIENT_IP_HEADER takes only a plain header name, and never one a caller writes', async () => {
    await boot();
    expect(parseClientIpHeader(undefined)).toBeNull();
    expect(parseClientIpHeader('  ')).toBeNull();
    expect(parseClientIpHeader('CF-Connecting-IP')).toBe('cf-connecting-ip');
    expect(loadConfig({ CLIENT_IP_HEADER: 'cf-connecting-ip' }).clientIpHeader).toBe('cf-connecting-ip');
    expect(loadConfig({}).clientIpHeader).toBeNull();
    for (const bad of ['x-forwarded-for', 'X-Forwarded-For', 'forwarded', 'x-real-ip', 'cf-connecting-ip, x-forwarded-for',
      'cf connecting ip', 'cf-connecting-ip:', '-leading', 'a'.repeat(65), 'héader']) {
      expect(() => parseClientIpHeader(bad), bad).toThrow(/CLIENT_IP_HEADER/);
    }
    expect(() => buildApp({
      db: database.db, engine: new FakeEngine(), mailer: new ConsoleMailer(), secretKey: 's',
      appOrigin: ORIGIN, allowedOrigins: [ORIGIN], secureCookies: false, logger: false, clientIpHeader: 'x-forwarded-for',
    })).toThrow(/CLIENT_IP_HEADER/);
  });

  it('/healthz answers without the engine, with no-store, and says only ok', async () => {
    await boot();
    const res = await app.fastify.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(res.headers['cache-control']).toBe('no-store');
    await database.close();
    const down = await app.fastify.inject({ method: 'GET', url: '/healthz' });
    expect(down.statusCode).toBe(503);
    expect(down.json()).toEqual({ ok: false });
    database = await createDatabase(':memory:');
  });
});
