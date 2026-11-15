# Sweetlands Imperium on a phone — what to build

Started 2026-11-12. Written for whoever builds the Sweetlands Imperium table
on a phone. The design is the five `Phone-*` boards in
[`docs/design/sweetlands-candy/`](../design/sweetlands-candy/README.md); read
the README's "The phone boards" section first. Rules, spaces and counts come
only from [`sweetlands-imperium.md`](sweetlands-imperium.md), with the engine
over the rulebook. The desktop candy table is built
([`sweetlands-candy-theme-build.md`](sweetlands-candy-theme-build.md), items
1 to 9, and `docs/implementation-plan.md` section 19); this pass lays the same
screen out for a phone. It moves no rule and adds no move.

Nothing is built yet.

## Why

Sweetlands has no phone layout: `sweetlandsGlue` does not set
`GlueModule.phone`, so a phone gets the desktop table squeezed to 390 px. The
mobile audit of production on 2026-11-12 found three things wrong, and this
pass must fix all three:

1. **The turn panel covered the board**; only a sliver of the board showed
   at the left.
2. **The page ran off the right edge**: the "How to play" button and the
   "Your move" pill were cut off.
3. **The top bar's round label wrapped into the title.**

The checks for these three are written into the e2e spec at the end of this
file, and they are the acceptance check for the pass.

## Before anything else

1. **Read how the other phone tables were built**:
   `docs/implementation-plan.md` section 17, "The phone (build item 7)"
   (Fractured Fist, the shared phone frame) and the Cybernoir phone in
   `docs/games/cybernoir-2127-theme-build.md`, item 8. This pass reuses their
   machinery: `apps/web/src/table/phone.ts` (`usePhone`, narrower than
   640 px), `GlueModule.phone`, `GameScreenProps.phone`, `TablePlan.statusShort`
   and the `.table-shell.phone` rules at the end of `apps/web/src/app.css`.
2. **Open the five boards** at 390 × 844. `Phone-Table.dc.html` is
   clickable; the other four open on one moment each.
3. **Run the security playbook in change mode** for this change (application
   and test code), and record the report in `docs/security-reviews/`.

## Rules that apply to every item

- **The breakpoint is the existing one**: narrower than 640 px
  (`PHONE_QUERY` in `table/phone.ts`). Do not add a second test for "is this a
  phone". The phone layout applies only when the table passes `phone` to the
  screen; style it under `.table-shell.phone.sl-theme`, so desktop Sweetlands
  and every other game are untouched.
- **The board is always in view.** Nothing the game draws ever covers the
  board: not the turn panel, not a battle, not the menu. The one exception is
  the How to play page the first time a seat sits down (item 7).
- **Nothing is wider than the screen.** At 390 px the page never scrolls
  sideways and no part of the table pokes past the right edge. Only the
  zoomed board is wider than its frame, and the frame clips it.
- **The top bar is one line.**
- **Every control is at least 44 px** in its smaller dimension, except the
  marks and pieces drawn on the board itself; every move the board offers is
  also a 44 px button in the turn panel.
