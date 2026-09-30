# Fractured Fist: arcade theme — the design canvas

Start here. This folder is the source of truth for how the Fractured Fist table
looks once it has its own theme: a dark arcade stage, heavy italic capitals,
hard black outlines, and card art showing the game's four species. The rest of
Universe keeps its own look; only the Fractured Fist table changes.

What to build, file by file, is in
[`docs/games/fractured-fist-arcade-build.md`](../../games/fractured-fist-arcade-build.md).
Every rule, card, cost and turn step still comes from
[`docs/games/fractured-fist.md`](../../games/fractured-fist.md), with the
engine as the source of truth. Nothing in this folder is a rule. The numbers on
the boards are a sample mid-game state, not a fixture.

## Read in this order

1. This file.
2. `docs/games/fractured-fist-arcade-build.md`.
3. Open the boards. Each `.dc.html` file is a standalone page and renders in a
   browser. `Strike-Prototype.dc.html` plays: it has pace, skip and replay.

## What is here

| File | What it is |
|---|---|
| `Main.dc.html` | The table as the code draws it today, redrawn from the code at 1440 × 900, with the problems numbered. Reference only. |
| `Table-Technique.dc.html` | The proposed table during the Technique step, in the arcade theme. |
| `Table-Channel.dc.html` | The same table during the Channel step: spirit counters, buyable supply rows lit. |
| `Cards-Arcade.dc.html` | All 34 cards, grouped by school, with the species on each. |
| `Species.dc.html` | The four species as outlines to scale, the elder Bouaux, and two fighting poses each. |
| `Strike-Prototype.dc.html` | The strike moment, playing. Imports `Table-Channel.dc.html` as the dimmed board behind it. |
| `Strike-Storyboard.dc.html` | The strike frozen at each step, with timings. Imports `Strike-Prototype.dc.html`. |
| `art/*.svg` | One scene per card, 34 files. See below. |
| `canvas.json` | The canvas layout. |

## The card art

Each file in `art/` is one scene, drawn in a 300 × 264 window
(`viewBox="-50 24 300 264"`) on a black ground. Names are the card names in
lower case with hyphens (`masters-riposte.svg`); map them to the engine's card
ids when copying them into the app.

- On the printed card the scene sits in a tall panel twice, the second copy
  turned 180°, so the card reads from either side of the table.
- On the table's own card the same scene is cropped to a strip with
  `preserveAspectRatio="xMidYMid slice"`.
- The colour of the speed lines in each scene is the card's school (or its type
  when it has no school). That colour is baked into the file.

## Decisions the owner made in this pass (2026-09-29)

- **The theme is Fractured Fist's own.** The table picks it up through the
  glue's `themeFor`, the same way Neither Guts nor Gears does. The brief's
  warm-but-flat look stays for the rest of Universe.
- **Four species, each school mostly one of them.** Masters' Circle: humans.
  The Uncounted: Unmoored. Titan Entertainment: Grankiki. The Awakened: Bouaux.
  Each school's four cards show its main species on three and another species
  on one. Cards with no school are a mix.
- **Grankiki** have four arms (a big pair and a small pair) and a curled
  chameleon tail, and turret eyes that look two ways at once.
- **Young Bouaux** (the phase that fights) have huge gorilla arms they drag on
  their knuckles and bat wings: skin from arm to leg, with a spur off each
  elbow. Elder Bouaux do not fight.
- **The Unmoored look like whoever they fight.** On a card they wear another
  species' outline, without a face, with a broken edge, a violet tint and two
  copies slightly out of step. Their resource and Misstep cards are not
  Unmoored, on purpose.
- **Masters' Circle cost numbers are white**, as on the print-and-play sheet.
- **The strike moment keeps its timings** and its rules; only its look changes.
