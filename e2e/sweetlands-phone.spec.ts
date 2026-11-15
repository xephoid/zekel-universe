// The Sweetlands phone (docs/games/sweetlands-phone-build.md): at 390 x 844
// the table is one column with the board always in view, nothing wider than
// the screen, and the top bar on one line (the three findings of the mobile
// audit, 2026-11-12). The menu holds the players and how to play and stops
// under the board; zoom by land; a card's choices are a grid of 44 px buttons
// in the engine's own words; a move sent from the phone lands.
// Set SHOTS_DIR to keep a screenshot of each step.
//
// The board's window is `.sl-board-fit`: fitted to the column, it clips the
// zoomed board and carries `data-zoom`. `.sl-board-frame` is the board itself
// inside it, twice the window's size while zoomed.

import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

async function shot(page: Page, name: string): Promise<void> {
  if (!process.env.SHOTS_DIR) return;
  await page.waitForTimeout(500); // let a sheet finish rising, a zoom finish sliding
  await page.screenshot({ path: `${process.env.SHOTS_DIR}/sweetlands-${name}.png` });
}

/** The page never scrolls, and nothing pokes past the right edge. */
async function expectFits(page: Page): Promise<void> {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const zoomed = document.querySelector('.sl-board-fit');
    const past = [...document.querySelectorAll('.table-shell *')].filter((el) => {
      if (zoomed && zoomed !== el && zoomed.contains(el)) return false; // the zoomed board is clipped by its frame
      const r = el.getBoundingClientRect();
      return r.width > 0 && getComputedStyle(el).visibility !== 'hidden' && r.right > innerWidth + 0.5;
    }).length;
    return { down: doc.scrollHeight - innerHeight, across: doc.scrollWidth - innerWidth, past };
  });
  expect(m).toEqual({ down: 0, across: 0, past: 0 });
}

/** The board is on screen and nothing is drawn over it: five points of it answer to the board. */
async function expectBoardInView(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const frame = document.querySelector('.sl-board-fit')!;
    const b = frame.getBoundingClientRect();
    const hits = [[0.5, 0.5], [0.12, 0.15], [0.88, 0.15], [0.12, 0.85], [0.88, 0.85]].filter(([x, y]) => {
      const el = document.elementFromPoint(b.left + b.width * x!, b.top + b.height * y!);
      return !!el && frame.contains(el);
    }).length;
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, hits };
  });
  expect(r.top).toBeGreaterThanOrEqual(0);
  expect(r.left).toBeGreaterThanOrEqual(0);
  expect(r.right).toBeLessThanOrEqual(390);
  expect(r.bottom).toBeLessThanOrEqual(844);
  expect(r.hits).toBe(5);
}

/** The top bar is one line: 54 px tall plus its border, every part on one line. */
async function expectTopBarOneLine(page: Page): Promise<void> {
  const bar = page.locator('.table-topbar');
  const box = await bar.boundingBox();
  expect(box!.height).toBeLessThanOrEqual(58);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  for (const part of [bar.locator('.title'), bar.locator('.round-tag'), bar.locator('.turn-pill')]) {
    await expect(part).toBeVisible();
    // how many lines its text sits on: the distinct tops of the text's boxes
    // (text only: a dot or a wrapper span inside the part has a box of its own
    // that starts a few px lower on the same line)
    const lines = await part.evaluate((el) => {
      const tops = new Set<number>();
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top));
      }
      return tops.size;
    });
    expect(lines).toBe(1);
  }
}

/** Every control the person presses is at least 44 px, except the marks and pieces on the board. */
async function expectTouchTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.table-topbar button, .table-topbar a, .sl-screen button, .menu-sheet button, .menu-sheet a')]
      .filter((el) => !el.closest('.sl-board-fit'))
      // half a pixel of slack: a sheet still sliding up has a fractional
      // transform, and a 44 px row then measures 43.9999
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && Math.min(r.width, r.height) < 43.5; })
      .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)));
  expect(small).toEqual([]);
}

