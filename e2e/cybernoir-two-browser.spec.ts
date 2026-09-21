// M2 acceptance: two browsers, two signed-in humans, one Cybernoir 2127
// table, live. The seat that is not to move never receives the other seat's
// private view, asserted against each browser's events feed (which carries
// exactly what the socket sends) and against the rendered table.
// Needs the full stack: engine + server on BASE_URL with E2E_TEST_OUTBOX=1.

import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';

/** The event feed as this browser sees it: the same per-seat filtering the
 *  socket applies, so a leak here or on the socket is one bug. */
async function visibleEvents(page: Page): Promise<{ text: string; events: Array<Record<string, unknown>> }> {
  const id = new URL(page.url()).pathname.split('/').filter(Boolean).pop();
  const res = await page.request.get(`/api/tables/${id}/events?after=0`);
  expect(res.ok()).toBeTruthy();
  const text = await res.text();
  return { text, events: (JSON.parse(text) as { events: Array<Record<string, unknown>> }).events };
}

test('two signed-in humans at one Cybernoir table, each seeing only their own private state', async ({ browser, baseURL }) => {
  const a = await signIn(browser, 'm2-host@example.com', baseURL!);
  const b = await signIn(browser, 'm2-guest@example.com', baseURL!);

  // Host sets up a two-human live table (Cybernoir has exactly two seats).
  await a.goto('/games/cybernoir-2127/setup');
  await expect(a.getByRole('heading', { name: 'Set up the table' })).toBeVisible();
  // Seat 2 defaults to an AI; make it an open seat for a friend.
  await a.getByRole('group', { name: 'Seat 2' }).getByRole('button', { name: 'Friend' }).click();
  await a.getByRole('radio', { name: /^Live/ }).click();
  await a.getByRole('group', { name: /Overclock/ }).getByRole('radio', { name: 'Immediate' }).check();
  await a.getByRole('button', { name: 'Open the lobby' }).click();
  await expect(a).toHaveURL(/\/table\/[^/]+\/lobby/, { timeout: 20_000 });
  const lobbyPath = new URL(a.url()).pathname;
  const tableId = lobbyPath.split('/')[2]!;

  // The friend arrives by the link; the lobby seats them automatically.
  await b.goto(lobbyPath);
  await expect(b.getByRole('heading', { name: 'Seats' })).toBeVisible();
  await expect(b.getByText('m2-host')).toBeVisible();

  // The host's seat is ready from the start; the friend readies up and the
  // host starts once everyone is.
  await b.getByRole('button', { name: "I'm ready" }).click();
  const start = a.getByRole('button', { name: /Everyone is ready: start/ });
  await expect(start).toBeVisible({ timeout: 15_000 });
  await start.click();
  await expect(a).toHaveURL(/\/table\/[^/]+$/, { timeout: 20_000 });
  await expect(b).toHaveURL(/\/table\/[^/]+$/, { timeout: 20_000 });
  await expect(a.getByText(/^Your move/)).toBeVisible({ timeout: 30_000 });

  // The M2 check: neither browser's feed carries the other's private view.
  // The detective holds location_hand; the hacker holds hand and hideout.
  // Match JSON keys, not substrings: the public block has location_hand_size.
  const aFeed = await visibleEvents(a);
  const bFeed = await visibleEvents(b);
  const aView = aFeed.events[aFeed.events.length - 1]!['view'] as Record<string, unknown>;
  const bView = bFeed.events[bFeed.events.length - 1]!['view'] as Record<string, unknown>;
  expect(aView['role']).toBe('detective');
  expect(bView['role']).toBe('hacker');
  expect(Array.isArray(aView['location_hand'])).toBe(true);
  expect(Array.isArray(bView['hand'])).toBe(true);
  expect(aFeed.text).not.toContain('"hand":');
  expect(aFeed.text).not.toContain('"hideout":');
  expect(bFeed.text).not.toContain('"location_hand":');
  for (const card of aView['location_hand'] as string[]) expect(bFeed.text).not.toContain(card);
  for (const card of bView['hand'] as string[]) expect(aFeed.text).not.toContain(card);
  // Only the seat to move holds legal moves.
  expect((aFeed.events[aFeed.events.length - 1]!['legalMoves'] as unknown[]).length).toBeGreaterThan(0);
  expect(bFeed.events[bFeed.events.length - 1]!['legalMoves']).toEqual([]);

  // And on screen: each table shows its owner's role.
  await expect(a.getByText(/Detective \(you\)/)).toBeVisible();
  await expect(b.getByText(/Hacker \(you\)/)).toBeVisible();

  // A stranger's browser gets nothing from the feed at all.
  const stranger = await signIn(browser, 'm2-outside@example.com', baseURL!);
  const res = await stranger.request.get(`/api/tables/${tableId}/events?after=0`);
  expect(res.status()).toBe(403);
});
