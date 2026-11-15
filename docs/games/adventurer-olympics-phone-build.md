# Adventurer Olympics on a phone: what to build

Status 2026-11-12. Written for whoever builds the Adventurer Olympics phone
table in Universe. The owner approved the phone boards on 2026-11-12. This is
the same kind of pass as Fractured Fist's item 7
([fractured-fist-arcade-build.md](fractured-fist-arcade-build.md)) and
Cybernoir 2127's item 8 ([cybernoir-2127-build.md](cybernoir-2127-build.md)):
a phone layout for one game, inside that game's own screen, using the shared
phone frame those two built. The desktop table does not change.

The design is the "On a phone" row of the canvas in
[`docs/design/adventurer-olympics/`](../design/adventurer-olympics/README.md):
eight `Phone-*` boards. Read that README's "On a phone" section first. Every
rule still comes from [adventurer-olympics.md](adventurer-olympics.md), with
the engine over the rulebook, and every number on the table still comes from
the view (`glue/ao/read.ts`). Do not copy a number or a coordinate out of the
boards: they draw a sample mid-game position.

Record what the build decides in `docs/implementation-plan.md`, section 18,
under a new heading "The phone".

## Why

The mobile audit of production on 2026-11-12 found the table unplayable on a
phone: the map was hidden, only the side column showed, and the top bar ran
off the right edge. Adventurer Olympics does not set `GlueModule.phone`, so it
gets the desktop table squeezed into 390 px.

## In one paragraph

Set `phone: true` on the Adventurer Olympics glue so the table uses the shared
phone frame below 640 px: one-line top bar, menu sheet, no side column. Inside
`AoScreen`, when `props.phone` is true, lay the screen out as the boards do:
a thin deck strip, the map filling the middle, and at the bottom a "You" row
and one action row. Everything the side column and your board held moves into
one bottom sheet with three tabs (You, Everyone, Quests). The panels that float
over the map on a desktop (the test, exploring, "Any rune", the roll for turn
order, setup) become bottom sheets that cover only the lower part of the
screen, so the map stays in view above them. No rule, move or button changes;
only where things sit.

## The boards, and what each one fixes

| Board | What to build from it |
|---|---|
| `Phone-Table` | The resting layout on your turn: top bar, deck strip, map with Key and zoom, a one-line hint over the bottom of the map, the "You" row, the action row. Also the AI caption over the top of the map |
| `Phone-Test`, `Phone-Test-Done` | A test as a bottom sheet with the map above it and the icon picked out; the beats strip; where the card and coin go afterwards |
| `Phone-Explore`, `Phone-Explore-Turn` | Exploring as a short bottom sheet; the slots glow on the map; Left, Right, Place tile |
| `Phone-Sheet` | The adventurer sheet: You, Everyone, Quests |
| `Phone-Menu` | The menu sheet. This is the frame's existing menu (`Table.tsx`), plus the last move (see "The caption") |
| `Phone-Map` | Drawing only: how the map is sized and padded on each screen. Not a component to port; the map stays the `map` primitive |

## The 640 px breakpoint and the frame

Use what Fractured Fist and Cybernoir use; add no second breakpoint.

- `apps/web/src/table/phone.ts`: `PHONE_QUERY = '(max-width: 640px)'` and
  `usePhone()`. The table asks it once and tells the game.
- `apps/web/src/glue/ao/index.ts`: add `phone: true` to
  `adventurerOlympicsGlue`. With it, `Table.tsx` adds `phone` to the
  `.table-shell` class, drops the side column (`sideSlot` is absent),
  moves Undo, Rules, Settings, Share and Leave from the top bar into the menu
  sheet, shows a 44 px menu button, and passes `phone` to `AoScreen`
  (`GameScreenProps.phone`) and to the plan (`GlueInput.phone`).
- `plan()` in the same file: return `statusShort: \`R${round}\`` beside
  `status`, as Fractured Fist does, so the top bar shows "R7" on a phone.
- `yourTurnLabel`: on a phone return just `Your turn` (check
  `input.phone`). "Your turn · 3 steps left" does not fit on one line at
  390 px, and the steps are already the pips in the action row.

Do not change `table/phone.ts`, the frame's top bar, or the menu sheet's
contents for other games.

## The top bar

The frame's top bar, one line, 54 px: the title (cut with an ellipsis if it
must be, though at 390 px "Adventurer Olympics" fits beside the rest), the
round tag, the turn pill, the menu button. Nothing else. On a phone the
title art (the quest medal) may stay or go; the boards leave it out to make
room. Acceptance: the top bar is one line and nothing in it runs past the
right edge at 390 px.

## The screen, top to bottom (`AoScreen` with `phone`)

