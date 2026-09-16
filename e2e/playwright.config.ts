// End-to-end tests drive a real browser against a running server that talks
// to a live engine. Point BASE_URL at the server (default: the built server
// on 8788). See README for how to bring the stack up.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 15 * 60 * 1000,
  expect: { timeout: 20 * 1000 },
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8788',
    // A click that never finds a stable, uncovered target must fail with a
    // trace, not wait for the whole test timeout.
    actionTimeout: 30 * 1000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  outputDir: 'results',
});
