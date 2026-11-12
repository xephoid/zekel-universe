// The site pages at 390 x 844: no page scrolls sideways, the bar keeps
// Browse, My tables, Designers, search and who you are, and the controls a
// thumb presses on setup are at least 44px tall. The game tables are not
// covered here; each game's phone layout has its own spec.

import { test, expect, type Page } from '@playwright/test';
import { signIn } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function expectFitsAcross(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  // Against the fixed 390, not innerWidth: on a phone the browser widens its
  // layout viewport to fit an overflowing page, so innerWidth grows with it.
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(wide, `${path} is wider than the phone`).toBeLessThanOrEqual(390);
}

async function expectBar(page: Page): Promise<void> {
  const bar = page.locator('.topnav');
  for (const name of ['Browse', 'My tables', 'Designers']) await expect(bar.getByRole('link', { name, exact: true })).toBeInViewport();
  await expect(bar.getByRole('searchbox', { name: 'Search games' })).toBeInViewport();
}

test('every site page fits a phone, signed out and signed in', async ({ page, browser, baseURL }) => {
  const pages = ['/', '/games/sweetlands-imperium', '/games/sweetlands-imperium/setup', '/games/sweetlands-imperium/rules',
    '/designers', '/designers/zekel-games', '/signin', '/tables', '/profile', '/no-such-page'];
  for (const path of pages) await expectFitsAcross(page, path);
  await page.goto('/');
  await expectBar(page);
  await expect(page.locator('.topnav').getByRole('link', { name: 'Sign in' })).toBeInViewport();

  const me = await signIn(browser, `phone-pages-${Date.now()}@example.com`, baseURL!);
  await me.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/profile', '/tables', '/games/cybernoir-2127/setup']) await expectFitsAcross(me, path);
  await expectBar(me);
  await expect(me.locator('.topnav a[href="/profile"]')).toBeInViewport();

  // Setup's seat controls drop under the seat's name and are thumb-sized.
  await me.goto('/games/sweetlands-imperium/setup');
  const seat = me.getByRole('group', { name: 'Seat 2' });
  for (const name of ['AI', 'Friend', 'easy', 'medium', 'hard']) {
    const box = await seat.getByRole('button', { name, exact: true }).boundingBox();
    expect(box!.height, `${name} is thumb-sized`).toBeGreaterThanOrEqual(44);
  }

  // The lobby, from a friend seat.
  await me.goto('/games/cybernoir-2127/setup');
  await me.getByRole('group', { name: 'Seat 2' }).getByRole('button', { name: 'Friend' }).click();
  await me.getByRole('radio', { name: /^Live/ }).click();
  await me.getByRole('group', { name: 'Your role' }).getByRole('radio', { name: 'Hacker' }).check();
  await me.getByRole('group', { name: /Overclock/ }).getByRole('radio', { name: 'Immediate' }).check();
  await me.getByRole('button', { name: 'Open the lobby' }).click();
  await expect(me).toHaveURL(/\/table\/[^/]+\/lobby/);
  await expectFitsAcross(me, new URL(me.url()).pathname);
});
