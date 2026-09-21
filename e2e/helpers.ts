// Shared helpers for the browser specs. Not a spec file: Playwright refuses
// imports between spec files.

import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export interface Mail { to: string; subject: string; text: string }

/** Every mail the test outbox holds for an address, oldest first. */
export async function readMails(request: APIRequestContext, email: string): Promise<Mail[]> {
  const res = await request.get('/api/test/outbox');
  expect(res.ok()).toBeTruthy();
  const { mails } = (await res.json()) as { mails: Mail[] };
  return mails.filter((m) => m.to === email);
}

/** The most recent sign-in link mailed to an address, from the test outbox. */
export async function readSignInLink(request: APIRequestContext, email: string): Promise<string> {
  let link = '';
  await expect(async () => {
    // Only sign-in mails: a by-turns nudge to the same address carries a link too.
    const mail = (await readMails(request, email)).filter((m) => /sign-in/i.test(m.subject)).pop();
    expect(mail, `a sign-in mail for ${email}`).toBeTruthy();
    const match = /https?:\/\/\S+/.exec(mail!.text);
    expect(match).toBeTruthy();
    link = match![0];
  }).toPass({ timeout: 10_000 });
  return link;
}

/** A fresh browser context signed in by email link, landed on the home page. */
export async function signIn(browser: Browser, email: string, baseURL: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText(/Link sent to/)).toBeVisible();
  const link = toBase(await readSignInLink(page.request, email), baseURL);
  await page.goto(link);
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expect(page.locator('.topnav a[href="/profile"]')).toBeVisible();
  return page;
}

/** The emailed URL points at APP_ORIGIN, which may differ from BASE_URL in
 *  a test rig; keep the path and the fragment, rewrite the origin. */
export function toBase(link: string, base: string): string {
  const url = new URL(link);
  const b = new URL(base);
  return `${b.origin}${url.pathname}${url.search}${url.hash}`;
}

/**
 * The Fractured Fist loadout on the setup screen: thirty technique cards
 * grouped by school, nothing preselected, seven to add. Picks the first
 * seven cards, one press each, and checks the slots fill up.
 */
export async function pickSeven(page: Page): Promise<void> {
  await expect(page.getByText(/Choose the 7 techniques in play/)).toBeVisible();
  const cards = page.getByRole('button', { name: /^Add / });
  await expect(cards.first()).toBeVisible();
  expect(await page.getByRole('button', { name: /^Remove / }).count()).toBe(0);
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: /^Add / }).first().click();
  await expect(page.getByText('7/7')).toBeVisible();
}

/** Tap a lit card in the bench when there is one; else pick from the menu. */
export async function makeMove(page: Page): Promise<'tap' | 'menu' | null> {
  const lit = page.locator('.table-bench .zk-card.zk-lit');
  if (await lit.count()) {
    await lit.first().click();
    return 'tap';
  }
  const menu = page.locator('.move-menu');
  if (!(await menu.isVisible())) return null;
  if (!(await menu.evaluate((el) => (el as HTMLDetailsElement).open))) await menu.locator('summary').click();
  const buttons = menu.locator('ol button');
  const labels = await buttons.allTextContents();
  // Prefer buying, then moving the turn along, so the game advances and the
  // deck grows; card plays are taken by tap above.
  const order = [/^Buy /i, /^Refine/i, /^Skip/i, /^Advance/i, /^End turn/i];
  for (const re of order) {
    const i = labels.findIndex((l) => re.test(l));
    if (i >= 0) {
      await buttons.nth(i).click();
      return 'menu';
    }
  }
  if (labels.length > 0) {
    await buttons.first().click();
    return 'menu';
  }
  return null;
}
