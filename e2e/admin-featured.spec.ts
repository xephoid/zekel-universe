// T47: an admin can unfeature a game, and the clear is saved at once. On
// /admin, give Fractured Fist and Cybernoir 2127 featured places with Save
// and check home shows them in that order. Then, without pressing Save:
// Unfeature Fractured Fist while another field is half-edited (the edit must
// stay unsaved), and empty Cybernoir's field. Unfeature every other featured
// game too, and check home draws no Featured row at all. Finally put every
// place back as it was.
//
// Needs the full stack with the test outbox (E2E_TEST_OUTBOX=1) and the
// server's ADMIN_EMAILS listing E2E_ADMIN_EMAIL; skipped without it.

import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';

const ADMIN = process.env.E2E_ADMIN_EMAIL;
type Listed = { engineGameId: string; name: string; visibility: string; featuredRank: number | null };

async function catalog(page: Page): Promise<Listed[]> {
  return (await (await page.request.get('/api/games')).json()).games as Listed[];
}
async function placeOf(page: Page, name: string): Promise<number | null> {
  return (await catalog(page)).find((g) => g.name === name)!.featuredRank;
}

async function pick(page: Page, name: string) {
  await page.locator('.admin-split').getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible();
}

/** The Save path: type the place (or empty it) and press Save. */
async function saveWithPlace(page: Page, name: string, place: number | null) {
  await pick(page, name);
  await page.getByLabel(/Featured place/).fill(place === null ? '' : String(place));
  await page.getByRole('button', { name: `Save ${name}` }).click();
  await expect(page.getByText(/^Saved\./)).toBeVisible();
}

async function featuredOnHome(page: Page): Promise<string[]> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Newest' })).toBeVisible();
  return page.locator('.featured-grid .card-title').allTextContents();
}

test('an admin unfeatures games without pressing Save; home drops them and, with none left, draws no Featured row', async ({ browser, baseURL }) => {
  test.skip(!ADMIN, 'set E2E_ADMIN_EMAIL to an address in the server\'s ADMIN_EMAILS');
  const page = await signIn(browser, ADMIN!, baseURL!);
  const before = await catalog(page);

  try {
    // Places set the usual way, with Save.
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
    await saveWithPlace(page, 'Fractured Fist', 1);
    await saveWithPlace(page, 'Cybernoir 2127', 2);
    let home = await featuredOnHome(page);
    expect(home.indexOf('Fractured Fist')).toBeGreaterThanOrEqual(0);
    expect(home.indexOf('Fractured Fist')).toBeLessThan(home.indexOf('Cybernoir 2127'));

    // Unfeature, with the name half-edited: the place is saved, the name is not.
    await page.goto('/admin');
    await pick(page, 'Fractured Fist');
    await page.getByLabel('Name').fill('Fractured Fist, not saved');
    await page.getByRole('button', { name: 'Unfeature' }).click();
    await expect(page.getByText(/^Unfeatured\./)).toBeVisible();
    await expect(page.locator('.admin-split').getByRole('button', { name: /^Fractured Fist/ })).toContainText('Not featured');
    expect(await placeOf(page, 'Fractured Fist')).toBeNull();
    expect((await catalog(page)).some((g) => g.name === 'Fractured Fist, not saved')).toBe(false);
    home = await featuredOnHome(page);
    expect(home).not.toContain('Fractured Fist');
    expect(home).toContain('Cybernoir 2127');

    // Empty Cybernoir's field: saved at once as well.
    await page.goto('/admin');
    await pick(page, 'Cybernoir 2127');
    await page.getByLabel(/Featured place/).fill('');
    await expect(page.getByText(/^Unfeatured\./)).toBeVisible();
    expect(await placeOf(page, 'Cybernoir 2127')).toBeNull();

    // Every other featured game, then home has no Featured row.
    for (const g of (await catalog(page)).filter((x) => x.featuredRank !== null)) {
      await pick(page, g.name);
      await page.getByRole('button', { name: 'Unfeature' }).click();
      await expect(page.getByText(/^Unfeatured\./)).toBeVisible();
    }
    expect((await catalog(page)).filter((g) => g.featuredRank !== null)).toEqual([]);
    home = await featuredOnHome(page);
    expect(home).toEqual([]);
    await expect(page.getByRole('heading', { name: 'Featured' })).toHaveCount(0);

    // A reload of /admin still shows the places empty.
    await page.goto('/admin');
    await pick(page, 'Fractured Fist');
    await expect(page.getByLabel(/Featured place/)).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Unfeature' })).toHaveCount(0);
  } finally {
    // Leave the storefront as it was.
    await page.goto('/admin');
    for (const g of before) {
      if (g.featuredRank !== null || (await placeOf(page, g.name)) !== null) await saveWithPlace(page, g.name, g.featuredRank);
    }
  }
});
