// T47: an admin can unfeature a game. On /admin, give Fractured Fist and
// Cybernoir 2127 featured places, check home shows both in that order, empty
// Fractured Fist's place with Unfeature, and check home no longer features it
// while Cybernoir stays. Then put the places back as they were.
//
// Needs the full stack with the test outbox (E2E_TEST_OUTBOX=1) and the
// server's ADMIN_EMAILS listing E2E_ADMIN_EMAIL; skipped without it.

import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';

const ADMIN = process.env.E2E_ADMIN_EMAIL;

async function placeOf(page: Page, name: string): Promise<number | null> {
  const games = (await (await page.request.get('/api/games')).json()).games as Array<{ name: string; featuredRank: number | null }>;
  return games.find((g) => g.name === name)!.featuredRank;
}

async function setPlace(page: Page, name: string, place: number | null) {
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
  const field = page.getByLabel(/Featured place/);
  if (place === null) {
    if (await page.getByRole('button', { name: 'Unfeature' }).count()) await page.getByRole('button', { name: 'Unfeature' }).click();
    await expect(field).toHaveValue('');
  } else {
    await field.fill(String(place));
  }
  await page.getByRole('button', { name: `Save ${name}` }).click();
  await expect(page.getByRole('status')).toHaveText(/Saved/);
}

async function featuredOnHome(page: Page): Promise<string[]> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Newest' })).toBeVisible();
  return page.locator('.featured-grid .card-title').allTextContents();
}

test('an admin unfeatures a game and home stops featuring it; the others keep their order', async ({ browser, baseURL }) => {
  test.skip(!ADMIN, 'set E2E_ADMIN_EMAIL to an address in the server\'s ADMIN_EMAILS');
  const page = await signIn(browser, ADMIN!, baseURL!);
  const before = { ff: await placeOf(page, 'Fractured Fist'), cn: await placeOf(page, 'Cybernoir 2127') };

  try {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
    await setPlace(page, 'Fractured Fist', 1);
    await setPlace(page, 'Cybernoir 2127', 2);
    let home = await featuredOnHome(page);
    expect(home.indexOf('Fractured Fist')).toBeGreaterThanOrEqual(0);
    expect(home.indexOf('Fractured Fist')).toBeLessThan(home.indexOf('Cybernoir 2127'));

    await page.goto('/admin');
    await setPlace(page, 'Fractured Fist', null);
    // The list beside the form reads the saved row back.
    await expect(page.getByRole('button', { name: /^Fractured Fist/ })).toContainText('Not featured');
    expect(await placeOf(page, 'Fractured Fist')).toBeNull();

    home = await featuredOnHome(page);
    expect(home).not.toContain('Fractured Fist');
    expect(home).toContain('Cybernoir 2127');

    // A reload of /admin still shows it unfeatured.
    await page.goto('/admin');
    await page.getByRole('button', { name: /^Fractured Fist/ }).click();
    await expect(page.getByLabel(/Featured place/)).toHaveValue('');
  } finally {
    // Leave the storefront as it was.
    await page.goto('/admin');
    await setPlace(page, 'Fractured Fist', before.ff);
    await setPlace(page, 'Cybernoir 2127', before.cn);
  }
});
