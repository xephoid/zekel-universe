// M4: Warble Way Galaxy, the solo game. Character creation is a form the
// player fills in (the engine's skeleton is never sent as listed), then the
// season runs on the Roll and Draw buttons: every die and every travel card
// waits for a press, and a roll shows its dice on the table.
// Needs the full stack (engine + server on BASE_URL).

import { test, expect, type Page } from '@playwright/test';

const log = (page: Page) => page.locator('.log li').first();

async function pressIfOffered(page: Page, name: 'Roll' | 'Draw'): Promise<boolean> {
  const b = page.getByRole('button', { name, exact: true });
  if (!(await b.isVisible())) return false;
  await b.click();
  return true;
}

/** Click a menu row and wait for the engine's reply in the log. A rule
 *  rejection (a notice) is dismissed and reported as false. */
async function tryRow(page: Page, row: ReturnType<Page['locator']>): Promise<boolean> {
  const before = await log(page).textContent();
  await row.click();
  const notice = page.locator('.toast').first();
  const changed = log(page).filter({ hasNotText: before ?? '' });
  await Promise.race([
    changed.waitFor({ timeout: 15_000 }).catch(() => undefined),
    notice.waitFor({ timeout: 15_000 }).catch(() => undefined),
  ]);
  if (await notice.isVisible()) {
    await notice.getByRole('button', { name: 'OK' }).click();
    return (await log(page).textContent()) !== before;
  }
  return (await log(page).textContent()) !== before;
}

test('Warble Way: the character is the player\'s to create, and dice and cards wait for the button', async ({ page }) => {
  await page.goto('/games/warble-way-galaxy/setup');
  await expect(page.getByRole('heading', { name: 'Set up the table' })).toBeVisible();

  // The character is created on the setup screen: every answer is the
  // player's, nothing is preselected, and the start waits for them.
  const start = page.getByRole('button', { name: 'Start the game' });
  await expect(start).toBeDisabled();
  await page.getByLabel("Your character's name").fill('Zara');
  await page.getByRole('group', { name: 'Race' }).getByRole('radio', { name: 'Grull' }).check();
  await page.getByLabel("Your ship's name").fill('Wandering Star');
  await page.getByRole('group', { name: 'Ability scores' }).getByRole('radio', { name: 'Choose the scores' }).check();
  await expect(start).toBeDisabled(); // scores still empty
  await page.getByLabel(/Swashbuckling/).fill('3');
  await page.getByLabel(/Hacking/).fill('2');
  await page.getByLabel(/Sneaking/).fill('1');
  for (const other of ['Armor', 'Demolitions', 'Research', 'Mechanics', 'Piloting', 'Gunslinging', 'Leadership', 'Diplomacy', 'Acting']) {
    await page.getByLabel(new RegExp(other)).fill('0');
  }
  await page.getByRole('group', { name: /Disposition/ }).getByRole('radio', { name: 'Brash' }).check();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page).toHaveURL(/\/table\//, { timeout: 20_000 });
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });
  await expect(page.locator('.zk-tableau').filter({ hasText: 'Zara' }).first()).toBeVisible();
  await expect(page.locator('.zk-tableau').filter({ hasText: 'Wandering Star' }).first()).toBeVisible();
  const rows = page.locator('.move-menu ol button');
  await expect(rows.filter({ hasText: /Create your character/ })).toHaveCount(0);

  // Take a mission to launch into space, then draw and roll only by pressing.
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });
  // A plain check mission (not the ruins one, whose setup is a longer form).
  expect(await tryRow(page, rows.filter({ hasText: /^Take the [A-Z]{3} \d+ mission/ }).first())).toBe(true);

  let draws = 0;
  let rolls = 0;
  for (let i = 0; i < 40 && (draws === 0 || rolls === 0); i++) {
    await expect(page.locator('.turn-pill')).toHaveText(/^Your move|^Game over/, { timeout: 30_000 });
    if (await page.locator('.turn-pill').textContent() === 'Game over') break;
    const before = await log(page).textContent();
    if (await pressIfOffered(page, 'Draw')) {
      draws += 1;
      await expect(log(page)).not.toHaveText(before ?? '', { timeout: 30_000 });
      continue;
    }
    if (await pressIfOffered(page, 'Roll')) {
      rolls += 1;
      await expect(log(page)).not.toHaveText(before ?? '', { timeout: 30_000 });
      await expect(page.locator('.zk-die').first()).toBeVisible();
      continue;
    }
    // No randomness pending: a chooser or form that opened, else the plainest
    // way forward the menu offers, else any row the engine accepts.
    const dialog = page.getByRole('dialog');
    if (await dialog.count()) {
      const pickRow = dialog.locator('.chooser button').first();
      if (await pickRow.count()) {
        await pickRow.click();
        await expect(log(page)).not.toHaveText(before ?? '', { timeout: 30_000 });
      } else {
        // A form this explorer cannot answer: close it and take another road.
        await dialog.getByRole('button', { name: 'Close' }).click();
      }
      continue;
    }
    const prefer = [/^Decline/i, /^Skip/i, /^Leave/i, /^Continue|^End/i, /^Depart/i, /^Take the .* mission/i, /^Evade|^Flee/i];
    let done = false;
    for (const re of prefer) {
      const row = rows.filter({ hasText: re }).first();
      if ((await row.count()) && (await tryRow(page, row))) { done = true; break; }
    }
    if (!done) {
      const n = await rows.count();
      for (let k = 0; k < n && !done; k++) done = await tryRow(page, rows.nth(k));
    }
    expect(done, 'some listed move was accepted').toBe(true);
  }
  expect(draws, 'travel cards were drawn by the button').toBeGreaterThan(0);
  expect(rolls, 'dice were rolled by the button').toBeGreaterThan(0);
});
