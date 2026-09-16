/// <reference types="vitest" />
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** PORT from the repo root's .env file (not the process environment, which
 *  belongs to Vite itself). */
function serverPortFromDotEnv(): string | undefined {
  const file = path.resolve(__dirname, '../../.env');
  if (!existsSync(file)) return undefined;
  const m = /^\s*PORT\s*=\s*(\d+)\s*$/m.exec(readFileSync(file, 'utf8'));
  return m?.[1];
}

// The dev server proxies the API and the socket to the Universe server, whose
// port comes from API_PORT or the repo root's .env (PORT), defaulting to 8788.
const serverPort = process.env.API_PORT ?? serverPortFromDotEnv() ?? '8788';
const target = `http://127.0.0.1:${serverPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
  test: {
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    css: false,
  },
});
