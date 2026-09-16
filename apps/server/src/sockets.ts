// The Socket.IO server, built the same way in production and in tests.
// Websockets are not covered by same-origin policy, so the server checks the
// Origin header itself: a page on any other site is refused before it can
// present a visitor's cookies.

import type { IncomingMessage } from 'node:http';
import { Server as SocketServer } from 'socket.io';

export interface SocketServerOptions {
  allowedOrigins: string[];
}

export function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  // Non-browser clients (tests, tools) send no Origin; browsers always do.
  if (!origin) return true;
  return allowed.includes(origin.replace(/\/$/, ''));
}

export function createSocketServer(opts: SocketServerOptions): SocketServer {
  return new SocketServer({
    // No CORS headers at all: the socket is same-origin only.
    cors: undefined,
    allowRequest: (req: IncomingMessage, cb) => {
      if (originAllowed(req.headers.origin, opts.allowedOrigins)) cb(null, true);
      else cb('origin_not_allowed', false);
    },
  });
}
