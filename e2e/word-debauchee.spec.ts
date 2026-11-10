// Plan §20 acceptance: a guest opens Word Debauchee, sets up a game against
// three AI seats with themselves as the first debauchee, and plays it to the
// end screen. As the debauchee they keep a word, hide a clue, answer in their
// own words when a judgment clue is played, and pick each letter to lay down;
// as a guesser they pick a key and a spot and press Place, now and then a
// tile in the middle of a row or Reveal!. Every move is a press on the
// screen. WD_SHOTS=<dir> saves a screenshot of each kind of decision.

import { test, expect, type Page } from '@playwright/test';

const shots = process.env['WD_SHOTS'];
const shot = new Set<string>();
async function snap(page: Page, name: string) {
  if (!shots || shot.has(name)) return;
  shot.add(name);
  await page.screenshot({ path: `${shots}/${name}.png` });
}

type Did = 'word' | 'clues' | 'answer' | 'reveal' | 'place' | 'middle' | 'callReveal' | 'first' | null;

async function step(page: Page, n: number): Promise<Did> {
  const scr = page.locator('.wd-screen');
  const btn = (name: string | RegExp) => scr.getByRole('button', { name, exact: typeof name === 'string' });
  if (await scr.getByRole('heading', { name: 'Who goes first?' }).isVisible()) {
    await snap(page, '00-first');
    await btn('You').click(); return 'first';
  }
  if (await scr.getByRole('heading', { name: 'Keep one word' }).isVisible()) {
    await snap(page, '01-keep-a-word');
    await scr.locator('.wd-wordcard:not(:disabled)').first().click(); return 'word';
  }
  if (await scr.getByRole('heading', { name: 'Play three clues' }).isVisible()) {
    await snap(page, '02-play-clues');
    const picks = scr.locator('.wd-pick:not(:disabled)');
    await picks.last().click();
    await snap(page, '03-clue-hidden');
    await btn('Play these three').click(); return 'clues';
  }
  if (await scr.getByLabel('Your answer').isVisible()) {
    await snap(page, '04-answer');
    await scr.getByLabel('Your answer').fill('posh');
    await btn('Say this').click();
    // A refused answer (it is on the synonym list) leaves the card's answer.
    await page.waitForTimeout(400);
    if (await scr.getByLabel('Your answer').isVisible()) await btn(/Use the card's answer/).click();
    return 'answer';
  }
  if (await scr.getByRole('heading', { name: 'Lay down one letter' }).isVisible()) {
    await snap(page, '05-lay-down');
    await scr.locator('.wd-tile.pick:not(:disabled)').first().click();
    const from = btn(/^From /);
    if (await from.first().isVisible().catch(() => false)) await from.first().click();
    return 'reveal';
  }
  // A guesser's turn.
  const keys = scr.locator('.wd-key:not(:disabled)');
  if (await keys.count()) {
    await snap(page, '06-guesser-turn');
    if (n % 7 === 6 && await btn('Reveal!').isVisible()) { await btn('Reveal!').click(); return 'callReveal'; }
    // Vowels and common letters, so words now and then come close.
    const common = 'EARIOTNSLC';
    const letter = common[n % common.length]!;
    const k = scr.locator(`.wd-key[data-key="${letter}"]:not(:disabled)`);
    await (await k.count() ? k : keys.first()).click();
    const rows = scr.locator('.wd-build .wd-row[data-row]');
    let middle = false;
    if (await rows.count() && n % 3 !== 0) {
      const r = rows.nth(n % (await rows.count()));
      const gaps = r.locator('.wd-gap:not(:disabled)');
      const g = await gaps.count();
      if (g) { middle = g > 2 && n % 2 === 0; await gaps.nth(middle ? 1 : g - 1).click(); }
    }
    await snap(page, middle ? '08-holding-middle' : '07-holding');
    await btn('Place').click();
    return middle ? 'middle' : 'place';
  }
  return null;
}

test('a guest plays Word Debauchee against three AI seats to the end screen', async ({ page }) => {
  test.setTimeout(Number(process.env['WD_TIMEOUT'] ?? 30 * 60_000));
  // Every byte the table sends this browser, in order, for the privacy check at the end.
  const received: string[] = [];
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { if (typeof f.payload === 'string') received.push(f.payload); }));
  page.on('response', async (res) => { if (res.url().includes('/socket.io/') || res.url().includes('/api/tables/')) received.push(await res.text().catch(() => '')); });
  await page.goto('/games/word-debauchee');
  await expect(page.getByRole('heading', { name: 'Word Debauchee', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Play now' }).click();

  // Four players: you and three AI seats.
  const more = page.getByRole('button', { name: 'More players' });
  while ((await page.locator('.seat-card').count()) < 4) await more.click();
  // The game's own choices, nothing preselected.
  for (const g of ['The House', 'Who goes first', 'Bribe', 'Open hand']) {
    expect(await page.getByRole('group', { name: g }).getByRole('radio', { checked: true }).count(), g).toBe(0);
  }
  await page.getByRole('group', { name: 'The House' }).getByLabel('Off').check();
  await page.getByRole('group', { name: 'Who goes first' }).getByLabel('You').check();
  await page.getByRole('group', { name: 'Bribe' }).getByLabel('On').check();
  await page.getByRole('group', { name: 'Open hand' }).getByLabel('Off').check();
  await snap(page, 'setup');
  await page.getByRole('button', { name: /^Start/ }).click();

  await expect(page).toHaveURL(/\/table\//);
  await expect(page.locator('.table-shell .wd-screen')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: '2×' }).click();
  await settings.getByRole('button', { name: 'Close' }).click();

  const did: Record<string, number> = {};
  let watched = false;
  let resulted = false;
  for (let i = 0; i < 6000; i++) {
    if (await page.getByRole('dialog', { name: 'Game over' }).isVisible()) break;
    // A refused move (an answer the clue does not allow) shows a notice; read it and go on.
    const ok = page.getByRole('button', { name: 'OK', exact: true });
    if (await ok.isVisible()) { await snap(page, '11-refused'); await ok.click(); }
    if (!resulted && await page.locator('.wd-card[aria-label$="result"]').isVisible()) { await snap(page, '09-round-result'); resulted = true; }
    if (await page.locator('.turn-pill.mine').isVisible()) {
      const d = await step(page, i);
      if (d) { did[d] = (did[d] ?? 0) + 1; await page.waitForTimeout(150); continue; }
    } else if (!watched && await page.getByText('Say nothing. You can smirk.').isVisible()) {
      await snap(page, '10-watching'); watched = true;
    }
    await page.waitForTimeout(250);
  }
  await expect(page.getByRole('dialog', { name: 'Game over' })).toBeVisible();
  await snap(page, '12-game-over');
  await page.getByRole('button', { name: 'Look at the final table' }).click();
  await snap(page, '13-final-table');
  // A guesser's browser never receives the secret word before the round's
  // result does: not in a view, a legal move, a summary or the log.
  const results = [...new Set(received.flatMap((t) => [...t.matchAll(/"debauchee":"(p\d+)","word":"([A-Z]+)","outcome"/g)].map((m) => `${m[1]}:${m[2]}`)))];
  let checked = 0;
  for (const r of results) {
    const [deb, word] = r.split(':') as [string, string];
    if (deb === 'p1') continue;
    const first = received.findIndex((t) => t.includes(`"debauchee":"${deb}","word":"${word}","outcome"`));
    const alone = new RegExp(`(^|[^A-Za-z])${word}([^A-Za-z]|$)`);
    const early = received.slice(0, first).findIndex((t) => alone.test(t));
    expect(early, `${word} reached the guesser before its round ended`).toBe(-1);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
  // Every kind of press happened along the way.
  for (const k of ['word', 'clues', 'reveal', 'place']) expect(did[k] ?? 0, k).toBeGreaterThan(0);
  // eslint-disable-next-line no-console
  console.log('presses', did);
});
