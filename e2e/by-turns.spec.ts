// M3 acceptance in the browser: a by-turns table starts itself when its
// seats fill, the absent player is emailed once when their turn comes, My
// tables brings them back, and the other browser sees their move live.
// (Resuming after a server restart is covered by the server's by-turns
// tests, which restart the realtime layer over the same database.)
// Needs the full stack with E2E_TEST_OUTBOX=1, TURN_NUDGE_DELAY_MS=0 and
// a short TURN_NUDGE_SWEEP_MS.

import { test, expect, type Page } from '@playwright/test';
import { makeMove, pickSeven, readMails, signIn } from './helpers';

const HOST = 'm3-host@example.com';
const FRIEND = 'm3-friend@example.com';

/** Play menu moves until the turn passes (or the game ends). */
async function playUntilWaiting(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const pill = await page.locator('.turn-pill').textContent().catch(() => '');
    if (/^Waiting on/.test(pill ?? '')) return;
    if (/^Your move/.test(pill ?? '')) {
      await makeMove(page);
      await page.waitForTimeout(300);
      continue;
    }
    await page.waitForTimeout(400);
  }
  await expect(page.locator('.turn-pill')).toHaveText(/^Waiting on/);
}

test('a by-turns table: self-start, one nudge email to the absent player, back through My tables', async ({ browser, baseURL }) => {
  const a = await signIn(browser, HOST, baseURL!);
  const b = await signIn(browser, FRIEND, baseURL!);
  const bContext = b.context();

  // The host opens a Fractured Fist table by turns with one friend seat.
  await a.goto('/games/fractured-fist/setup');
  await expect(a.getByRole('heading', { name: 'Set up the table' })).toBeVisible();
  await a.getByRole('group', { name: 'Seat 2' }).getByRole('button', { name: 'Friend' }).click();
  await a.getByRole('radio', { name: /^By turns/ }).click();
  await pickSeven(a);
  await a.getByRole('button', { name: 'Open the lobby' }).click();
  await expect(a).toHaveURL(/\/table\/[^/]+\/lobby/, { timeout: 20_000 });
  const tableId = new URL(a.url()).pathname.split('/')[2]!;

  // The friend arrives by the link; with every seat taken the table starts
  // itself and both browsers land on it. The host is up first.
  await b.goto(`/table/${tableId}/lobby`);
  await expect(a).toHaveURL(/\/table\/[^/]+$/, { timeout: 30_000 });
  await expect(b).toHaveURL(/\/table\/[^/]+$/, { timeout: 30_000 });
  await expect(a.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });
  await expect(b.locator('.turn-pill')).toHaveText(/^Waiting on/, { timeout: 30_000 });

  // The friend leaves. The host plays until the turn passes to them.
  await b.close();
  await playUntilWaiting(a);

  // One email brings the friend back, with the table's link. (The outbox
  // outlives a test run, so count only this table's nudges.)
  const nudges = async () => (await readMails(a.request, FRIEND))
    .filter((m) => /Your move in/.test(m.subject) && m.text.includes(`/table/${tableId}`));
  await expect(async () => {
    const got = await nudges();
    expect(got).toHaveLength(1);
    expect(got[0]!.subject).toBe('Your move in Fractured Fist');
  }).toPass({ timeout: 20_000 });

  // Back on the home page, My tables says whose move it is and leads there.
  const b2 = await bContext.newPage();
  await b2.goto('/');
  const card = b2.locator(`a.my-card[href="/table/${tableId}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByText('Your move')).toBeVisible();
  await expect(card.getByText('Take your turn')).toBeVisible();
  await card.click();
  await expect(b2).toHaveURL(new RegExp(`/table/${tableId}$`));
  await expect(b2.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });
  const summary = await b2.locator('.log li').first().textContent();

  // Their move reaches the host's browser live.
  await expect(b2.locator('.move-menu, .table-bench .zk-card.zk-lit').first()).toBeVisible();
  expect(await makeMove(b2)).not.toBeNull();
  await expect(b2.locator('.log li').first()).not.toHaveText(summary ?? '');
  const moved = await b2.locator('.log li').first().textContent();
  await expect(a.locator('.log li').first()).toHaveText(moved ?? '', { timeout: 20_000 });

  // Being back answered the notification: no second email for that turn.
  await b2.waitForTimeout(2500);
  expect(await nudges()).toHaveLength(1);
});