Put the phone layout in `AoScreen.tsx` and its styles in
`glue/ao/ao-screen.css`, scoped under `.ao-screen.phone` (give the screen's
root the `phone` class when `props.phone`). Reuse the existing parts and their
reading of the view; change their arrangement and size only.

1. **Deck strip** (`DeckStrip`, about 46 px): the four decks as small backs
   with their counts, the tile stack, and the runes still in the supply ("Free"
   and their icons). The rune holders' names go; the adventurer sheet has who
   holds what. The decks keep their `data-flip-id`s: cards still fly from them.
2. **The map** (`MapPart`): fills the rest of the height. It is as wide as the
   screen, so draw it as large as the width allows: the boards use a hex
   radius of 28 px, which makes a hex about 48 px tall. A hex you can tap must
   be at least 44 px tall; check the map primitive's `maxRadius` and `fill`
   options give that, and say what you chose. Keep `+`, `−` and `Fit` (44 px
   square, top right of the map) and the zoom levels. The legend (`.ao-legend`)
   goes behind a **Key** button at the top left of the map that opens and
   closes it.
3. **The hint**, one line in a pill over the bottom of the map: the same words
   your board's hint uses today.
4. **The "You" row** (about 52 px, the whole row is one button): your
   adventurer, "You", your three stats as small chips, coins left, quest
   points, and an up-arrow. Its accessible name is "Your adventurer,
   companions and quests". It opens the adventurer sheet.
5. **The action row** (48 px buttons): the step pips, then Explore and End
   turn, each half the remaining width. When the engine lists "Stay and try
   again", it takes Explore's place on a third button or a second row; it must
   not be hidden. "Do nothing this turn" replaces End turn as it does now.
   Explore stays visible when it is greyed out, with the reason as its title,
   as on the desktop.

The numbered move menu (`menu` prop) is for the keyboard; a phone has none, as
in Fractured Fist.

## What moves into the adventurer sheet

On a phone, `Side` and the holdings half of `YourBoard` (`.ao-holdings`) are
not drawn under the board. They go into one bottom sheet, opened from the
"You" row. Use the `Sheet` from `@zekel/glue-kit` (as Fractured Fist's card up
close does) with the title "Your adventurer"; it rises from the bottom over a
scrim, has a 44 px Close button, and scrolls inside itself if it must. It has
three tabs (`role="tab"`, 44 px tall):

- **You**: your adventurer and quest points; your three stats with "+1 from
  friends" or "to start"; "This turn" (the step pips and three lines of what a
  turn can do); your companions, monsters beaten and runes as small cards;
  your coins; tiles explored and dungeons done. All of it is today's
  `YourBoard`, rearranged.
- **Everyone**: turn order (`.ao-order-strip`), then each other seat
  (`.ao-seat`), as the side column has them.
- **Quests**: the quest list (`.ao-quest`), as the side column has it.

Nothing that is in the side column or your board today may be lost.

## The panels become bottom sheets

On a desktop these float over the map (`.ao-panels`, `.ao-centre`). On a phone
each is a bottom sheet with a drag handle and the hand-drawn top edge, fixed
to the bottom of the screen, and the map shrinks to the height left above it.
It is not modal: the map above stays visible, and stays tappable when the
engine lists a move on it (a slot).

- **The test** (`TestPanel`), as `Phone-Test`: about 394 px. The icon and its
  title, a strip of the four beats (Step, Draw, Roll, Result) with the current
  one highlighted, the card slot and the drawn card, the dice and their total,
  and one 52 px button: Draw, then Roll. The icon on the map is picked out
  with a ring. The result stays up for `RESULT_MS`, as now.
- **Exploring** (`ExplorePanel`), as `Phone-Explore`: about 230 px, so the map
  and both slots stay in view. The flipped tile, a line of what to do, then
  Turn left, Turn right and Place tile in one row.
- **"Any rune"** (`RunePanel`), the roll for turn order (`OrderPanel`) and
  setup (`SetupPanel`): no phone board. Use the same bottom sheet as the
  test, as tall as its content needs (up to the top bar), with one row per
  option at 48 px. The setup sheet may cover the map; there is nothing on it
  yet.

## The caption

Adventurer Olympics sets `placesCaption`: `AoScreen` places the caption card
(the last move, pace, replay) itself. On a phone, put it over the top of the
map, full width less 8 px each side, as `Phone-Table` shows during an AI turn.

The approved menu (`Phone-Menu`) also shows the last move. The frame puts the
caption card in the menu only for games that do not place it themselves
(`captionInMenu = phone && !glue?.placesCaption` in `Table.tsx`). Add an
optional `GlueModule` flag, `captionInPhoneMenu?: boolean`, documented beside
`placesCaption` in `packages/glue-kit/src/types.ts`; set it on the Adventurer
Olympics glue; and make `captionInMenu` also true when it is set. Warble Way
Galaxy also sets `placesCaption` and has a phone layout; it must not change.

