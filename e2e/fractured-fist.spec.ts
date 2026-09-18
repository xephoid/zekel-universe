// M1 acceptance: a guest opens the Fractured Fist page, presses Play now,
// picks the seven techniques, and plays a complete game against the AI to
// the end screen, with undo used once along the way. Every move the test
// makes is a tap on a lit card or a click on the numbered menu; nothing is
// submitted by the page on its own.

import { test, expect } from '@playwright/test';
import { makeMove } from './helpers';


test('a guest plays Fractured Fist against the AI from Play now to the end screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Fractured Fist/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Fractured Fist', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Play now' }).click();

  // The game's own choice: exactly seven techniques, nothing preselected.
  await expect(page.getByText('Choose the 7 techniques in play')).toBeVisible();
  const boxes = page.getByRole('group', { name: /Choose the 7 techniques/ }).getByRole('checkbox');
  await expect(boxes.first()).toBeVisible();
  for (const b of await boxes.all()) await expect(b).not.toBeChecked();
  for (let i = 0; i < 7; i++) await boxes.nth(i).check();
  await expect(page.getByText(/7 of 7/)).toBeVisible();
  await page.getByRole('button', { name: 'Start the game' }).click();

  // The table: our move first, at the fastest pace (which still dwells).
  // Once playback has settled the pace control lives in the settings sheet.
  await expect(page).toHaveURL(/\/table\//);
  await expect(page.getByText(/^Your move/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: '2×' }).click();
  await settings.getByRole('button', { name: 'Close' }).click();
  await expect(settings).toBeHidden();
  await expect(page.locator('.table-bench .zk-card').first()).toBeVisible();

  // Take back the very first move, then carry on.
  expect(await makeMove(page)).not.toBeNull();
  await expect(page.locator('.log li').first()).not.toHaveText('The table is set.');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.log li').first()).toContainText('took back', { timeout: 30_000 });
  await expect(page.getByText(/^Your move/)).toBeVisible({ timeout: 30_000 });

  // Play to the end.
  let moves = 0;
  let taps = 0;
  for (let i = 0; i < 800; i++) {
    if (await page.getByRole('dialog', { name: 'Game over' }).isVisible()) break;
    if (await page.getByText(/^Your move/).isVisible()) {
      const how = await makeMove(page);
      if (how) {
        moves += 1;
        if (how === 'tap') taps += 1;
        await page.waitForTimeout(150);
        continue;
      }
    }
    await page.waitForTimeout(400);
  }
  const dialog = page.getByRole('dialog', { name: 'Game over' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/wins|tie/i).first()).toBeVisible();
  expect(moves).toBeGreaterThan(5);
  // Lit cards were tapped along the way, so both paths to a move worked.
  expect(taps).toBeGreaterThan(0);

  // The end screen offers the three actions from the brief.
  await expect(dialog.getByRole('button', { name: 'Play again' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Share the result' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Game page' })).toBeVisible();
});
