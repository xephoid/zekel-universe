// M1 acceptance: a guest opens the Fractured Fist page, presses Play now,
// picks the seven techniques, and plays a complete game against the AI to
// the end screen, with undo used once along the way. Every move the test
// makes is a tap on a lit card or a click on the numbered menu; nothing is
// submitted by the page on its own.

import { test, expect, type Page } from '@playwright/test';

/** Tap a lit card in the bench when there is one; else pick from the menu. */
async function makeMove(page: Page): Promise<'tap' | 'menu' | null> {
  const lit = page.locator('.table-bench .zk-card.zk-lit');
  if (await lit.count()) {
    await lit.first().click();
    return 'tap';
  }
  const menu = page.locator('.move-menu');
  if (!(await menu.isVisible())) return null;
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) await menu.locator('summary').click();
  const buttons = menu.locator('ol button');
  const labels = await buttons.allTextContents();
  // Prefer buying, then moving the turn along, so the game advances and the
  // deck grows; card plays are taken by tap above.
  const order = [/^Buy /i, /^Refine/i, /^Skip/i, /^Advance/i, /^End turn/i];
  for (const re of order) {
    const i = labels.findIndex((l) => re.test(l));
    if (i >= 0) {
      await buttons.nth(i).click();
      return 'menu';
    }
  }
  if (labels.length > 0) {
    await buttons.first().click();
    return 'menu';
  }
  return null;
}

test('a guest plays Fractured Fist against the AI from Play now to the end screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Fractured Fist/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Fractured Fist' })).toBeVisible();
  await page.getByRole('link', { name: 'Play now' }).click();

  // The game's own choice: exactly seven techniques, nothing preselected.
  await expect(page.getByText('Choose the 7 techniques in play')).toBeVisible();
  const boxes = page.getByRole('group', { name: /Choose the 7 techniques/ }).getByRole('checkbox');
  await expect(boxes.first()).toBeVisible();
  for (const b of await boxes.all()) await expect(b).not.toBeChecked();
  for (let i = 0; i < 7; i++) await boxes.nth(i).check();
  await expect(page.getByText('(7 of 7)')).toBeVisible();
  await page.getByRole('button', { name: 'Start the game' }).click();

  // The table: our move first, at the fastest pace (which still dwells).
  await expect(page).toHaveURL(/\/table\//);
  await expect(page.getByText(/^Your move/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '2×' }).click();
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
  await expect(dialog.getByRole('link', { name: 'Back to the game page' })).toBeVisible();
});
