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
  await expect(page.getByRole('heading', { name: 'Set up your table' })).toBeVisible();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page).toHaveURL(/\/table\//, { timeout: 20_000 });
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });

  // Two skeletons on the menu; the first opens the form with empty answers.
  const rows = page.locator('.move-menu ol button');
  await expect(rows.filter({ hasText: /Create your character/ })).toHaveCount(1);
  await rows.filter({ hasText: /Create your character/ }).click();
  const form = page.getByRole('dialog', { name: 'Create your character' });
  await expect(form).toBeVisible();
  const begin = form.getByRole('button', { name: 'Begin the season' });
  await expect(begin).toBeDisabled();
  await expect(form.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(form.getByLabel('Character name')).toHaveValue('');
  await form.getByLabel('Character name').fill('Zara');
  await form.getByRole('group', { name: 'Race' }).getByRole('radio', { name: 'Grull' }).check();
  await form.getByLabel('Ship name').fill('Wandering Star');
  await form.getByRole('group', { name: /Disposition/ }).getByRole('radio', { name: 'Brash' }).check();
  await expect(begin).toBeDisabled(); // scores still empty
  await form.getByLabel(/Swashbuckling/).fill('3');
  await form.getByLabel(/Hacking/).fill('2');
  await form.getByLabel(/Sneaking/).fill('1');
  await expect(begin).toBeEnabled();
  await begin.click();
  await expect(log(page)).not.toHaveText('The table is set.', { timeout: 30_000 });
  await expect(page.locator('.zk-tableau').filter({ hasText: 'Zara' }).first()).toBeVisible();
  await expect(page.locator('.zk-tableau').filter({ hasText: 'Wandering Star' }).first()).toBeVisible();

  // Take a mission to launch into space, then draw and roll only by pressing.
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });
  expect(await tryRow(page, rows.filter({ hasText: /^Take the .* mission/ }).first())).toBe(true);

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
      await dialog.locator('.chooser button, button[type=submit]').first().click();
      await expect(log(page)).not.toHaveText(before ?? '', { timeout: 30_000 });
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
