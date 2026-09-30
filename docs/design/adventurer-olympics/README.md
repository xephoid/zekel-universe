# Adventurer Olympics — the design canvas

Start here. This folder is the source of truth for how the Adventurer Olympics
table looks and behaves in Universe. Eleven artboards plus the index.

The rules live in `docs/games/adventurer-olympics.md`, and behind that in the
engine, which decides every rule. Universe never holds a second copy of a rule,
so anything in here that looks like a rule is a *drawing* of one. Where a board
and the rules disagree, the rules win; report the board as a bug.

**Status: first draft, checked in a browser on 2026-09-30.** Every board
renders at its canvas size with no script errors, `AO-Icon.dc.html` mounts
inside the other boards, and a turn on `Main.dc.html` plays through (step,
Draw, Roll, explore, the AI turns, the roll for turn order). That check used a
local stand-in for the design tool's runtime; the boards have not yet been
reassembled with the `design` skill.

---

## Read in this order

1. **This file**, to the end.
2. **`docs/games/adventurer-olympics.md`**: the rules, the full card and tile
   lists, and §12, the notes for the port (what is hidden, who rolls, which
   choices belong to the player).
3. **`Main.dc.html`**: the table. It is playable; click through a whole turn.
4. The other Table boards, then the Icons boards.

---

## What is here

| Page in `canvas.json` | Board | What it is |
|---|---|---|
| `table` | `Main.dc.html` | The table, 1440×900, **playable**: step, draw, roll, explore, end turn, watch the AI turns, roll for turn order |
| `table` | `Test-Roll.dc.html` | One test beat by beat: step on it, Draw, Roll, where the card and coin go |
| `table` | `Explore.dc.html` | Exploring: stand by a slot, flip the tile, pick a slot, turn it, place it |
| `table` | `Dungeon.dc.html` | A Dungeon chain: "Any rune" declined, draw again, two Little Monster fights |
| `table` | `End-Scoring.dc.html` | End of game: quest points, each quest's counts, a tie that scores nothing, a shared win |
| `icons` | `AO-Icon.dc.html` | **The icon component.** Every drawing in the game, by name |
| `icons` | `Icons-Runes.dc.html` | The five artifacts as rune stones, plus a second option (amulets) |
| `icons` | `Icons-Map.dc.html` | Map icons, stats, the quest medal, the four adventurers, coins, a die |
| `icons` | `Icons-Context.dc.html` | The style on a map tile and on cards; palette and font |
| `icons` | `Icons-Monsters.dc.html` | Monster cards: one creature per number |
| `icons` | `Icons-Companions.dc.html` | All 16 companions, each matching its bonus |

The Main board's game state is a hand-written demo (round 7, you are Red) and
the AI turns are a fixed script. Both are there to show the design, not to be
ported. The engine supplies the real state and the real AI moves.

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
  with the other seats, quests and log.

---

## Rules that are not negotiable

**Player agency.** Every choice §12 of the rules lists stays with the player:
their whole path, whether to explore, which slot, which way to turn the tile,
whether to stay and try again, which rune and from whom (or to decline). Draws
and rolls resolve only when the player presses Draw or Roll. The boards show
exactly those buttons; keep them.

**Nothing appears in place.** Cards fly from their deck, adventurers hop hex to
hex, coins drop onto the hex, a failed card slides under its deck, a new tile
flies in from the stack. The keyframes in `Main.dc.html` show the intent.

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
  and `Explore.dc.html` were moved to match (`slotOff`). The engine's
  `hexMap.ts` (`tileCenter`) is the source of truth.

## Decisions made on the canvas that nobody has signed off yet

- **Rune stones over amulets.** The amulet option is still on
  `Icons-Runes.dc.html`.
- **Calling artifacts "runes"** in the UI.
- **Fredoka** as the game's own font inside the house frame.
- **Which adventurer sits in which colour** in the demo (Red Fighter, Blue
  Wizard, Yellow Ranger, Purple Rogue) is only the demo; players should pick.

## Known gaps

- No setup screen: picking an adventurer and colour, and the face-up quests.
- No "last tile placed, one more round" banner beyond a log line.
- No screen for running out of coins; the rules ask the port to handle it and
  to ask the designer what happens.
- No phone layout (a later pass for every game).
- Fredoka is loaded from Google Fonts. If the client bundles it, add it to
  `ATTRIBUTIONS.md` (SIL Open Font License).

---

## Changing the design

These working files are the source of truth. Edit them here, then rebuild the
canvas with the `design` skill; never hand-edit an assembled output. Keep the
artboard file names, since `<dc-import>` tags reference `AO-Icon` by name.
