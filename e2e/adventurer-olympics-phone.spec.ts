// The phone pass's acceptance (docs/games/adventurer-olympics-phone-build.md):
// at 390 x 844 the table keeps the map in view, the top bar is one line, the
// side column is gone, the adventurer sheet and the menu open and close and
// hold what the side column held, a test plays in a sheet with the map still
// in view above it, exploring plays in its short sheet, and every control is
// at least 44 px tall. Set SHOTS_DIR to keep a screenshot of each.

import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function shot(page: Page, name: string): Promise<void> {
  if (!process.env.SHOTS_DIR) return;
  await page.waitForTimeout(500); // let a sheet finish rising
  await page.screenshot({ path: `${process.env.SHOTS_DIR}/ao-${name}.png` });
}

/** The page does not scroll, down or across. */
async function expectNoScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    return { down: doc.scrollHeight - innerHeight, across: doc.scrollWidth - innerWidth };
  });
  expect(m).toEqual({ down: 0, across: 0 });
}

/** Every visible button, tab and link on the table is at least 44 px tall (the map's hexes are checked on their own). */
async function expectTouchTargets(page: Page): Promise<void> {
  const short = await page.evaluate(() => [...document.querySelectorAll('.table-shell :is(button, a, [role="tab"])')]
    .filter((el) => !el.closest('.zk-hexmap'))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ el, r }) => r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && r.height < 44)
    .map(({ el, r }) => `${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)} (${Math.round(r.height)} px)`));
  expect(short).toEqual([]);
}

/** The map is in view and at least this tall. */
async function expectMap(page: Page, minHeight: number): Promise<void> {
  const map = page.locator('.ao-screen.phone .zk-hexmap');
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(minHeight);
  expect(box!.y).toBeLessThan(844 - minHeight);
}

/**
 * A sheet rising: the map eases to its new height rather than snapping. The
 * sheet's own animation is held at its start and at its end (deterministic,
 * no timing), and the map is measured at each.
 */
async function expectMapEases(page: Page): Promise<void> {
  const h = await page.evaluate(() => {
    const sheet = document.querySelector('.ao-screen.phone .ao-phone-sheet') as HTMLElement | null;
    const map = document.querySelector('.ao-screen.phone .zk-hexmap') as HTMLElement | null;
    if (!sheet || !map) return null;
    const anim = sheet.getAnimations()[0];
    if (!anim) return { none: true };
    anim.pause();
    anim.currentTime = 0;
    const start = map.getBoundingClientRect().height;
    anim.finish();
    const end = map.getBoundingClientRect().height;
    return { start, end };
  });
  expect(h).not.toBeNull();
  expect(h).not.toHaveProperty('none');
  const { start, end } = h as { start: number; end: number };
  expect(start - end).toBeGreaterThan(40);
}

/** Every glowing slot can be reached: scrolled into the map's view, it lies inside the map. */
async function expectSlotsReachable(page: Page): Promise<void> {
  const slots = page.locator('.ao-screen.phone .zk-hex.ghost.zk-lit');
  const map = page.locator('.ao-screen.phone .zk-hexmap');
  for (let i = 0; i < await slots.count(); i++) {
    await slots.nth(i).scrollIntoViewIfNeeded();
    const s = (await slots.nth(i).boundingBox())!;
    const m = (await map.boundingBox())!;
    expect(s.y + s.height / 2).toBeGreaterThanOrEqual(m.y);
    expect(s.y + s.height / 2).toBeLessThanOrEqual(m.y + m.height);
    expect(s.x + s.width / 2).toBeGreaterThanOrEqual(m.x);
    expect(s.x + s.width / 2).toBeLessThanOrEqual(m.x + m.width);
    expect(s.height).toBeGreaterThanOrEqual(44);
  }
}

type Did = 'draw' | 'roll' | 'place' | 'slot' | 'step' | 'button' | null;

