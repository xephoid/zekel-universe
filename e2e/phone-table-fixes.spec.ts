// T40: three things the table shell gets wrong on a phone (390 x 844), found
// by the phone audit of the launch games. Each holds for every game with a
// phone layout; Word Debauchee and Cybernoir show them.
// - The rules lesson keeps its buttons on the title's row, 44 px tall, and
//   its sentence to two lines, so the board keeps the room.
// - The turn pill says the whole instruction, on two lines if it must.
// - The engine's move list is pressed with a thumb: every row 44 px tall.

import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function startWordDebauchee(page: Page): Promise<void> {
  await page.goto('/games/word-debauchee');
  await page.getByRole('link', { name: 'Play now' }).click();
  const more = page.getByRole('button', { name: 'More players' });
  while ((await page.locator('.seat-card').count()) < 4) await more.click();
  await page.getByRole('group', { name: 'The House' }).getByLabel('Off').check();
  await page.getByRole('group', { name: 'Who goes first' }).getByLabel('You').check();
  await page.getByRole('group', { name: 'Bribe' }).getByLabel('On').check();
  await page.getByRole('group', { name: 'Open hand' }).getByLabel('Off').check();
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page).toHaveURL(/\/table\//);
  await expect(page.locator('.table-shell.phone .wd-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.turn-pill.mine')).toBeVisible({ timeout: 30_000 });
}

test('the lesson and the turn pill leave the board its room on a phone', async ({ page }) => {
  await startWordDebauchee(page);
  // The first lesson arrives with the clues, after a word is kept.
  await expect(page.getByRole('heading', { name: 'Keep one word' })).toBeVisible();
  await page.locator('.wd-screen .wd-wordcard:not(:disabled)').first().click();
  await expect(page.getByRole('heading', { name: 'Play three clues' })).toBeVisible({ timeout: 30_000 });

  const note = page.getByRole('note', { name: /^Rule: / });
  await expect(note).toBeVisible();
  const box = await note.boundingBox();
  const head = await note.locator('.lesson-head').boundingBox();
  for (const name of ['More', 'Got it']) {
    const b = await note.getByRole('button', { name, exact: true }).boundingBox();
    expect(b!.height, `${name} is thumb-sized`).toBeGreaterThanOrEqual(44);
    // on the title's row, not a row of its own under the sentence
    expect(Math.abs(b!.y + b!.height / 2 - (head!.y + head!.height / 2)), `${name} beside the title`).toBeLessThan(24);
  }
  expect(box!.height, 'the lesson stays short').toBeLessThanOrEqual(100);
  // More opens the whole text; Less closes it again.
  await note.getByRole('button', { name: 'More', exact: true }).click();
  expect((await note.boundingBox())!.height).toBeGreaterThan(box!.height);
  await note.getByRole('button', { name: 'Less', exact: true }).click();

  // The whole turn instruction is on screen, inside the bar.
  const pill = page.locator('.turn-pill');
  const words = pill.locator('.turn-text');
  const cut = await words.evaluate((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  expect(cut, `the turn reads in full: "${await words.textContent()}"`).toBe(false);
  const bar = await page.locator('.table-topbar').boundingBox();
  const p = await pill.boundingBox();
  expect(p!.y).toBeGreaterThanOrEqual(bar!.y);
  expect(p!.y + p!.height).toBeLessThanOrEqual(bar!.y + bar!.height);
  expect(p!.x + p!.width).toBeLessThanOrEqual(390);
});

test('the engine move list is thumb-sized on a phone', async ({ page }) => {
  await page.goto('/games/cybernoir-2127/setup');
  await page.getByRole('group', { name: 'Your role' }).getByRole('radio', { name: 'Detective' }).check();
  await page.getByRole('group', { name: /Overclock/ }).getByRole('radio').first().check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page).toHaveURL(/\/table\//);
  await expect(page.locator('.table-shell.phone')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.turn-pill.mine')).toBeVisible({ timeout: 30_000 });

  const menu = page.locator('.move-menu');
  await expect(menu).toBeVisible();
  if (!(await menu.evaluate((d) => (d as HTMLDetailsElement).open))) await menu.locator('summary').click();
  const rows = menu.locator('ol button');
  await expect(rows.first()).toBeVisible();
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const b = await rows.nth(i).boundingBox();
    expect(b!.height, `row ${i + 1}: ${await rows.nth(i).textContent()}`).toBeGreaterThanOrEqual(44);
  }
  expect((await menu.locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
