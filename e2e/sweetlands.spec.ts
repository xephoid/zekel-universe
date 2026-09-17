// M4: Sweetlands Imperium against one AI, from setup through the first
// play. Every setup choice is the player's: the faction form starts empty,
// the foe is a tap on the lit castle and a pick in the chooser, the secret
// objective is a menu row, and the Intel comes from the Draw button. Then a
// card tap opens the chooser with the engine's own move descriptions, and
// the pick is what goes to the engine. The board carries the treat art and
// the faction portraits.
// Needs the full stack (engine + server on BASE_URL).

import { test, expect, type Page } from '@playwright/test';

/** Press whatever the table offers until the pill leaves "Your move" or a
 *  predicate holds: menu rows first, forms and choosers when they open. */
async function menuRow(page: Page, pattern: RegExp) {
  const row = page.locator('.move-menu ol button').filter({ hasText: pattern }).first();
  await expect(row).toBeVisible();
  await row.click();
}

test('Sweetlands: the player makes every setup choice, draws with the button, and plays a card through the chooser', async ({ page }) => {
  await page.goto('/games/sweetlands-imperium/setup');
  await expect(page.getByRole('heading', { name: 'Set up your table' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Seat 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page).toHaveURL(/\/table\//, { timeout: 20_000 });
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });

  // The board: 80 spaces, 4 starts and the castle, with the treat art in place.
  await expect(page.locator('.zk-map-node')).toHaveCount(85);
  await expect(page.locator('.zk-map-art')).toHaveCount(8);
  await expect(page.locator('.round-note')).toHaveText('Setup · Factions');

  // 1. Factions: a form with nothing preselected; the Send button waits.
  await menuRow(page, /Assign each player a faction/);
  const factions = page.getByRole('dialog', { name: 'Choose factions' });
  await expect(factions).toBeVisible();
  const send = factions.getByRole('button', { name: 'Seat the factions' });
  await expect(send).toBeDisabled();
  await expect(factions.getByRole('radio', { checked: true })).toHaveCount(0);
  await factions.getByRole('group', { name: 'p1 (you)' }).getByRole('radio', { name: 'Grand Vizier Cheesecake' }).check();
  await expect(send).toBeDisabled();
  await factions.getByRole('group', { name: 'p2 (AI)' }).getByRole('radio', { name: 'Princess Jellybean' }).check();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.locator('.log li').first()).toContainText('Factions assigned', { timeout: 20_000 });
  await expect(page.locator('.zk-portrait')).toHaveCount(2);

  // 2. The foe: the castle lights up; the chooser offers the engine's three moves.
  await expect(page.locator('.round-note')).toHaveText('Setup · Foe');
  const castle = page.locator('.zk-map-blob.zk-lit');
  await expect(castle).toHaveAttribute('aria-label', 'Candy Castle');
  await castle.click();
  const chooser = page.getByRole('dialog', { name: 'Which move?' });
  await expect(chooser.locator('.chooser button')).toHaveCount(3);
  await chooser.getByRole('button', { name: /Choose the orc/ }).click();
  await expect(page.locator('.log li').first()).toContainText('ORC', { timeout: 20_000 });
  await expect(page.locator('.zk-map-badges').filter({ hasText: 'Orc' })).toHaveCount(1);

  // 3. The secret objective: a menu row; the kept card shows in the bench.
  await expect(page.locator('.round-note')).toHaveText('Setup · Secrets');
  await menuRow(page, /Keep secret objective/);
  await expect(page.locator('.log li').first()).toContainText('kept a secret objective', { timeout: 20_000 });
  await expect(page.locator('[data-flip-id="sl:secrets"] .zk-card').first()).toBeVisible();

  // 4. The starting hand comes from the Draw button, not by itself.
  await expect(page.locator('.round-note')).toHaveText('Setup · Intel');
  await expect(page.locator('[data-flip-id="sl:hand"] .zk-card')).toHaveCount(0);
  const draw = page.getByRole('button', { name: 'Draw', exact: true });
  await expect(draw).toBeVisible();
  await draw.click();
  await expect(page.locator('[data-flip-id="sl:hand"] .zk-card')).toHaveCount(3, { timeout: 30_000 });

  // 5. Play: the recall step first (the home start tile lights up), then the
  //    turn's Intel gain (Draw), then a card whose tap opens the chooser.
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });
  for (let i = 0; i < 6; i++) {
    const note = await page.locator('.round-note').textContent();
    const before = await page.locator('.log li').first().textContent();
    if (/Recall/i.test(note ?? '')) {
      await page.locator('.zk-map-blob.zk-lit').first().click();
      await page.getByRole('dialog', { name: 'Which move?' }).getByRole('button', { name: /Skip recall/ }).click();
    } else if (await page.getByRole('button', { name: 'Draw', exact: true }).isVisible()) {
      await page.getByRole('button', { name: 'Draw', exact: true }).click();
    } else if (/Play/i.test(note ?? '')) {
      break;
    }
    // The reply plays back before the next step shows; wait for it.
    await expect(page.locator('.log li').first()).not.toHaveText(before ?? '', { timeout: 30_000 });
    await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });
  }
  await expect(page.locator('.round-note')).toContainText('Play');
  const card = page.locator('[data-flip-id="sl:hand"] .zk-card.zk-lit').first();
  await expect(card).toBeVisible();
  const before = await page.locator('.log li').first().textContent();
  await card.click();
  const moves = page.getByRole('dialog', { name: 'Which move?' });
  await expect(moves).toBeVisible();
  const rows = moves.locator('.chooser button');
  expect(await rows.count()).toBeGreaterThan(1);
  await expect(rows.first()).toContainText(/^(Play|Use)/);
  await rows.first().click();
  await expect(page.locator('.log li').first()).not.toHaveText(before ?? '', { timeout: 30_000 });
  await expect(moves).toBeHidden();
});