/** One press, as a person would make it; the same order as the desktop spec. */
async function takeTurnStep(page: Page, seen: Set<string>): Promise<Did> {
  const scr = page.locator('.ao-screen.phone');
  const button = (name: string | RegExp) => scr.getByRole('button', { name, exact: typeof name === 'string' });
  const test = page.getByRole('region', { name: 'The test', exact: true });
  // Draw and Roll are pressed only when they are there. "Roll 2 dice" is also
  // the roll for turn order, so look at which sheet is up, not at the label.
  for (const [name, did] of [[/^Draw a card$/, 'draw'], [/^Turn over a tile$/, 'draw'], [/^Roll \d (die|dice)$/, 'roll']] as const) {
    if (await button(name).isVisible()) {
      if (await test.isVisible()) {
        // A test: the sheet is up, the map is still in view above it.
        await expectMap(page, 200);
        const sheet = await test.boundingBox();
        const map = await page.locator('.ao-screen.phone .zk-hexmap').boundingBox();
        expect(sheet!.y).toBeGreaterThanOrEqual(map!.y + 200);
        if (!seen.has('test')) { seen.add('test'); await expectTouchTargets(page); await expectNoScroll(page); await shot(page, '3-test'); }
      }
      await button(name).click();
      return did;
    }
  }
  if (await button('Place tile').isVisible()) {
    if (!seen.has('turn')) { seen.add('turn'); await expectMap(page, 300); await expectTouchTargets(page); await expectNoScroll(page); await shot(page, '5-explore-turn'); }
    await button('Place tile').click();
    seen.add('place');
    return 'place';
  }
  const slot = page.locator('.zk-hex.ghost.zk-lit');
  if (await slot.count()) {
    // Exploring: the short sheet is up and the slots are on the map, in view.
    await expect(page.getByRole('region', { name: 'Exploring' })).toBeVisible();
    await expectMap(page, 300);
    await expect(slot.first()).toBeInViewport();
    if (!seen.has('slot')) { seen.add('slot'); await expectSlotsReachable(page); await expectTouchTargets(page); await expectNoScroll(page); await shot(page, '4-explore-slot'); }
    await slot.first().click();
    return 'slot';
  }
  const take = page.locator('.ao-option');
  if (await take.count()) {
    if (!seen.has('rune')) { seen.add('rune'); await expectTouchTargets(page); await expectNoScroll(page); }
    await take.first().click();
    return 'button';
  }
  for (const name of [/^Explore/, /^Stay and try again$/]) {
    const b = button(name);
    if (await b.isVisible() && await b.isEnabled()) { await b.click(); return 'button'; }
  }
  // No random choice: step onto an icon when one is lit (it starts a test), else the first lit hex.
  const icon = page.locator('.zk-hex.zk-lit.has-art:not(.ghost)');
  const step = (await icon.count()) ? icon : page.locator('.zk-hex.zk-lit:not(.ghost)');
  if (await step.count()) {
    const target = step.first();
    const box = await target.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44); // a hex you can step onto is a touch target
    await target.click();
    return 'step';
  }
  for (const name of [/^End turn$/, /^Do nothing this turn$/, /^No thanks, draw again$/]) {
    const b = button(name);
    if (await b.isVisible() && await b.isEnabled()) { await b.click(); return 'button'; }
  }
  return null;
}

