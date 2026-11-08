// The log keeps the table's past across a reload. The page starts its
// playback at one event, and the log used to read only what the page had
// played, so after a reload it showed only the last move's lines. Neither
// Guts nor Gears against one AI, into the first round, then a reload.
// Needs the full stack (engine + server on BASE_URL).

import { test, expect, type Page } from '@playwright/test';

const panel = (page: Page) => page.locator('.ngg-column');
const logLines = (page: Page) => page.locator('.key-log > li:not(.log-round), ul.log:not(.key-log) > li');

async function yourMove(page: Page) {
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 60_000 });
}

test('the log keeps its history after a reload', async ({ page }) => {
  await page.goto('/games/neither-guts-nor-gears/setup');
  await page.getByRole('group', { name: 'Your faction' }).getByRole('radio', { name: /^The Covenant/ }).check();
  await page.getByRole('group', { name: /Seat 2's faction/ }).getByRole('radio', { name: /^The Foundry/ }).check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page).toHaveURL(/\/table\//, { timeout: 20_000 });
  await expect(page.locator('.ngg-root')).toBeVisible({ timeout: 30_000 });

  // The draft and the start, as in ngg.spec.ts.
  await yourMove(page);
  if (await panel(page).getByText('Draft your Leader').isVisible()) {
    await panel(page).getByRole('button', { name: /Warden Hesper Quill/ }).click();
    await panel(page).getByRole('button', { name: /^Take/ }).click();
  }
  await yourMove(page);
  await expect(panel(page)).toContainText(/starting site|Tap a numbered site/i, { timeout: 30_000 });
  await panel(page).getByRole('button', { name: /Site \d · / }).first().click();
  await panel(page).getByRole('button', { name: /^Start at site \d/ }).click();
  await yourMove(page);
  await expect(panel(page)).toContainText(/Place one card, or pass|Draw|Reallocate Cores/i, { timeout: 60_000 });

  const before = await logLines(page).count();
  expect(before).toBeGreaterThan(2);
  const newestBefore = (await logLines(page).allInnerTexts()).slice(-1)[0];

  await page.reload();
  await expect(page.locator('.ngg-root')).toBeVisible({ timeout: 30_000 });
  await yourMove(page);
  // Every line the log showed is still there, oldest included.
  await expect.poll(() => logLines(page).count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(before);
  expect((await logLines(page).allInnerTexts()).slice(-1)[0]).toBe(newestBefore);
});
