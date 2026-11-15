# Adventurer Olympics — the design canvas

Start here. This folder is the source of truth for how the Adventurer Olympics
table looks and behaves in Universe. Nineteen artboards plus the index: eleven
for the desktop table and its pieces, and eight for the table on a phone.

The rules live in `docs/games/adventurer-olympics.md`, and behind that in the
engine, which decides every rule. Universe never holds a second copy of a rule,
so anything in here that looks like a rule is a *drawing* of one. Where a board
and the rules disagree, the rules win; report the board as a bug.

**Status.** The desktop boards: first draft, checked in a browser on
2026-09-30. Every board renders at its canvas size with no script errors,
`AO-Icon.dc.html` mounts inside the other boards, and a turn on `Main.dc.html`
plays through (step, Draw, Roll, explore, the AI turns, the roll for turn
order). That check used a local stand-in for the design tool's runtime; the
boards have not yet been reassembled with the `design` skill.

The phone boards: approved by the owner on 2026-11-12. Each was rendered at
390 × 844 that day (`Phone-Map` at its own 390 × 600) with the design tool's
runtime and checked by eye; the three things that render turned up are fixed
(see "On a phone"). What to build is `docs/games/adventurer-olympics-phone-build.md`.

---

## Read in this order

1. **This file**, to the end.
2. **`docs/games/adventurer-olympics.md`**: the rules, the full card and tile
   lists, and §12, the notes for the port (what is hidden, who rolls, which
   choices belong to the player).
3. **`Main.dc.html`**: the table. It is playable; click through a whole turn.
4. The other Table boards, then the Icons boards.
5. For the phone: the eight `Phone-*` boards (the "On a phone" row on the Table
   page), then `docs/games/adventurer-olympics-phone-build.md`.

---

## What is here

