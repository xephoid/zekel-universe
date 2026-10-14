// M4: Sweetlands Imperium against one AI, from setup through the first
// play, on the candy table (docs/design/sweetlands-candy). Every setup choice
// is the player's: the faction form starts empty, the secret goal is a button
// in the turn panel, and the Intel comes from the Draw button. Then a picked
// card lists one numbered option per piece and destination, each in the
// engine's own words and outlined where the engine says the piece lands, and
// only the button the player presses goes to the engine. The board carries the
// treat art and the faction portraits.
// Needs the full stack (engine + server on BASE_URL).

import { test, expect, type Page } from '@playwright/test';

/** Press whatever the table offers until the pill leaves "Your move" or a
 *  predicate holds: menu rows first, forms and choosers when they open. */
async function menuRow(page: Page, pattern: RegExp) {
  const row = page.locator('.move-menu ol button').filter({ hasText: pattern }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test('Sweetlands: the player makes every setup choice, draws with the button, and plays a card through the turn panel', async ({ page }) => {
  await page.goto('/games/sweetlands-imperium/setup');
  await expect(page.getByRole('heading', { name: 'Set up the table' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Seat 2', exact: true })).toBeVisible();

  // 1. On the setup screen, against the AI: every faction and the foe are
  //    the host's to choose, with nothing preselected and no start until then.
  const start = page.getByRole('button', { name: 'Start the game' });
  await expect(start).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Your faction' }).getByRole('radio', { checked: true })).toHaveCount(0);
  await page.getByRole('group', { name: 'Your faction' }).getByRole('radio', { name: 'Grand Vizier Cheesecake' }).check();
  await page.getByRole('group', { name: /Seat 2's faction/ }).getByRole('radio', { name: 'Princess Jellybean' }).check();
  await expect(start).toBeDisabled();
  await page.getByRole('group', { name: 'The castle foe' }).getByRole('radio', { name: 'Orc' }).check();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page).toHaveURL(/\/table\//, { timeout: 20_000 });
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });

  // The board: 80 spaces and 4 homes, the castle with the orc's three sugar
  // cubes, the treat art in place, both factions seated.
  await expect(page.locator('.sl-board [data-tile]')).toHaveCount(85);
  await expect(page.locator('.sl-plate-art')).toHaveCount(8);
  await expect(page.locator('img.sl-portrait')).toHaveCount(2);
  await expect(page.getByLabel('Castle foe: rolls 3 sugar cubes')).toBeVisible();
  await expect(page.getByRole('region', { name: 'You, Grand Vizier Cheesecake' })).toBeVisible();
  await expect(page.locator('.sl-player-full').filter({ hasText: 'Princess Jellybean' })).toHaveCount(1);

  // 2. Two seats cannot share a faction: the setup screen says so before the
  //    engine would. (On a second setup page, so this table is untouched.)
  const other = await page.context().newPage();
  await other.goto('/games/sweetlands-imperium/setup');
  await other.getByRole('group', { name: 'Your faction' }).getByRole('radio', { name: 'General Fudge' }).check();
  await other.getByRole('group', { name: /Seat 2's faction/ }).getByRole('radio', { name: 'General Fudge' }).check();
  await other.getByRole('group', { name: 'The castle foe' }).getByRole('radio', { name: 'Dragon' }).check();
  await other.getByRole('button', { name: 'Start the game' }).click();
  await expect(other.getByRole('alert')).toContainText('same faction');
  await other.close();

  const now = page.getByRole('region', { name: 'What to do now' });
  const lastLog = () => page.locator('.log li').first().textContent();

  // 3. The secret goal: a button in the turn panel; the kept goal shows under the hand.
  await expect(now.getByRole('heading', { name: 'Keep one secret goal' })).toBeVisible();
  await now.locator('.sl-quiet-choice').first().click();
  await expect(page.locator('.log li').first()).toContainText('kept a secret objective', { timeout: 20_000 });
  await expect(page.locator('.sl-secret').first()).toBeVisible();

  // 4. The starting hand comes from the Draw button, not by itself.
  await expect(now.getByRole('heading', { name: 'Draw your Intel' })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sl-card')).toHaveCount(0);
  await now.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(page.locator('.sl-card')).toHaveCount(3, { timeout: 30_000 });

  // 5. Play: skip the recall, draw the turn's Intel, then pick a card.
  for (let i = 0; i < 6; i++) {
    const title = (await now.locator('h2').first().textContent({ timeout: 30_000 })) ?? '';
    if (/Play one card/.test(title)) break;
    const before = await lastLog();
    if (/^Recall/.test(title)) await now.getByRole('button', { name: /Skip recall/ }).click();
    else if (/Draw your Intel/.test(title)) await now.getByRole('button', { name: 'Draw', exact: true }).click();
    else { await page.waitForTimeout(1000); continue; }
    await expect(page.locator('.log li').first()).not.toHaveText(before ?? '', { timeout: 30_000 });
  }
  await expect(now.getByRole('heading', { name: 'Play one card' })).toBeVisible({ timeout: 30_000 });
  const card = page.locator('.sl-card.playable').first();
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  const options = now.locator('.sl-option');
  expect(await options.count()).toBeGreaterThan(0);
  await expect(options.first()).toContainText(/(Play|Use) /);
  // Each option's number is outlined on the board where the engine says it lands.
  expect(await page.locator('.sl-mark-n').count()).toBeGreaterThan(0);
  await options.first().click();
  await expect(page.locator('.sl-mark.chosen')).toHaveCount(1);
  const before = await lastLog();
  await now.locator('.sl-main-btn').first().click();
  await expect(page.locator('.log li').first()).not.toHaveText(before ?? '', { timeout: 30_000 });
});
