// The game page's screenshot viewer on a 390 x 844 phone, with the worst
// case an admin can upload: very tall (portrait) screenshots and a long game
// name. The previous and next arrows and the X must stay inside the dialog,
// on screen, and work. The game's record and its images are stood in for by
// the test, so it does not depend on what is uploaded.

import { test, expect, type Locator } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const LONG_NAME = 'The Extraordinarily Long-Named Expedition Through the Clockwork Marshes of Upper Fenwick';
const tall = (n: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="2400"><rect width="400" height="2400" fill="#2b6"/><text x="40" y="200" font-size="120">${n}</text></svg>`;

async function insideDialogOnScreen(el: Locator, dialog: Locator): Promise<void> {
  const b = (await el.boundingBox())!;
  const d = (await dialog.boundingBox())!;
  expect(b.y, 'top inside the dialog').toBeGreaterThanOrEqual(d.y);
  expect(b.y + b.height, 'bottom inside the dialog').toBeLessThanOrEqual(d.y + d.height + 0.5);
  expect(b.y + b.height, 'bottom on screen').toBeLessThanOrEqual(844);
  await expect(el).toBeInViewport({ ratio: 1 });
}

test('tall screenshots and a long name keep the arrows and the X inside the dialog on a phone', async ({ page }) => {
  await page.route('**/api/games/fractured-fist', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.game.name = LONG_NAME;
    body.game.screenshots = [1, 2, 3].map((n) => `/tall-shot-${n}.svg`);
    await route.fulfill({ response: res, json: body });
  });
  await page.route('**/tall-shot-*.svg', (route) => {
    const n = Number(/tall-shot-(\d+)/.exec(route.request().url())![1]);
    return route.fulfill({ contentType: 'image/svg+xml', body: tall(n) });
  });

  await page.goto('/games/fractured-fist');
  await page.locator('.shots .shot').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName(`${LONG_NAME}, screenshot 1 of 3`);
  const img = dialog.locator('.shot-frame img');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalHeight)).toBe(2400);
  await page.waitForTimeout(400); // past the opening and slide motion

  const prev = dialog.getByRole('button', { name: 'Previous screenshot' });
  const next = dialog.getByRole('button', { name: 'Next screenshot' });
  const close = dialog.getByRole('button', { name: 'Close' });
  for (const el of [prev, next, close]) await insideDialogOnScreen(el, dialog);
  // The picture is shrunk to the room left, not cut off under the arrows.
  const ib = (await img.boundingBox())!;
  const nb = (await next.boundingBox())!;
  expect(ib.y + ib.height).toBeLessThanOrEqual(nb.y);

  // And they work: next, previous, then the X.
  await next.click();
  await expect(dialog).toHaveAccessibleName(`${LONG_NAME}, screenshot 2 of 3`);
  await page.waitForTimeout(400);
  for (const el of [prev, next]) await insideDialogOnScreen(el, dialog);
  await prev.click();
  await expect(dialog).toHaveAccessibleName(`${LONG_NAME}, screenshot 1 of 3`);
  await close.click();
  await expect(dialog).toHaveCount(0);
});
