// Plan §18 acceptance: a guest opens Adventurer Olympics, presses Play now,
// picks an adventurer and a colour, and plays a complete game against the AI
// to the end screen. Every move is the person's: a Draw or Roll press, a tap
// on a lit hex, a tap on a glowing slot then Place, or one of the screen's buttons.
// It explores whenever it can, since the game ends only once every tile is
// placed, and checks Draw, Roll and a placement each happened.

import { test, expect, type Page } from '@playwright/test';

type Did = 'draw' | 'roll' | 'place' | 'slot' | 'step' | 'button' | null;

async function takeTurnStep(page: Page): Promise<Did> {
  const scr = page.locator('.ao-screen');
  const button = (name: string | RegExp) => scr.getByRole('button', { name, exact: typeof name === 'string' });
  // Draw and Roll are the panel's buttons, pressed only when they are there.
  for (const [name, did] of [[/^Draw a card$/, 'draw'], [/^Turn over a tile$/, 'draw'], [/^Roll \d (die|dice)$/, 'roll']] as const) {
    if (await button(name).isVisible()) { await button(name).click(); return did; }
  }
  // A picked slot: place the tile as it stands.
  if (await button('Place tile').isVisible()) { await button('Place tile').click(); return 'place'; }
  // A tile waiting: pick the first glowing slot.
  const slot = page.locator('.zk-hex.ghost.zk-lit');
  if (await slot.count()) { await slot.first().click(); return 'slot'; }
  // "Any rune": take the first one offered.
  const take = page.locator('.ao-option');
  if (await take.count()) { await take.first().click(); return 'button'; }
  // Explore whenever it is offered, so the tiles run out and the game ends.
  for (const name of [/^Explore/, /^Stay and try again$/]) {
    const b = button(name);
    if (await b.isVisible() && await b.isEnabled()) { await b.click(); return 'button'; }
  }
  // Walk: a lit hex that is not a slot.
  const step = page.locator('.zk-hex.zk-lit:not(.ghost)');
  if (await step.count()) { await step.nth(Math.floor(Math.random() * (await step.count()))).click(); return 'step'; }
  for (const name of [/^End turn$/, /^Do nothing this turn$/, /^No thanks, draw again$/]) {
    const b = button(name);
    if (await b.isVisible() && await b.isEnabled()) { await b.click(); return 'button'; }
  }
  return null;
}

test('a guest plays Adventurer Olympics against the AI from Play now to the end screen', async ({ page }) => {
  // Not on the storefront yet (apps/server/src/storefront.ts); its page is there.
  await page.goto('/games/adventurer-olympics');
  await expect(page.getByRole('heading', { name: 'Adventurer Olympics', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Play now' }).click();

  // The game's own choices: nothing preselected.
  const adventurer = page.getByRole('group', { name: 'Your adventurer' });
  await expect(adventurer).toBeVisible();
  expect(await adventurer.getByRole('radio', { checked: true }).count()).toBe(0);
  await adventurer.getByLabel('Wizard').check();
  await page.getByRole('group', { name: 'Your colour' }).getByLabel('Blue').check();
  await page.getByRole('button', { name: /^Start/ }).click();

  await expect(page).toHaveURL(/\/table\//);
  await expect(page.locator('.table-shell.ao-theme .ao-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.zk-hexmap .zk-hex').first()).toBeVisible();
  // The canvas's frame: the deck strip, your board, turn order in the side column.
  await expect(page.locator('.ao-strip')).toBeVisible();
  await expect(page.locator('.ao-board')).toBeVisible();
  await expect(page.locator('.table-side .ao-order-strip')).toBeVisible();
  await expect(page.getByText(/^Your move/)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: '2×' }).click();
  await settings.getByRole('button', { name: 'Close' }).click();

  const did: Record<string, number> = {};
  for (let i = 0; i < 3000; i++) {
    if (await page.getByRole('dialog', { name: 'Game over' }).isVisible()) break;
    if (await page.getByText(/^Your move/).isVisible()) {
      const d = await takeTurnStep(page);
      if (d) { did[d] = (did[d] ?? 0) + 1; await page.waitForTimeout(120); continue; }
    }
    await page.waitForTimeout(300);
  }
  const dialog = page.getByRole('dialog', { name: 'Game over' });
  await expect(dialog).toBeVisible();
  // Every kind of press happened along the way.
  expect(did['draw'] ?? 0).toBeGreaterThan(0);
  expect(did['roll'] ?? 0).toBeGreaterThan(0);
  expect(did['place'] ?? 0).toBeGreaterThan(0);
  expect(did['step'] ?? 0).toBeGreaterThan(0);
  await expect(dialog.getByRole('button', { name: 'Play again' })).toBeVisible();
});