## Motion on a phone

Nothing appears in place, on a phone too. Two things need care:

- **A kept card needs somewhere to fly to.** On a desktop a recruited
  companion or a beaten monster flies to your board's holdings. On a phone
  those are inside the closed sheet. Give the "You" row the flip target for
  your holdings while the sheet is closed, so the card flies down into the row
  (`Phone-Test-Done` draws the path) and the stat chip it changes glows.
- **A sheet rises from the bottom and the map eases to its new height.** A
  sheet does not fade in. Under reduced motion both become a fade with the
  same timing, as everywhere else.

## Touch targets and fit

- Every button, tab and link is at least 44 px tall; the main buttons in the
  sheets are 48 to 52 px.
- At 390 × 844 nothing scrolls sideways, and the page does not scroll. Only the
  adventurer sheet, a long setup or rune sheet, and the menu's log may scroll
  inside themselves.
- No fake status bar or keyboard.

## What does not change

Rules, moves, the reading of the view, the desktop table, the `Draw` and
`Roll` buttons (pressed by the player, never resolved for them), exploring
(slot, turn, Place sends the one listed move), and every other game's table.

## Acceptance

At 390 × 844: the table on your turn matches `Phone-Table` without scrolling,
with the map in view and the top bar on one line; a test plays in a sheet with
the map still visible above it; exploring plays in the short sheet with the
slots tappable on the map; the adventurer sheet and the menu open and close
and hold everything the side column and your board held, including the last
move; every control is at least 44 px tall; the desktop table is unchanged
(the existing `e2e/adventurer-olympics.spec.ts` still passes). Add the spec
below and make it pass.

## The e2e spec to add

Save as `e2e/adventurer-olympics-phone.spec.ts`. It is modelled on
`e2e/fractured-fist-phone.spec.ts` and plays the way
`e2e/adventurer-olympics.spec.ts` does. The class names and accessible names
it uses are the ones this guide asks for; if the build names something
differently, change the spec and say so in section 18.

```ts
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

type Did = 'draw' | 'roll' | 'place' | 'slot' | 'step' | 'button' | null;

/** One press, as a person would make it; the same order as the desktop spec. */
async function takeTurnStep(page: Page, seen: Set<string>): Promise<Did> {
  const scr = page.locator('.ao-screen.phone');
  const button = (name: string | RegExp) => scr.getByRole('button', { name, exact: typeof name === 'string' });
  const test = page.getByRole('region', { name: 'The test' });
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
        if (!seen.has('test')) { seen.add('test'); await shot(page, '3-test'); }
      }
      await button(name).click();
      return did;
    }
  }
  if (await button('Place tile').isVisible()) {
    if (!seen.has('turn')) { seen.add('turn'); await expectMap(page, 300); await shot(page, '5-explore-turn'); }
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
    if (!seen.has('slot')) { seen.add('slot'); await shot(page, '4-explore-slot'); }
    await slot.first().click();
    return 'slot';
  }
  const take = page.locator('.ao-option');
  if (await take.count()) { await take.first().click(); return 'button'; }
  for (const name of [/^Explore/, /^Stay and try again$/]) {
    const b = button(name);
    if (await b.isVisible() && await b.isEnabled()) { await b.click(); return 'button'; }
  }
  const step = page.locator('.zk-hex.zk-lit:not(.ghost)');
  if (await step.count()) {
    const target = step.nth(Math.floor(Math.random() * (await step.count())));
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
  await shot(page, '2-sheet-you');
  await sheet.getByRole('tab', { name: 'Everyone' }).click();
  await expect(sheet.locator('.ao-order-strip')).toBeVisible();
  await expect(sheet.locator('.ao-seat')).not.toHaveCount(0);
  await sheet.getByRole('tab', { name: 'Quests' }).click();
  await expect(sheet.locator('.ao-quest')).not.toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close', exact: true }).first().click();
  await expect(sheet).toBeHidden();

  // The menu holds what the top bar held, the last move and the log.
  await page.getByRole('button', { name: /^Menu/ }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  for (const name of ['Undo', 'Rules', 'Settings', 'Share']) await expect(menu.getByRole('button', { name, exact: true })).toBeVisible();
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
```

Run it with the others (`pnpm e2e`, or Playwright on this file alone). Keep
the desktop spec passing beside it.

## Before calling it done

Run the security playbook in application-change mode and record the report
under `docs/security-reviews/`; check the latest report there for whether a
full review is due. Then check the one thing that matters most: every number
on the phone table traces to the view or the engine's reference data, no rule
was copied into Universe, and every Draw and Roll is still a press by the
player.
