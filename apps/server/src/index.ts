// Entry point: load config, open the database, build the app, and start.

import { loadConfig, loadDotEnv } from './config.js';
import { createDatabase } from './db/index.js';
import { EngineClient } from '@universe/engine-client';
import { ConsoleMailer, ResendMailer } from './email.js';
import { buildApp } from './app.js';
import { createSocketServer } from './sockets.js';

async function main(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  const database = await createDatabase(config.databaseUrl);
  const engine = new EngineClient({ url: config.engineUrl, bearerToken: config.engineToken });
  const io = createSocketServer({ allowedOrigins: config.allowedOrigins });
  const mailer = config.resendApiKey
    ? new ResendMailer(config.resendApiKey, config.emailFrom)
    : new ConsoleMailer();
  // The e2e stack needs to read the sign-in link the console mailer logs.
  // The outbox route exists only outside production and only on demand.
  const testOutbox = process.env.E2E_TEST_OUTBOX === '1';
  if (testOutbox && config.isProduction) {
    throw new Error('E2E_TEST_OUTBOX must never be set in production.');
  }
  const app = buildApp({
    db: database.db,
    engine,
    mailer,
    secretKey: config.secretKey,
    appOrigin: config.appOrigin,
    allowedOrigins: config.allowedOrigins,
    secureCookies: config.isProduction,
    io,
    testOutbox,
    turnNudge: { delayMs: config.turnNudgeDelayMs, sweepMs: config.turnNudgeSweepMs },
    limits: { guestsPerIp: config.guestsPerIp },
  });

  await app.fastify.ready();
  io.attach(app.fastify.server);

  // Refresh the game catalog from the engine on startup; tolerate the engine
  // being down so local frontend work can still boot the server.
  try {
    const count = await app.refreshCatalog();
    app.fastify.log.info(`catalog: ${count} games from engine (${database.dialect} database)`);
  } catch (err) {
    app.fastify.log.warn(`catalog refresh skipped (engine unreachable): ${(err as Error).message}`);
  }

  await app.fastify.listen({ port: config.port, host: '0.0.0.0' });

  const shutdown = async () => {
    await app.fastify.close();
    await engine.close();
    await database.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
