// Entry point: load config, open the database, build the app, and start.

import { Server as SocketServer } from 'socket.io';
import { loadConfig } from './config.js';
import { createDatabase } from './db/index.js';
import { EngineClient } from '@universe/engine-client';
import { ConsoleEmailLinker } from './auth.js';
import { NoopEmailSender } from './email.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDatabase(config.databaseUrl);
  const engine = new EngineClient({ url: config.engineUrl, bearerToken: config.engineToken });
  const io = new SocketServer({
    cors: { origin: true, credentials: true },
  });
  const app = buildApp({
    db,
    engine,
    emailLinker: new ConsoleEmailLinker(),
    emailSender: new NoopEmailSender(),
    secretKey: config.secretKey,
    io,
  });

  await app.fastify.ready();
  io.attach(app.fastify.server);

  // Refresh the game catalog from the engine on startup; tolerate the engine
  // being down so local frontend work can still boot the server.
  try {
    const count = await app.refreshCatalog();
    app.fastify.log.info(`catalog: ${count} games from engine`);
  } catch (err) {
    app.fastify.log.warn(`catalog refresh skipped (engine unreachable): ${(err as Error).message}`);
  }

  await app.fastify.listen({ port: config.port, host: '0.0.0.0' });
}

void main();
