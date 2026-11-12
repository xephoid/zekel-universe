// Server configuration from environment variables.
// Development defaults are safe only for development; production refuses to
// start without real values for every secret.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseAdminEmails } from './admin.js';
import { parseAnalytics, type AnalyticsConfig } from './analytics.js';

export interface ServerConfig {
  port: number;
  engineUrl: string;
  engineToken: string;
  secretKey: string;
  databaseUrl: string;
  emailFrom: string;
  /** The public origin of the site, used in sign-in links. */
  appOrigin: string;
  /** Origins allowed to open sockets and make state-changing requests. */
  allowedOrigins: string[];
  isProduction: boolean;
  /** Resend API key; when unset, sign-in links are logged instead of sent. */
  resendApiKey: string | null;
  /** By turns: how long a player is away and up before the email nudge. */
  turnNudgeDelayMs: number;
  /** How often the server looks for due nudges; 0 turns the timer off. */
  turnNudgeSweepMs: number;
  /** Guest accounts one client address may create in 15 minutes. */
  guestsPerIp: number;
  /** A request header the hosting platform writes with the client's
   *  address (Render: cf-connecting-ip). Null: use the socket's peer. */
  clientIpHeader: string | null;
  /** Sign-in emails whose accounts may use the admin page; empty: nobody. */
  adminEmails: string[];
  /** PostHog site analytics (POSTHOG_KEY, POSTHOG_HOST); null: off. */
  analytics: AnalyticsConfig | null;
}

/** Headers a caller can write or append to themselves; never trusted for a
 *  client address (SEC-16-F13). */
const SPOOFABLE_IP_HEADERS = new Set(['x-forwarded-for', 'forwarded', 'x-real-ip']);

/** CLIENT_IP_HEADER: empty, or one plain header name, lower-cased. */
export function parseClientIpHeader(raw: string | undefined): string | null {
  const name = (raw ?? '').trim().toLowerCase();
  if (name === '') return null;
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    throw new Error(`CLIENT_IP_HEADER must be one plain header name such as cf-connecting-ip, got ${JSON.stringify(raw)}`);
  }
  if (SPOOFABLE_IP_HEADERS.has(name)) {
    throw new Error(`CLIENT_IP_HEADER cannot be ${name}: callers can write it themselves.`);
  }
  return name;
}

// A 32-byte key used only when SECRET_KEY is unset in development.
const DEV_SECRET_KEY = '0'.repeat(64);

/**
 * Read a .env file (the current directory's, or a parent's up to the repo
 * root) into the environment without overriding anything already set.
 * Development only; production gets its variables from the platform.
 */
export function loadDotEnv(env: NodeJS.ProcessEnv = process.env, from: string = process.cwd()): void {
  if (env.NODE_ENV === 'production') return;
  let dir = path.resolve(from);
  for (let i = 0; i < 4; i++) {
    const file = path.join(dir, '.env');
    if (existsSync(file)) {
      for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line === '' || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && env[key] === undefined) env[key] = value;
      }
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

function nonNegative(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Expected a non-negative number of milliseconds, got ${JSON.stringify(raw)}`);
  return n;
}

/** ENGINE_HOSTPORT, a private network address such as `zekel-engine:8787`
 *  (what a Render Blueprint can hand over), becomes the engine's MCP URL.
 *  ENGINE_URL, when set, wins. */
export function engineUrlFrom(env: NodeJS.ProcessEnv): string | null {
  if (env.ENGINE_URL) return env.ENGINE_URL;
  const hostport = (env.ENGINE_HOSTPORT ?? '').trim();
  if (hostport === '') return null;
  if (!/^[A-Za-z0-9.-]+:[0-9]{1,5}$/.test(hostport)) {
    throw new Error(`ENGINE_HOSTPORT must be host:port, got ${JSON.stringify(env.ENGINE_HOSTPORT)}`);
  }
  return `http://${hostport}/mcp`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === 'production';
  const engineUrl = engineUrlFrom(env);
  if (isProduction) {
    const missing = ['SECRET_KEY', 'ENGINE_TOKEN', 'APP_ORIGIN', 'DATABASE_URL']
      .filter((k) => !env[k]);
    if (!engineUrl) missing.splice(2, 0, 'ENGINE_URL');
    if (missing.length > 0) {
      throw new Error(`Refusing to start in production without: ${missing.join(', ')}`);
    }
  }
  const port = Number(env.PORT ?? 8788);
  const appOrigin = (env.APP_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
  const extra = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const devOrigins = isProduction
    ? []
    : [`http://localhost:${port}`, `http://127.0.0.1:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173'];
  return {
    port,
    engineUrl: engineUrl ?? 'http://localhost:8787/mcp',
    engineToken: env.ENGINE_TOKEN ?? '',
    secretKey: env.SECRET_KEY ?? DEV_SECRET_KEY,
    databaseUrl: env.DATABASE_URL ?? 'sqlite:./dev.db',
    emailFrom: env.EMAIL_FROM ?? 'no-reply@example.com',
    appOrigin,
    allowedOrigins: [...new Set([appOrigin, ...extra, ...devOrigins])],
    isProduction,
    resendApiKey: env.RESEND_API_KEY ?? null,
    turnNudgeDelayMs: nonNegative(env.TURN_NUDGE_DELAY_MS, 10 * 60 * 1000),
    turnNudgeSweepMs: nonNegative(env.TURN_NUDGE_SWEEP_MS, 60 * 1000),
    guestsPerIp: nonNegative(env.GUESTS_PER_IP, 30),
    clientIpHeader: parseClientIpHeader(env.CLIENT_IP_HEADER),
    adminEmails: parseAdminEmails(env.ADMIN_EMAILS),
    analytics: parseAnalytics(env.POSTHOG_KEY, env.POSTHOG_HOST),
  };
}