| Page in `canvas.json` | Board | What it is |
|---|---|---|
| `table` | `Main.dc.html` | The table, 1440×900, **playable**: step, draw, roll, explore, end turn, watch the AI turns, roll for turn order |
| `table` | `Test-Roll.dc.html` | One test beat by beat: step on it, Draw, Roll, where the card and coin go |
| `table` | `Explore.dc.html` | Exploring: stand by a slot, flip the tile, pick a slot, turn it, place it |
| `table` | `Dungeon.dc.html` | A Dungeon chain: "Any rune" declined, draw again, two Little Monster fights |
| `table` | `End-Scoring.dc.html` | End of game: quest points, each quest's counts, a tie that scores nothing, a shared win |
| `table` | `Phone-Table.dc.html` | **On a phone, playable**, 390×844: your turn with the map in view. Top bar on one line, the deck strip, the map with Key and zoom, the "You" row and Explore / End turn at the bottom. Step onto a hex; the City opens the test; End turn shows an AI move as a caption over the map |
| `table` | `Phone-Test.dc.html` | **On a phone, playable**: a test in a sheet over the bottom half, the map still in view above it with the City picked out. Step, Draw, Roll, Result, with a strip saying which beat you are on. Tweak `stage`: `draw`, `roll`, `result`, `done` |
| `table` | `Phone-Test-Done.dc.html` | On a phone: where the card and the coin go. `Phone-Test` at `stage="done"`: the Fairy flies down a dotted path from the City into the "You" row, Charisma goes 2 → 5, your coin drops onto the City |
| `table` | `Phone-Explore.dc.html` | **On a phone, playable**: exploring. Tile 8 has flipped into a short sheet; the two slots that touch your hex glow on the map. Tap one, turn it, Place tile. Tweak `stage`: `slot`, `turn`, `placed` |
| `table` | `Phone-Explore-Turn.dc.html` | On a phone: `Phone-Explore` at `stage="turn"`: the tile sits in its slot with Left, Right and Place tile |
| `table` | `Phone-Sheet.dc.html` | **On a phone, playable**: the sheet that holds what the side column and your board held, in three tabs: You (stats, this turn's steps, companions, monsters, runes, coins), Everyone (turn order, the other seats), Quests. Tweak `tab` |
| `table` | `Phone-Menu.dc.html` | **On a phone, playable**: the menu sheet: Undo, Rules, Settings, Share, the last move with pace and replay, the log, Leave the table |
| `table` | `Phone-Map.dc.html` | The phone boards' shared map (a component, 390×600 on its own). See "On a phone" |
| `icons` | `AO-Icon.dc.html` | **The icon component.** Every drawing in the game, by name |
| `icons` | `Icons-Runes.dc.html` | The five artifacts as rune stones, plus a second option (amulets) |
| `icons` | `Icons-Map.dc.html` | Map icons, stats, the quest medal, the four adventurers, coins, a die |
| `icons` | `Icons-Context.dc.html` | The style on a map tile and on cards; palette and font |
| `icons` | `Icons-Monsters.dc.html` | Monster cards: one creature per number |
| `icons` | `Icons-Companions.dc.html` | All 16 companions, each matching its bonus |

The Main board's game state is a hand-written demo (round 7, you are Red) and
the AI turns are a fixed script. Both are there to show the design, not to be
ported. The engine supplies the real state and the real AI moves. The same is
true of every phone board.

---

## The icon component

`AO-Icon.dc.html` holds every drawing: map icons, runes, stats, the quest
medal, the die, coins, the four adventurers, six monsters and sixteen
companions. The Table boards mount it with
`<dc-import name="AO-Icon" icon="goblin" size="44">`. Props: `icon`, `size`,
`tint` (a coin's colour, or the base under an adventurer), `rot`, `flat` (no
wobble; automatic under 26 px) and `shadow`.

Each drawing is a list of SVG paths in a 100×100 box, drawn with a thick ink
outline, flat bright fills and a white shine. An SVG turbulence filter
(`#ao-wob`) gives the hand-drawn wobble.

The five `Icons-*` boards were made before the component and still carry
their own copies of the drawings. Treat `AO-Icon.dc.html` as the source; if the
copies differ, the component wins. In the client this becomes one icon module
that returns path data, the way `neither-guts-nor-gears/icons.js` does.

---

## On a phone

The mobile audit of production on 2026-11-12 found the table unplayable on a
phone: the map was hidden, only the side column showed, and the top bar ran
off the right edge. These boards are the fix, drawn in the same shared phone
frame the Fractured Fist and Cybernoir 2127 phone tables use.

- **The map is always in view.** It fills the middle of every phone screen.
  Nothing that opens covers all of it: the test and exploring sheets rise over
  the bottom of the screen only, and the map shrinks to fit above them.
- **The top bar is one line:** the title, the round ("R7"), the turn ("Your
  turn"), and a 44 px menu button. The steps left are not in the top bar on a
  phone; they are the pips in the action row.
- **What the side column and your board held moves into two sheets.** Undo,
  Rules, Settings, Share, the last move, the log and Leave go in the menu
  (`Phone-Menu`), the same menu the other phone tables have. Your adventurer,
  your companions, monsters, runes and coins, this turn's steps, turn order,
  the other seats and the quests go in the adventurer sheet (`Phone-Sheet`),
  opened from the "You" row at the bottom of the screen.
- **The bottom of the screen** is a "You" row (your adventurer, your three
  stats, coins, quest points; tap it for the sheet), then one action row: the
  step pips, Explore and End turn.
- **The legend** is behind a Key button on the map; zoom is +, − and Fit.
- **The AI turn** plays as a caption card over the top of the map, with pace
  and replay, as on the desktop.
- **Every control is at least 44 px tall.** A hex you step onto is 48 px tall
  on `Phone-Table`. With a sheet open the map draws smaller (hexes 42 px tall
  while exploring, 38 px in a test), and then a tap on the map is either a
  whole slot, seven hexes across, or nothing at all.

`Phone-Map.dc.html` draws the map for every phone board. It holds the demo
position, the same one as `Main.dc.html` on the engine's tile pattern (see
"Decided"), except that Purple has walked off the City onto the hex beside it,
so the phone test can show the same Fairy recruit as `Test-Roll.dc.html`. The
boards pass it what changes: `pos`, `hex-size`, `steps` (lights the hexes you
can step onto), `show-slots`, `pending` (a tile being placed), `extra-tiles`,
`extra-tokens`, `fresh-tok` (the coin that drops), `focus` (one icon picked
out), `pad`, and `on-hex` / `on-slot`. A standee standing on an icon steps to
the left half of the hex, so the icon and its coin stay visible.

`Phone-Test-Done` and `Phone-Explore-Turn` are one-line wrappers that mount
`Phone-Test` and `Phone-Explore` at a later stage, so each beat has its own
board without a second copy of the screen.

Fixed after the first render (2026-11-12): the Fairy no longer lands on the
hint line in `Phone-Test-Done` (the hint moved to the top of the map and the
card's path is drawn), the Fighter no longer hides the City and its coin, the
"Pseudodragon" label fits its card in `Phone-Sheet`, and the map on
`Phone-Table` is a size larger. The map is as wide as the screen at that size,
so the bands above and below it stay; zoom is how a player gets closer.

---

## What each card shows

The numbers and bonuses are from the rules (§10). Only the pictures and names
are new.

**Monsters: one creature per number.** Four cards of each.

| Deck | Number | Creature |
|---|---|---|
| Little | 2 | Slime |
| Little | 3 | Goblin |
| Little | 4 | Skeleton |
| Big | 5 | Ogre |
| Big | 6 | Giant Spider |
| Big | 7 | Dragon |

Card backs keep the map icon: the angry face for Little, the horned skull for Big.

**Companions: each looks like what it gives.**

| # | Need | Bonus | Companion |
|---|---|---|---|
| 1 | 2 | +1 Strength | Cat |
| 2 | 2 | +1 Strength | Imp |
| 3 | 2 | +1 Charisma | Pseudodragon |
| 4 | 2 | +1 Strength, +1 Charisma | Squire |
| 5 | 6 | +3 Charisma, +3 Movement | Unicorn |
| 6 | 4 | +3 Movement | Horse |
| 7 | 2 | +1 Strength, +1 Movement | Goat |
| 8 | 6 | +4 Movement | Pegasus |
| 9 | 4 | +3 Charisma | Fairy |
| 10 | 2 | +1 Movement | Magic Broom |
| 11 | 2 | +1 Movement | Owl |
| 12 | 2 | +1 Charisma | Parrot |
| 13 | 4 | +3 Strength | Orc |
| 14 | 4 | +2 Strength, +2 Movement | Wolf |
| 15 | 6 | +4 Strength | Stone Golem |
| 16 | 6 | +4 Charisma | Bard |

**Adventurers (the standees).** Fighter, Ranger, Wizard, Rogue: four
archetypes, two women and two men, four different skin tones. Any adventurer
can take any colour: the player's colour is the round base they stand on, and
it matches their coins.

**Artifacts are runes.** Heart, Spade, Diamond and Club runes are carved from
straight strokes so each still reads as its suit, and each glows its own colour.
The Star rune sits on a darker stone with sparkles. The UI says "rune" where
the rules say "artifact", so the quest reads "Most runes".

**Quest card back** is a medal with a flame, so it no longer looks like the Star
(the rules' §12 asked for this).

---

## The look

- **Hand-drawn and cartoony, for kids.** Thick wobbly ink lines, bright flat
  colours, a hard little offset shadow like a sticker, uneven rounded corners on
  panels.
- **Colours.** Parchment `#fbf3e0` ground, ink `#2b2233` for every outline,
  meadow greens for tiles, orange `#ff8a3d` for the action button with ink
  text. Players: Red `#e8483d`, Blue `#3d8bfd`, Yellow `#ffc83d`, Purple
  `#9b5de5`. Cards stay parchment in the dark theme; they are objects on the
  table.
- **Type.** Fredoka for everything a player reads in this game. The Zekel top
  bar keeps the house fonts (Slackey wordmark, IBM Plex Sans).
- **Layout** follows the decided table layout: board in the middle, the
  player's own board along the bottom, the 420 px bench column on the right
  with the other seats, quests and log. On a phone, see "On a phone".

---

## Rules that are not negotiable

**Player agency.** Every choice §12 of the rules lists stays with the player:
their whole path, whether to explore, which slot, which way to turn the tile,
whether to stay and try again, which rune and from whom (or to decline). Draws
and rolls resolve only when the player presses Draw or Roll. The boards show
exactly those buttons; keep them. The phone boards change where these buttons
sit, never whether they are there.

**Nothing appears in place.** Cards fly from their deck, adventurers hop hex to
hex, coins drop onto the hex, a failed card slides under its deck, a new tile
flies in from the stack. The keyframes in `Main.dc.html` show the intent. On a
phone, a card you keep flies into the "You" row, since your board is in the
closed sheet.

**Never re-implement a rule.** Legal steps, explore slots, what triggers, who
leads a quest: the board computes these for the demo only. The client asks the
engine.

**The eight primitives are the unit of implementation.** The map is the `map`
primitive (7-hex tiles on flat-top hexes), decks and the tile stack are card
zones, a player's companions, monsters and runes are a tableau, and coins are a
pool.

---

## Decided

- **Tile pattern (2026-09-30): the engine's.** Tiles fit in one of two
  mirror-image patterns. The tile across a side sits at `a + 2b`, where `a` and
  `b` are the side's two hexes in the order N, NE, SE, S, SW, NW. So the tile
  touching a tile's SE–S side has its centre one hex right and two down (axial
  offset `(1, 2)`). The canvas first drew the mirror, `(2, 1)`; `Main.dc.html`
  and `Explore.dc.html` were moved to match (`slotOff`), and the phone boards
  were drawn on the engine's pattern from the start of the hand-off
  (`Phone-Map.dc.html`, `slotOff`). The engine's `hexMap.ts` (`tileCenter`) is
  the source of truth.
- **The phone (2026-11-12): approved as drawn** in the eight `Phone-*` boards.
  Build guide: `docs/games/adventurer-olympics-phone-build.md`.

## Decisions made on the canvas that nobody has signed off yet

- **Rune stones over amulets.** The amulet option is still on
  `Icons-Runes.dc.html`.
- **Calling artifacts "runes"** in the UI.
- **Fredoka** as the game's own font inside the house frame.
- **Which adventurer sits in which colour** in the demo (Red Fighter, Blue
  Wizard, Yellow Ranger, Purple Rogue) is only the demo; players should pick.

## Known gaps

- No setup screen: picking an adventurer and colour, and the face-up quests.
  There is no phone board for setup, the roll for turn order, the "Any rune"
  choice or the end screen either; on a phone those use the same bottom sheet
  as the test (see the build guide).
- No "last tile placed, one more round" banner beyond a log line.
- No screen for running out of coins; the rules ask the port to handle it and
  to ask the designer what happens.

---

## Changing the design

These working files are the source of truth. Edit them here, then rebuild the
canvas with the `design` skill; never hand-edit an assembled output. Keep the
artboard file names: `<dc-import>` tags reference `AO-Icon`, `Phone-Map`,
`Phone-Test` and `Phone-Explore` by name.
