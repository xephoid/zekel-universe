// Server configuration from environment variables.
// Development defaults are safe only for development; production refuses to
// start without real values for every secret.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === 'production';
  if (isProduction) {
    const missing = ['SECRET_KEY', 'ENGINE_TOKEN', 'ENGINE_URL', 'APP_ORIGIN', 'DATABASE_URL']
      .filter((k) => !env[k]);
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
    engineUrl: env.ENGINE_URL ?? 'http://localhost:8787/mcp',
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
  };
}