- **The engine decides, Universe draws**, as on the desktop table: choices,
  destinations (`landing`), dice (`last_battle`) and the sentences under the
  choices are the engine's. The boards' sample wording ("Battles Fudge's
  Knight", "Action does nothing") is a drawing, not text to copy.
- **Player agency**: which card, which piece, ring or road, take the action or
  not. Every one is asked; none is defaulted. Zooming never picks anything.
- **Nothing appears in place.** The zoom slides; sheets rise; pieces hop as on
  the desktop. Under reduced motion they fade, as the rest of the table does.
- **Where a board and the built desktop table disagree, the built table
  wins.** The README lists where: the engine's own sentences, a knight battle
  starting with the action's own button, the table's own turn pill and menu.

## What to build, in order

### 1. Opt in, and a top bar on one line

- `sweetlandsGlue.phone = true`, with a comment pointing at the boards.
- `plan()` returns `statusShort`: `R${round}` in play ("R4"), `Setup` during
  setup. The table already draws it as the round chip on a phone.
- **A short title.** "Sweetlands Imperium" beside the round chip, the pill and
  the menu button does not fit 390 px; the audit's wrap came from this. Add an
  optional `TablePlan.titleShort` to `@zekel/glue-kit` ("the title on a
  phone's top bar, when the full one does not fit"), have `Table.tsx` show it
  in place of `title` when `phone` is set, and return `titleShort:
  'Sweetlands'`. It is an optional field, so other games are unaffected;
  follow the package's versioning (it is `0.1.0`, publishable under `@zekel`).
- Keep the turn pill as the table's own label ("Your move", "Waiting on …",
  "The AI is thinking…"). Do not add `yourTurnLabel` for the boards' "Pick a
  piece" and "Battle!": those are the turn panel's step, and the glue cannot
  see what the screen has picked.
- Check the bar at 390 px: the title does not shrink or wrap; the pill is the
  part that gives way, with its ellipsis (already in `app.css`); the menu
  button is 44 × 44.

### 2. A place in the table's menu for the screen, and a way to open it

On a phone the table's menu sheet (`Table.tsx`, the `Sheet` titled "Menu")
already holds Undo, Rules, Settings, Share, the last move, the log and Leave.
The boards add the game's side column to it: a Players tab and a How to play
tab. Two small additions to `GameScreenProps` in `@zekel/glue-kit`, both
optional and both absent off a phone:

- `menuSlot?: HTMLElement | null`: a portal target at the top of the menu
  sheet, present only while the menu is open on a phone. `Table.tsx` renders
  `<div className="menu-game" ref={setMenuSlot} />` as the sheet's first
  child.
- `openMenu?: () => void`: opens the menu sheet, for the score chips.

**The menu sheet stops under the board** for Sweetlands, so the board stays
in view with the menu open (`Phone-Menu.dc.html`). `SlScreen` measures where
the board frame ends (a `ResizeObserver` on `.sl-board-frame`) and sets
`--sl-under-board` (in px from the top of the viewport) on the closest
`.table-shell`. In `sl.css`:

```css
.table-shell.phone.sl-theme .sheet-backdrop:has(> .menu-sheet) { top: var(--sl-under-board, 0px); }
.table-shell.phone.sl-theme .menu-sheet { max-height: 100%; }
```

Only the menu sheet does this. Rules and Settings, opened from the menu, are
reading sheets and may rise higher, as on Fractured Fist.

### 3. The screen in one column

`SlScreen` already gets `phone`. When it is set, render one column inside
`.sl-screen.phone`, top to bottom, as `Phone-Table.dc.html` draws it:

| Part | What it is | Notes |
|---|---|---|
| Score chips (`.sl-chips`) | one chip per seat: the faction's treat shape, "2/5", a five-segment striped bar | the whole row is one button, "Scores. Open the players", that calls `openMenu` on the Players tab; yours has the orange inner ring |
| Zoom buttons (`.sl-zoom`, a group named "Zoom the board") | five equal columns: "All", "Yours", then the other three lands by faction short name, each with its treat shape above the name | 46 px tall; `aria-pressed` on the current one; the current one is chocolate with white text |
| The board (`.sl-board-frame`) | the same `Board`, fitted to the column's width (364 × 286 at 390 px) inside the wafer frame | carries `data-zoom="all"` or the region number; never covered |
| The space under the board (`.sl-under`) | the turn panel, then the hand; or a battle; and the bottom of the menu sheet when it is open | fills what is left; only the turn panel scrolls, inside itself |

What leaves the column on a phone: the players panel (into the menu, item 6),
the color guide and the "How to play" button (into the menu's How to play
tab, item 6), and the step tracker's own row while a card is being chosen
(the panel's title says it then). The numbered move menu is left off, as on
Fractured Fist: every listed move is a button in the turn panel.

The shell is already `100dvh` on a phone. Use `min-width: 0` on every flex
and grid child of the column so long names shrink instead of widening the
page.

### 4. Zoom by land

The whole board fits, but its spaces are about 26 px. Zoom is a second
transform on the fitted board: `scale(2)` and a translation that puts the
land's middle in the middle of the frame, clamped so the frame never shows
past the board's edge. The land middles, in grid rows and columns as
`geometry.ts` counts them: region 1 (10.2, 7), region 2 (6.5, 11.6),
region 3 (2.2, 7), region 4 (6.5, 1.8). The castle belongs to no land.

- The zoom slides (`transform` over about 350 ms); under reduced motion it
  jumps.
- It zooms by itself when a choice is picked (to the land of the choice's
  `landing.to`, or "All" for the castle) and when Find is pressed in the
  Players tab (to that piece's land). Putting the card back returns to "All".
- "Yours" is the seat's home region. A Nomads seat (5 players) has none, so it
  does not get the button; that layout is not designed (see the README).
- Zooming changes the screen, not the view: it must not start a piece hop or
  any FLIP motion. Check that a hop that starts while zoomed still lands on
  the right space.

### 5. The turn panel and the hand on a phone

Same `TurnPanel` and `Hand`, phone styles and three layout changes:

- **The step row** (`StepTracker`, as dots plus "Step 3 of 4 · Play a card")
  sits at the top of the panel, except while a card is picked.
- **Choices are a two-column grid** (`.sl-options.grid`, as
  `Phone-Choose.dc.html`). Each `.sl-option` is at least 46 px: its number,
  the piece's name and where it goes from the engine's `landing` (the
  destination's color, or "road", "castle", the treat), and under it the
  engine's own description clamped to two lines, with the whole sentence as
  the button's accessible name. Six choices fit without scrolling at
  390 × 844; more scroll inside the panel. "Put back" is a 44 px button on
  the panel's title row.
- **After a choice** (`Phone-Zoom.dc.html`): the board zooms to it, the panel
  shows the choice and the action's own buttons ("Move and battle", "Just
  move"), and a way back.
- **A battle** (`Phone-Battle.dc.html`) replaces the turn panel and the hand
  in the space under the board, never the board: each side's portrait, name,
  sugar cubes and dice, the line on how dice work, and the button. A foe battle
  asks for Roll first with blank dice; a knight battle starts with the
  action's own button and shows the engine's dice after it, as on desktop.
- **The hand** is six equal columns of candy-wrapper cards, 82 px tall,
  showing the card's name only (the "Best with …" line is the accessible
  name and in the How to play tab). Seven or more cards scroll sideways
  inside the hand, never the page. The token, deck and discard counts sit on
  the hand's title row; the "Trade 4 cards" button moves into the panel's
  quiet buttons when the engine lists it.

### 6. The menu's two tabs

`SlScreen` portals into `menuSlot` a row of two tabs, Players and How to play
(44 px each, chocolate when chosen), and the chosen tab's content
(`Phone-Menu.dc.html`). The table's own parts follow underneath: Undo, Rules,
Settings, Share, the last move, the log, Leave the table.

- **Players**: the existing `Players` panel in full: each seat's card with
  portrait, name, "Your turn" or "AI" pill, the points bar with "N to go",
  "N/5 influence", sugar and cards, and the three pieces, each a 44 px row
  with a **Find** button. Find focuses the piece (the ring and pulse it has on
  desktop) and zooms the board to its land; the menu stays open, so the
  person sees the piece above the sheet.
- **How to play**: one paragraph on moving by color, the color guide
  (`ColorGuide`, all six rows), how to win with the points from the reference
  data, and a "The whole game on one page" button that opens the existing
  How to play sheet (`FirstGame`).
- The score chips open the menu on the Players tab; the menu button opens it
  on whichever tab was last open.

### 7. The How to play page

`FirstGame` still opens by itself the first time a seat sits at a Sweetlands
table in this browser (`localStorage`, as built). On a phone it is a full
sheet over the table; that is the one time the board may be covered, since
nothing can be played until it is closed. Its content is a single scrolling
column at 390 px: the three-across rows of the desktop page stack. Its
"Got it, let's play" button stays at least 44 px tall.

### 8. Record the decisions

Add "The phone (built …)" under section 19 of
`docs/implementation-plan.md`, as section 17 has for Fractured Fist: the opt
in, `titleShort`, `menuSlot` and `openMenu`, the menu stopping under the board,
the zoom, what moved into the menu, and anything the build decided that the
boards left open. Then mark the phone boards "Chosen, built" in the canvas
README.

## The acceptance check: `e2e/sweetlands-phone.spec.ts`

Add this spec, modeled on `e2e/fractured-fist-phone.spec.ts` and using the
same setup as `e2e/sweetlands.spec.ts`. It runs against the full stack like
the others. Adjust selectors to what the build names, but keep every
assertion. With `SHOTS_DIR` set it keeps a screenshot of each step.

The log lives in the menu on a phone, so the spec watches the hand and the
turn panel to see a move land, not `.log li`.

```ts
// The Sweetlands phone (docs/games/sweetlands-phone-build.md): at 390 x 844
// the table is one column with the board always in view, nothing wider than
// the screen, and the top bar on one line (the three findings of the mobile
// audit, 2026-11-12). The menu holds the players and how to play and stops
// under the board; zoom by land; a card's choices are a grid of 44 px buttons
// in the engine's own words; a move sent from the phone lands.
// Set SHOTS_DIR to keep a screenshot of each step.

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
    const zoomed = document.querySelector('.sl-board-frame');
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
    const frame = document.querySelector('.sl-board-frame')!;
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
    const lines = await part.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
    });
    expect(lines).toBe(1);
  }
}

/** Every control the person presses is at least 44 px, except the marks and pieces on the board. */
async function expectTouchTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('.table-topbar button, .table-topbar a, .sl-screen button, .menu-sheet button, .menu-sheet a')]
      .filter((el) => !el.closest('.sl-board-frame'))
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && Math.min(r.width, r.height) < 44; })
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
  await expect(page.locator('.table-topbar .round-tag')).toHaveText(/^R\d+$/);
  await expectTopBarOneLine(page);
  await expectFits(page);
  await expectBoardInView(page);
  await expectTouchTargets(page);
  await shot(page, '1-table');

  // Zoom by land: five buttons in one row inside the screen; a land zooms, All zooms out.
  const zoom = page.getByRole('group', { name: 'Zoom the board' });
  await expect(zoom.getByRole('button')).toHaveCount(5);
  const frame = page.locator('.sl-board-frame');
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
  const card = page.locator('.sl-card.playable').first();
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
  await expect(now.getByRole('heading', { name: 'Play one card' })).toBeHidden({ timeout: 30_000 });
  await expectTopBarOneLine(page);
  await expectFits(page);
  await expectBoardInView(page);
  await shot(page, '8-after-move');
});
```

The spec does not reach a battle: one AI game rarely gives the first turn a
Knight in reach. The battle layout is checked by the screenshot of the board
and by the desktop spec's battle coverage; add a battle step when a fixture
or a seeded game makes one reliable.

## Acceptance

- `e2e/sweetlands-phone.spec.ts` passes at 390 × 844.
- `e2e/sweetlands.spec.ts` (desktop) still passes, unchanged.
- `e2e/fractured-fist-phone.spec.ts` and `e2e/pages-phone.spec.ts` still pass:
  the table changes (`titleShort`, `menuSlot`, `openMenu`) are shared.
- The screenshots from `SHOTS_DIR` match the five boards in layout: the board
  in the same place on every step, nothing covering it, nothing past the right
  edge, the top bar on one line.

## Open

- The Nomads (5 players): pieces, home, off-board pool, and their zoom button.
- A phone held sideways (wider than 640 px gets the desktop table, which does
  not fit 844 × 390), as for Fractured Fist.
- The engine still picks a capture target itself (zekel `choices.ts`,
  "capture-target"); the phone, like the desktop, cannot ask.
