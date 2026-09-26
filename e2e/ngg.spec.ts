// Neither Guts nor Gears against one AI, from the setup page into the first
// round. The factions are the host's to choose on the setup page; the Leader
// draft and the starting site are the player's own picks at the table, each a
// tap and then a press, with nothing chosen for them; then the first planning
// decision. The table draws its own screen: the map, the action stack, the
// faction board strip.
// Needs the full stack (engine + server on BASE_URL).

import { test, expect, type Page } from '@playwright/test';

const panel = (page: Page) => page.locator('.ngg-column');

async function yourMove(page: Page) {
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 60_000 });
}

test('NGnG: factions on the setup page, the draft and the start at the table, then planning', async ({ page }) => {
  await page.goto('/games/neither-guts-nor-gears/setup');
  await expect(page.getByRole('heading', { name: 'Set up the table' })).toBeVisible();

  const start = page.getByRole('button', { name: 'Start the game' });
  await expect(start).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Your faction' }).getByRole('radio', { checked: true })).toHaveCount(0);
  await page.getByRole('group', { name: 'Your faction' }).getByRole('radio', { name: /^The Covenant/ }).check();
  await page.getByRole('group', { name: /Seat 2's faction/ }).getByRole('radio', { name: /^The Foundry/ }).check();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page).toHaveURL(/\/table\//, { timeout: 20_000 });

  // The table is NGnG's own screen, not the bench layout.
  await expect(page.locator('.ngg-root')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.ngg-hex').first()).toBeVisible();
  await expect(page.locator('.ngg-strip')).toContainText('The Covenant');

  // The Leader draft, if it is ours first; otherwise the AI drafts and we wait.
  await yourMove(page);
  if (await panel(page).getByText('Draft your Leader').isVisible()) {
    const take = panel(page).getByRole('button', { name: /^Take/ });
    // Nothing is chosen until the player taps a hero.
    await expect(take).toBeDisabled();
    await panel(page).getByRole('button', { name: /Archmage Chaimidious/ }).click();
    await expect(take).toBeEnabled();
    await take.click();
    // Chaimidious grants a battle card, which waits for the Draw button: the
    // screen says what the draw is for and nothing is dealt until it is pressed.
    await expect(panel(page)).toContainText(/Draw a battle card|starting site|Tap a numbered site/i, { timeout: 60_000 });
    if (await panel(page).getByText('Draw a battle card').isVisible()) {
      await expect(page.locator('.ngg-strip')).toContainText('No battle cards');
      await page.getByRole('button', { name: 'Draw', exact: true }).click();
      await expect(page.locator('.ngg-strip')).not.toContainText('No battle cards', { timeout: 30_000 });
    }
  }

  // The starting site: a numbered site on the map or in the list.
  await yourMove(page);
  await expect(panel(page)).toContainText(/starting site|Tap a numbered site/i, { timeout: 30_000 });
  const site = panel(page).getByRole('button', { name: /Site \d · / }).first();
  await site.click();
  await panel(page).getByRole('button', { name: /^Start at site \d/ }).click();

  // Into the round: sooner or later a planning decision is ours.
  await yourMove(page);
  await expect(panel(page)).toContainText(/Place one card, or pass|Draw|Reallocate Cores/i, { timeout: 60_000 });
  await expect(page.locator('.ngg-root')).toBeVisible();

  // Then play on through the screens alone — never the numbered menu — and
  // the engine never has to refuse a move a screen sent.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const seen = new Set<string>();
  const notices: string[] = [];
  for (let step = 0; step < 120; step++) {
    if (await page.getByRole('dialog', { name: 'Game over' }).isVisible()) break;
    await expect(page.locator('.turn-pill')).toHaveText(/^(Your move|Game over)/, { timeout: 90_000 });
    if (await page.getByRole('dialog', { name: 'Game over' }).isVisible()) break;
    // What happened that this seat must acknowledge: read it, then OK.
    const notice = page.getByRole('alertdialog', { name: 'What happened' });
    if (await notice.isVisible()) {
      notices.push(...(await notice.locator('li').allInnerTexts()));
      await notice.getByRole('button', { name: 'OK' }).click();
      continue;
    }
    await pressWhatTheScreenOffers(page, seen);
    await expect(page.getByRole('alert')).toHaveCount(0);
  }
  console.log('NOTICES', JSON.stringify(notices));
  expect(errors).toEqual([]);
  // Several different decisions were met and answered on their own screens,
  // and at least one purchase was paid by placing a collector on a tile the
  // engine named in answer to the reach question.
  expect(seen.size).toBeGreaterThan(3);
  expect(seen.has('placed a collector')).toBe(true);
});

/**
 * One decision, answered the way a person would: a Draw button when one is
 * up, an out-of-turn answer when one is asked, else the first open option
 * and the screen's own primary button. Each press is a real click.
 */
async function pressWhatTheScreenOffers(page: Page, seen: Set<string>) {
  const title = (await panel(page).locator('.ngg-panel-title').first().textContent().catch(() => null)) ?? '';
  seen.add(title.replace(/\d+/g, '#'));
  const layer = page.locator('.ngg-interrupt');
  if (await layer.isVisible()) {
    // The layer can close under the press when the answer lands; that is fine.
    await layer.locator('.ngg-btn:enabled').last().click({ timeout: 5_000 }).catch(() => {});
    return;
  }
  const draw = panel(page).getByRole('button', { name: 'Draw', exact: true });
  if (await draw.isVisible()) { await draw.click(); return; }
  // Walk a composer: pick an open option, then press the primary, until the
  // turn passes. A composer may take a few presses (choose, pay, place).
  for (let i = 0; i < 16; i++) {
    if (!(await page.locator('.turn-pill').textContent())?.startsWith('Your move')) return;
    // A payment that cannot be finished by hand: take it all back and use the
    // engine's own proposal (one press, the person's choice).
    const commit = panel(page).getByRole('button', { name: /^Commit payment|^Commit all eleven/ });
    const noTake = (await panel(page).locator('button.ngg-eco-take:enabled').count()) === 0;
    if (await commit.isVisible() && await commit.isDisabled() && noTake) {
      const back = panel(page).getByRole('button', { name: /^Take back/ }).first();
      if (await back.isVisible()) { await back.click({ timeout: 5_000 }).catch(() => {}); await page.waitForTimeout(300); }
      const proposal = panel(page).getByRole('button', { name: 'Use the engine’s proposal' });
      if (await proposal.isVisible()) { await proposal.click({ timeout: 5_000 }).catch(() => {}); await page.waitForTimeout(500); }
    }
    // Planning: put an action card on the stack rather than passing.
    const card = panel(page).locator('button.ngr-plan-card:enabled').first();
    if (await card.isVisible()) { await card.click({ timeout: 5_000 }).catch(() => {}); seen.add('placed a card'); continue; }
    // Paying: take a collector from hand, then a lit hex the engine named.
    const take = panel(page).locator('button.ngg-eco-take:enabled:not(.held)').first();
    if (await take.isVisible()) await take.click({ timeout: 5_000 }).catch(() => {});
    if (await page.locator('.ngg-eco-take.held').isVisible()) {
      const hex = page.locator('button.ngg-hex').first();
      if (await hex.isVisible()) { await hex.click({ timeout: 5_000 }).catch(() => {}); seen.add('placed a collector'); }
    }
    const option = panel(page).locator('button.ngg-option:enabled:not(.selected)').first();
    if (await option.isVisible()) await option.click({ timeout: 5_000 }).catch(() => {});
    const lit = page.locator('button.ngg-hex').first();
    const primary = panel(page).locator('.ngg-btn.primary:enabled').first();
    if (await primary.isVisible()) {
      await primary.click({ timeout: 5_000 }).catch(() => {});
    } else if (await lit.isVisible()) {
      await lit.click({ timeout: 5_000 }).catch(() => {});
    } else {
      const secondary = panel(page).locator('.ngg-btn.secondary:enabled').first();
      if (await secondary.isVisible()) await secondary.click({ timeout: 5_000 }).catch(() => {});
      else return;
    }
    await page.waitForTimeout(300);
  }
}
