// Build item 7's acceptance (docs/games/fractured-fist-arcade-build.md): at
// 390 x 844 the Technique and Channel steps fit without scrolling; the menu
// and supply sheets open and close and hold what the side column held; a tap
// on a card opens it up close, with a Play button only when the engine lists
// a play for it, and that button sends the move; the strike plays upright
// with pace, skip and replay. Set SHOTS_DIR to keep a screenshot of each.

import { test, expect, type Page } from '@playwright/test';
import { pickSeven } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function shot(page: Page, name: string): Promise<void> {
  if (!process.env.SHOTS_DIR) return;
  await page.waitForTimeout(500); // let a sheet finish rising
  await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` });
}

/** Nothing scrolls: not the page, not the board. */
async function expectNoScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const board = document.querySelector('.table-board')!;
    const doc = document.documentElement;
    return { board: board.scrollHeight - board.clientHeight, down: doc.scrollHeight - innerHeight, across: doc.scrollWidth - innerWidth };
  });
  expect(m).toEqual({ board: 0, down: 0, across: 0 });
}

const playedCount = (page: Page, title: RegExp) =>
  page.locator('.ff-row').filter({ has: page.getByRole('heading', { name: title }) }).locator('.zk-card').count();

test('Fractured Fist on a phone: the stacked table, the sheets, a card up close, the strike upright', async ({ page }) => {
  await page.goto('/games/fractured-fist/setup');
  await pickSeven(page);
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page).toHaveURL(/\/table\//);
  await expect(page.getByText(/^Your move/)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.ff-actionbar.live')).toBeVisible();

  // The phone layout: no side column, the top bar's buttons behind a menu.
  await expect(page.locator('.table-shell.phone .ff-screen.phone')).toBeVisible();
  await expect(page.locator('.table-side')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeHidden();
  await expectNoScroll(page);
  await shot(page, '1-technique');

  // The menu holds what the side column and the top bar held.
  await page.getByRole('button', { name: /^Menu/ }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  for (const name of ['Undo', 'Rules', 'Settings', 'Share']) await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(menu.getByRole('region', { name: 'Last move' })).toBeVisible();
  await expect(menu.getByRole('group', { name: 'Playback pace' })).toBeVisible();
  await expect(menu.getByRole('button', { name: /^Replay/ })).toBeVisible();
  await expect(menu.getByRole('heading', { name: 'Log' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Leave the table' })).toBeVisible();
  await shot(page, '2-menu');
  await menu.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(menu).toBeHidden();

  // A card with no listed play opens up close with Close only.
  const unlit = page.locator('.ff-hand .zk-card.zk-look').first();
  await expect(unlit).toBeVisible();
  await unlit.click();
  const card = page.locator('.ff-card-sheet');
  await expect(card).toBeVisible();
  await expect(card.locator('.ff-printed')).toBeVisible();
  await expect(card.getByRole('button', { name: /^(Play|Remove) / })).toHaveCount(0);
  await shot(page, '3-card-no-play');
  await card.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(card).toBeHidden();

  // Move to the Channel step (a lit technique would be played first otherwise).
  while (await page.locator('.ff-hand .zk-card.zk-lit').count() === 0 && await page.getByRole('button', { name: 'Advance to Channel' }).count()) {
    await page.getByRole('button', { name: 'Advance to Channel' }).click();
    await expect(page.locator('.ff-step.current')).toHaveText('Channel');
    await expect(page.locator('.ff-actionbar.live')).toBeVisible();
  }

  // A lit card: one tap opens it, Play sends the listed move, and it lands in your row.
  const lit = page.locator('.ff-hand .zk-card.zk-lit').first();
  await expect(lit).toBeVisible();
  const before = await playedCount(page, /^Your played cards/);
  await lit.click();
  await expect(card).toBeVisible();
  await expect(card.getByText(/can be (played|removed) now/)).toBeVisible();
  await shot(page, '4-card-play');
  expect(await playedCount(page, /^Your played cards/)).toBe(before); // the tap alone sent nothing
  await card.getByRole('button', { name: /^Play / }).click();
  await expect(card).toBeHidden();
  await expect.poll(() => playedCount(page, /^Your played cards/)).toBe(before + 1);
  await expect(page.locator('.ff-actionbar.live')).toBeVisible({ timeout: 30_000 });

  // The Channel step: the Supply button says how many stacks can be bought.
  if (!(await page.locator('.ff-step.current').textContent())?.includes('Channel')) {
    await page.getByRole('button', { name: 'Advance to Channel' }).click();
  }
  const supplyBtn = page.getByRole('button', { name: /^Supply/ });
  await expect(supplyBtn).toContainText(/\d+ to buy/);
  await expectNoScroll(page);
  await shot(page, '5-channel');
  const buyable = Number(/(\d+) to buy/.exec((await supplyBtn.textContent()) ?? '')![1]);
  await supplyBtn.click();
  const supply = page.getByRole('dialog', { name: 'Supply' });
  await expect(supply).toBeVisible();
  await expect(supply.locator('.zk-card-row')).not.toHaveCount(0);
  await expect(supply.locator('.zk-card-row.zk-lit')).toHaveCount(buyable);
  await shot(page, '6-supply');
  await supply.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(supply).toBeHidden();

  // End the turn; when the round ends the strike plays upright.
  await page.getByRole('button', { name: 'End turn' }).click();
  const scrim = page.locator('.strike-scrim');
  await expect(scrim).toBeVisible({ timeout: 90_000 });
  const them = await page.locator('.strike-fighter.right').boundingBox();
  const you = await page.locator('.strike-fighter.left').boundingBox();
  expect(them!.y).toBeLessThan(you!.y);
  await expect(scrim.getByRole('group', { name: 'Playback pace' })).toBeVisible();
  await page.waitForTimeout(1800);
  await shot(page, '7-strike');
  await scrim.getByRole('button', { name: 'Skip to the end' }).click();
  await expect(scrim).toBeHidden();

  // Replay the strike from the menu, while it is still the last move.
  await page.getByRole('button', { name: /^Menu/ }).click();
  const replay = page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: /^Replay/ });
  if ((await replay.textContent()) === 'Replay the strike') {
    await replay.click();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeHidden();
    await expect(scrim).toBeVisible({ timeout: 10_000 });
  }
});
