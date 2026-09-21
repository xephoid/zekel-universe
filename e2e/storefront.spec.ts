// M5: the storefront. Browsing and search on home, the game page with its
// devlog and rules link, the designer profile, and the acceptance check:
// a shared game link lands a stranger in a playing game in under a minute
// with no account. Then a second stranger watches that table by its share
// link and sees the public view, never the player's hand.
// Needs the full stack (engine + server on BASE_URL).

import { test, expect } from '@playwright/test';
import { pickSeven } from './helpers';

test('a stranger with a game link is playing in under a minute; browsing, the devlog and the designer profile work', async ({ page, browser }) => {
  // The acceptance check first, timed from the shared link.
  const t0 = Date.now();
  await page.goto('/games/fractured-fist');
  // The tab icon is the wordmark's meeple, served as SVG with a PNG fallback.
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/favicon.svg');
  const icon = await page.request.get('/favicon.svg');
  expect(icon.status()).toBe(200);
  expect(await icon.text()).toContain('rotate(-90 50 50)');
  expect((await page.request.get('/favicon-32.png')).status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Fractured Fist', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Play now' }).click();
  await pickSeven(page);
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page).toHaveURL(/\/table\//);
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });
  const seconds = (Date.now() - t0) / 1000;
  expect(seconds, 'seconds from the game link to the first move').toBeLessThan(60);
  const me = await (await page.request.get('/api/me')).json();
  expect(me.user).toBeNull(); // no account
  const tableId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()!;

  // The watch link: a second stranger sees the public view and the log,
  // and never the player's hand. Matched on the JSON key, since the public
  // block carries hand_size.
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  const watcher = await (await browser.newContext()).newPage();
  await watcher.goto(`/table/${tableId}/watch`);
  await expect(watcher.locator('.turn-pill')).toHaveText(/Waiting on|thinking/, { timeout: 20_000 });
  await expect(watcher.getByText('Watching')).toBeVisible();
  await expect(watcher.locator('.log li').first()).toContainText('The table is set.');
  await expect(watcher.locator('.zk-tableau').first()).toBeVisible();
  const feed = await (await watcher.request.get(`/api/tables/${tableId}/watch`)).text();
  expect(feed).not.toContain('"hand":');
  expect(feed).not.toContain('legalMoves');
  // A stranger still cannot read a seat's feed.
  expect((await watcher.request.get(`/api/tables/${tableId}/events?after=0`)).status()).toBe(403);
  // The watcher cannot act: no move menu, no lit parts.
  await expect(watcher.locator('.move-menu')).toHaveCount(0);
  await expect(watcher.locator('.zk-lit')).toHaveCount(0);

  // Home: search and browse.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Featured' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
  // (Scoped to the results: this guest's own table sits in My tables above.)
  const results = page.locator('.browse');
  await page.getByRole('searchbox', { name: 'Search games' }).fill('candy');
  await expect(results.getByRole('heading', { name: 'One game' })).toBeVisible();
  await expect(results.getByRole('link', { name: /Sweetlands Imperium/ })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search games' }).fill('');
  await page.getByRole('combobox', { name: 'Players' }).selectOption('1');
  await expect(results.getByRole('link', { name: /Warble Way Galaxy/ })).toBeVisible();
  await expect(results.getByRole('link', { name: /Fractured Fist/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Players' }).selectOption('');
  await page.getByRole('combobox', { name: 'Tag' }).selectOption('duel');
  await expect(results.getByRole('link', { name: /Fractured Fist/ })).toBeVisible();
  await expect(results.getByRole('link', { name: /Cybernoir 2127/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('heading', { name: 'Featured' })).toBeVisible();

  // The game page: the devlog, the rules page, the designer profile.
  await page.getByRole('link', { name: /Sweetlands Imperium/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Sweetlands Imperium', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /The Sweetlands board, space for space/ })).toBeVisible();
  await page.getByRole('link', { name: 'Read the rules' }).click();
  await expect(page.getByRole('heading', { name: 'Sweetlands Imperium: the rules' })).toBeVisible();
  await expect(page.locator('.rules-text')).toContainText(/Sweetlands/);
  await page.goBack();
  await page.getByRole('link', { name: 'Zekel Games' }).click();
  await expect(page.getByRole('heading', { name: 'Zekel Games', level: 1 })).toBeVisible();
  const shelf = page.locator('.newest-grid');
  await expect(shelf.getByRole('link', { name: /Fractured Fist/ })).toBeVisible();
  await expect(shelf.getByRole('link', { name: /Warble Way Galaxy/ })).toBeVisible();
  await expect(page.locator('.update-card')).toHaveCount(4);
  // The designers' place in the navigation.
  await page.locator('.topnav').getByRole('link', { name: 'Designers' }).click();
  await expect(page.getByRole('heading', { name: 'Designers' })).toBeVisible();

  // My tables: only this guest's tables, and the one against the AI can be deleted.
  await page.locator('.topnav').getByRole('link', { name: /My tables/ }).click();
  await expect(page.getByRole('heading', { name: 'My tables', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Featured' })).toHaveCount(0);
  const row = page.locator(`.table-row[data-table-id="${tableId}"]`);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Delete/ }).click();
  await expect(row.getByText('Delete this table?')).toBeVisible();
  await row.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/api/tables/${tableId}`)).status()).toBe(404);
  expect((await watcher.request.get(`/api/tables/${tableId}/watch`)).status()).toBe(404);
});