test('Adventurer Olympics on a phone: the map in view, the sheets, a test and exploring', async ({ page }) => {
  await page.goto('/games/adventurer-olympics');
  await page.getByRole('link', { name: 'Play now' }).click();
  await page.getByRole('group', { name: 'Your adventurer' }).getByLabel('Fighter').check();
  await page.getByRole('group', { name: 'Your colour' }).getByLabel('Red').check();
  await page.getByRole('button', { name: /^Start/ }).click();
  await expect(page).toHaveURL(/\/table\//);
  await expect(page.locator('.table-shell.phone.ao-theme .ao-screen.phone')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/^Your (move|turn)/)).toBeVisible({ timeout: 60_000 });

  // The game opens with the roll for turn order, in its own sheet. Roll (a
  // press, as a person would) until the first turn with End turn, which is
  // the resting layout Phone-Table draws. (Changed from the build guide's
  // spec, which checked the layout at the first "Your turn": see
  // docs/implementation-plan.md §18, "The phone".)
  const order = page.getByRole('region', { name: 'Who goes first' });
  if (await order.isVisible()) {
    // The first sheet: the map eases to the height above it; its controls are touch targets.
    await expectMapEases(page);
    await expectTouchTargets(page);
    await expectNoScroll(page);
  }
  const endTurn = page.locator('.ao-screen.phone').getByRole('button', { name: 'End turn', exact: true });
  for (let i = 0; i < 400 && !(await endTurn.isVisible() && await endTurn.isEnabled()); i++) {
    const roll = order.getByRole('button', { name: 'Roll 2 dice', exact: true });
    if (await roll.isVisible()) await roll.click();
    await page.waitForTimeout(300);
  }
  await expect(endTurn).toBeEnabled();

  // The phone layout: no side column, the top bar's buttons behind the menu,
  // the top bar on one line, the map in view, nothing scrolls.
  await expect(page.locator('.table-side')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeHidden();
  const bar = page.locator('.table-topbar');
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(60);
  expect(await bar.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
  await expect(bar.getByText(/^R\d+$/)).toBeVisible();
  await expectMap(page, 340);
  await expect(page.locator('.ao-strip')).toBeVisible();
  await expect(page.locator('.ao-screen.phone .ao-side, .ao-screen.phone .ao-side-inline')).toHaveCount(0);
  await expectNoScroll(page);
  await expectTouchTargets(page);
  await shot(page, '1-table');

  // The legend is behind Key; zoom is there.
  await page.getByRole('button', { name: 'Key', exact: true }).click();
  await expect(page.locator('.ao-legend')).toBeVisible();
  await page.getByRole('button', { name: 'Key', exact: true }).click();
  await expect(page.locator('.ao-legend')).toBeHidden();
  for (const name of ['Zoom in', 'Zoom out', 'Fit']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();

  // The adventurer sheet holds your board and the side column, in three tabs.
  await page.getByRole('button', { name: /^Your adventurer, companions and quests/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Your adventurer' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.ao-stat')).toHaveCount(3);
  await expect(sheet.getByText(/^Companions \d+/)).toBeVisible();
  await expectTouchTargets(page);
  await expectNoScroll(page);
  await shot(page, '2-sheet-you');
  // The tabs work from the keyboard too.
  await sheet.getByRole('tab', { name: 'You' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(sheet.getByRole('tab', { name: 'Everyone' })).toHaveAttribute('aria-selected', 'true');
  await expect(sheet.getByRole('tab', { name: 'Everyone' })).toBeFocused();
  // Tab stays in the sheet: off the selected tab it wraps to Close, and back;
  // a tab that is not selected is never a stop.
  await page.keyboard.press('Tab');
  await expect(sheet.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sheet.getByRole('tab', { name: 'Everyone' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(sheet.getByRole('tab', { name: 'You' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Shift+Tab');
  await expect(sheet.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sheet.getByRole('tab', { name: 'You' })).toBeFocused();
  await sheet.getByRole('tab', { name: 'Everyone' }).click();
  await expect(sheet.locator('.ao-order-strip')).toBeVisible();
  await expectTouchTargets(page);
  await expectNoScroll(page);
  await expect(sheet.locator('.ao-seat')).not.toHaveCount(0);
  await sheet.getByRole('tab', { name: 'Quests' }).click();
  await expect(sheet.locator('.ao-quest').first()).toBeVisible();
  await expectTouchTargets(page);
  await expectNoScroll(page);
  await sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(sheet).toBeHidden();

  // The menu holds what the top bar held, the last move and the log.
  await page.getByRole('button', { name: /^Menu/ }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  for (const name of ['Undo', 'Rules', 'Settings', 'Share']) await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
  await expectTouchTargets(page);
  await expectNoScroll(page);
  await expect(menu.getByRole('link', { name: 'Leave the table' })).toBeVisible();
  await menu.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(menu).toBeHidden();

  // Play until a test and a placed tile have both happened.
  const seen = new Set<string>();
  for (let i = 0; i < 800 && !(seen.has('test') && seen.has('place')); i++) {
    if (await page.getByRole('dialog', { name: 'Game over' }).isVisible()) break;
    if (await page.getByText(/^Your (move|turn)/).isVisible()) {
      const d = await takeTurnStep(page, seen);
      if (d) { await page.waitForTimeout(120); continue; }
    }
    await page.waitForTimeout(300);
  }
  expect(seen.has('test')).toBe(true);
  expect(seen.has('place')).toBe(true);

  // By now someone has moved: the menu shows the last move with pace and replay.
  await page.getByRole('button', { name: /^Menu/ }).click();
  const menu2 = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu2.getByRole('region', { name: 'Last move' })).toBeVisible();
  await shot(page, '6-menu');
  await menu2.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expectNoScroll(page);
});