test('Sweetlands on a phone: the board stays in view, nothing runs off the edge, the top bar is one line', async ({ page }) => {
  // Setup, as on desktop (e2e/sweetlands.spec.ts): every choice is the player's.
  await page.goto('/games/sweetlands-imperium/setup');
  await page.getByRole('group', { name: 'Your faction' }).getByRole('radio', { name: 'Grand Vizier Cheesecake' }).check();
  await page.getByRole('group', { name: /Seat 2's faction/ }).getByRole('radio', { name: 'Princess Jellybean' }).check();
  await page.getByRole('group', { name: 'The castle foe' }).getByRole('radio', { name: 'Orc' }).check();
  await page.getByRole('button', { name: 'Start the game' }).click();
  await expect(page).toHaveURL(/\/table\//, { timeout: 20_000 });
  await expect(page.locator('.turn-pill')).toHaveText(/^Your move/, { timeout: 30_000 });

  // The How to play page opens by itself the first time, fits the width, and closes.
  const howTo = page.getByRole('dialog', { name: 'How to play Sweetlands Imperium' });
  await expect(howTo).toBeVisible();
  await expectFits(page);
  await shot(page, '0-how-to-play');
  await howTo.getByRole('button', { name: 'Got it, let’s play' }).click();
  await expect(howTo).toBeHidden();

  // The phone layout: one column, no side column, the top bar's buttons behind the menu.
  await expect(page.locator('.table-shell.phone.sl-theme .sl-screen.phone')).toBeVisible();
  await expect(page.locator('.table-side')).toBeHidden();
  await expect(page.locator('.table-topbar').getByRole('button', { name: 'Undo', exact: true })).toBeHidden();
  await expect(page.locator('.table-topbar .title')).toHaveText('Sweetlands');
  // Still setting up (choosing the secret goal): the round chip says so, as
  // the build file's item 1 asks; it reads "R1" once play starts (checked at the end).
  await expect(page.locator('.table-topbar .round-tag')).toHaveText('Setup');
  await expectTopBarOneLine(page);
  await expectFits(page);
  await expectBoardInView(page);
  await expectTouchTargets(page);
  await shot(page, '1-table');

  // Zoom by land: five buttons in one row inside the screen; a land zooms, All zooms out.
  const zoom = page.getByRole('group', { name: 'Zoom the board' });
  await expect(zoom.getByRole('button')).toHaveCount(5);
  const frame = page.locator('.sl-board-fit');
  await zoom.getByRole('button', { name: /Jellybean/ }).click();
  await expect(frame).toHaveAttribute('data-zoom', '3');
  await expectBoardInView(page);
  await expectFits(page);
  await shot(page, '2-zoomed');
  await zoom.getByRole('button', { name: 'All' }).click();
  await expect(frame).toHaveAttribute('data-zoom', 'all');

  // The menu holds the players, how to play and the table's buttons, and stops under the board.
  await page.getByRole('button', { name: /^Menu/ }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Players', exact: true })).toBeVisible();
  await expect(menu.getByRole('button', { name: 'How to play', exact: true })).toBeVisible();
  for (const name of ['Undo', 'Rules', 'Settings', 'Share']) await expect(menu.getByRole('button', { name, exact: true })).toBeAttached();
  await expect(menu.getByRole('link', { name: 'Leave the table' })).toBeAttached();
  await expect(menu.getByRole('region', { name: 'You, Grand Vizier Cheesecake' })).toBeVisible();
  await expectBoardInView(page);
  await expectFits(page);
  await expectTouchTargets(page);
  await shot(page, '3-menu-players');

  // Find a piece: the board zooms to its land and rings it, with the menu still open.
  await menu.getByRole('region', { name: 'You, Grand Vizier Cheesecake' }).getByRole('button', { name: /Find/ }).first().click();
  await expect(frame).not.toHaveAttribute('data-zoom', 'all');
  await expect(page.locator('.sl-board-frame .sl-piece.focused')).toHaveCount(1);
  await expect(menu).toBeVisible();
  await expectBoardInView(page);

  // How to play: the color guide, six rows.
  await menu.getByRole('button', { name: 'How to play', exact: true }).click();
  await expect(menu.locator('.sl-guide-name')).toHaveCount(6);
  await shot(page, '4-menu-how-to-play');
  await menu.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(menu).toBeHidden();

  // The score chips open the menu on the Players tab.
  await page.getByRole('button', { name: /^Scores/ }).click();
  await expect(page.getByRole('dialog', { name: 'Menu' }).getByRole('region', { name: 'You, Grand Vizier Cheesecake' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByRole('group', { name: 'Zoom the board' }).getByRole('button', { name: 'All' }).click();

  // Setup steps and the turn's first steps, through the turn panel, until a card can be played.
  const now = page.getByRole('region', { name: 'What to do now' });
  await expect(now.getByRole('heading', { name: 'Keep one secret goal' })).toBeVisible({ timeout: 30_000 });
  await expectBoardInView(page);
  await now.locator('.sl-quiet-choice').first().click();
  await expect(now.getByRole('heading', { name: 'Draw your Intel' })).toBeVisible({ timeout: 30_000 });
  await now.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(page.locator('.sl-card')).toHaveCount(3, { timeout: 30_000 });
  for (let i = 0; i < 6; i++) {
    const title = (await now.locator('h2').first().textContent({ timeout: 30_000 })) ?? '';
    if (/Play one card/.test(title)) break;
    if (/^Recall/.test(title)) await now.getByRole('button', { name: /Skip recall/ }).click();
    else if (/Draw your Intel/.test(title)) await now.getByRole('button', { name: 'Draw', exact: true }).click();
    await expect(now.locator('h2').first()).not.toHaveText(title, { timeout: 30_000 });
  }
  await expect(now.getByRole('heading', { name: 'Play one card' })).toBeVisible({ timeout: 30_000 });
  await expectFits(page);
  await expectBoardInView(page);
  await shot(page, '5-play-one-card');

  // Pick a card: the choices are a grid of 44 px buttons in the engine's words, numbered on the board too.
  const hand = await page.locator('.sl-card').count();
  // Not a green card while another is playable: the engine lists "move and take
  // the green action" but plays it as "discard for unlimited plays, no move",
  // so the turn would stay on "Play one card" (a zekel-games engine issue).
  const notGreen = page.locator('.sl-card.playable:not([aria-label^="Green"])');
  const card = (await notGreen.count()) > 0 ? notGreen.first() : page.locator('.sl-card.playable').first();
  const green = /^Green/.test((await card.getAttribute('aria-label')) ?? '');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  const options = now.locator('.sl-option');
  expect(await options.count()).toBeGreaterThan(0);
  for (const box of await options.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.right).toBeLessThanOrEqual(390);
  }
  await expect(options.first()).toHaveAccessibleName(/(Play|Use) /); // the engine's own sentence, whole
  expect(await page.locator('.sl-mark-n').count()).toBeGreaterThan(0);
  await expectBoardInView(page);
  await expectFits(page);
  await expectTouchTargets(page);
  await shot(page, '6-card-picked');

  // A choice zooms the board to where the piece lands; the main button sends the move, and it lands.
  await options.first().click();
  await expect(page.locator('.sl-mark.chosen')).toHaveCount(1);
  await expectBoardInView(page);
  await shot(page, '7-choice');
  await now.locator('.sl-main-btn').first().click();
  await expect(page.locator('.sl-card')).not.toHaveCount(hand, { timeout: 30_000 });
  if (!green) {
    await expect(now.getByRole('heading', { name: 'Play one card' })).toBeHidden({ timeout: 30_000 });
  }
  await expect(page.locator('.table-topbar .round-tag')).toHaveText(/^R\d+$/);
  await expectTopBarOneLine(page);
  await expectFits(page);
  await expectBoardInView(page);
  await shot(page, '8-after-move');
});
