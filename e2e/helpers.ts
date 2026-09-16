// Shared helpers for the browser specs. Not a spec file: Playwright refuses
// imports between spec files.

import { expect, type APIRequestContext } from '@playwright/test';

/** The most recent sign-in link mailed to an address, from the test outbox. */
export async function readSignInLink(request: APIRequestContext, email: string): Promise<string> {
  let link = '';
  await expect(async () => {
    const res = await request.get('/api/test/outbox');
    expect(res.ok()).toBeTruthy();
    const { mails } = (await res.json()) as { mails: { to: string; text: string }[] };
    const mail = mails.filter((m) => m.to === email).pop();
    expect(mail, `a sign-in mail for ${email}`).toBeTruthy();
    const match = /https?:\/\/\S+/.exec(mail!.text);
    expect(match).toBeTruthy();
    link = match![0];
  }).toPass({ timeout: 10_000 });
  return link;
}

/** The emailed URL points at APP_ORIGIN, which may differ from BASE_URL in
 *  a test rig; keep the path and the fragment, rewrite the origin. */
export function toBase(link: string, base: string): string {
  const url = new URL(link);
  const b = new URL(base);
  return `${b.origin}${url.pathname}${url.search}${url.hash}`;
}
