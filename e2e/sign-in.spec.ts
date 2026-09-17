// M2 sign-in flow: a guest starts a table, asks for a sign-in link, opens
// it, and lands signed in with their guest history moved to the account.
// The server is started with E2E_TEST_OUTBOX=1 so the console mailer's
// outbox is readable at /api/test/outbox (never in production).

import { test, expect } from '@playwright/test';
import { readSignInLink, toBase } from './helpers';

const EMAIL = 'zeke@example.com';

test('a guest signs in by email link and keeps their table', async ({ page, baseURL }) => {
  // 1. Arrive as a guest and open a table against the AI, so there is
  //    something to carry over into the account.
  await page.goto('/');
  await page.getByRole('link', { name: /Fractured Fist/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Fractured Fist', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Play now' }).click();
  await expect(page.getByText('Choose the 7 techniques in play')).toBeVisible();
  const boxes = page.getByRole('group', { name: /Choose the 7 techniques/ }).getByRole('checkbox');
  for (let i = 0; i < 7; i++) await boxes.nth(i).check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page).toHaveURL(/\/table\//);
  await expect(page.getByText(/^Your move/)).toBeVisible({ timeout: 30_000 });
  const tablePath = new URL(page.url()).pathname;
  const tableId = tablePath.split('/').filter(Boolean).pop()!;

  // page.request shares the browser context's cookies; the bare `request`
  // fixture does not, and would see nobody.
  const meBefore = await (await page.request.get('/api/me')).json();
  expect(meBefore.user).toBeNull();
  expect(meBefore.guest).toBeTruthy();

  // 2. Ask for the link from the sign-in page, headed back to this table.
  await page.goto(`/signin?next=${encodeURIComponent(tablePath)}`);
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText(/Link sent to/)).toBeVisible();

  // 3. Open the link the console mailer "sent".
  const link = toBase(await readSignInLink(page.request, EMAIL), baseURL!);
  await page.goto(link);
  // The complete page posts the fragment token, then navigates to `next`.
  await expect(page).toHaveURL(new RegExp(`${tableId}$`), { timeout: 20_000 });

  // 4. Signed in, and the guest's seat moved to the user.
  const meAfter = await (await page.request.get('/api/me')).json();
  expect(meAfter.user).toBeTruthy();
  expect(meAfter.guest).toBeNull();
  const { tables } = await (await page.request.get('/api/my-tables')).json();
  expect(tables.some((t: { id: string }) => t.id === tableId)).toBeTruthy();

  // 5. The nav shows the account's profile link, not Sign in.
  await page.goto('/');
  const profileLink = page.locator('.topnav a[href="/profile"]');
  await expect(profileLink).toBeVisible();
  await expect(page.locator('.topnav').getByRole('link', { name: 'Sign in' })).toBeHidden();

  // 6. Sign out returns the nav to the signed-out state.
  await profileLink.click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.locator('.topnav').getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('a used or bogus sign-in token is rejected with a plain message', async ({ page, baseURL }) => {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText(/Link sent to/)).toBeVisible();
  const link = toBase(await readSignInLink(page.request, EMAIL), baseURL!);

  await page.goto(link);
  await expect(page).toHaveURL(/\/$|\/table\//, { timeout: 20_000 });

  // Reusing the same link fails: it was consumed on first use.
  await page.goto(link);
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();

  // A made-up token fails the same way, with no oracle about validity.
  await page.goto(`${baseURL}/signin/complete#token=nonsense`);
  await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
});
