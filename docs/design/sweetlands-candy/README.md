# Sweetlands Imperium: candy theme — the design canvas

Start here. This folder is the source of truth for how the Sweetlands Imperium
table looks once it has its own theme: the printed board redrawn as a trail of
glossy candies, each faction's land sprinkled in its own way, pieces shaped
like each leader's treat, and panels that look like frosted wafers. The rest of
Universe keeps the brief's look; only the Sweetlands table changes, the same
way the Fractured Fist arcade theme and the Cybernoir rain and neon theme work.

What to build is in
[`docs/games/sweetlands-candy-theme-build.md`](../../games/sweetlands-candy-theme-build.md).
Every rule, space, count and turn step still comes from
[`docs/games/sweetlands-imperium.md`](../../games/sweetlands-imperium.md), with
the engine as the source of truth. Nothing in this folder is a rule. The
positions, points, hands and dice on the boards are a sample round-4 game, not
a fixture.

## Read in this order

1. This file.
2. `docs/games/sweetlands-candy-theme-build.md`.
3. Open `Table.dc.html`. It is the whole table at 1440 × 960 and it is
   clickable: pick a card in the hand, pick a piece, move, battle, roll.

Each `.dc.html` file is a standalone page and renders in a browser. The
images come from `docs/design/assets/` (the faction portraits and the treat
icons already used by the app).

## What is here

| File | What it is | Status |
|---|---|---|
| `Table.dc.html` | The whole table on your turn: players and pieces on the left, the board in the middle, your hand below it, the turn panel and color guide on the right. Interactive. | Chosen |
| `First-Game.dc.html` | The "How to play" page: how to score, the three pieces, moving by color, the four steps of a turn, the six color actions. | Chosen |
| `canvas.json` | The canvas layout. | — |

## Decisions the owner made in this pass (2026-10-08 to 2026-10-13)

- **The board looks like the printed board.** A 14 × 11 grid of colored
  squares in the printed colors, not dots floating on a map. Space colors are
  the printed (PICO-8) values, including the muted purple `#83769c`.
- **Regions are lands, not numbers.** The region numbers are gone. Every grid
  square belongs to a region (a space to its own region, an empty square to
  the nearest space's region; the castle to nobody). Each land is filled with
  its own sprinkle pattern and outlined in its region color. The grid paper
  background is gone.
- **Candy look on the board.** Spaces are glossy rounded candies with a small
  gap between them; treat spaces are round white plates (random ones dashed);
  road arrows are chocolate; a wafer frame runs round the board.
- **Junctions are a crossroads signpost** in the top corner of each junction space.
- **The castle has no label** and is drawn large; under it, the foe shows only
  as the number of sugar cubes it rolls (no foe name: "Dragon" does not fit).
- **Each faction's home is themed on its leader**: Milkshake's sundae palace,
  Fudge's chocolate fort with turret and orange flag, Jellybean's jellybean
  cottage with green plants, Cheesecake's cheesecake tower.
- **Pieces are shaped like the leader's treat**: milkshake glass, fudge cube,
  jellybean, cheesecake slice. The picture inside says which piece: crown =
  Leader, sword = Knight, wrapped candy = Ambassador. Rejected on the way:
  same-shape tokens for every faction; a candy cane for the Knight.
- **The rest of the table is themed too**: a pink sprinkled page, a pink top
  bar with a chocolate edge, cream panels with a chocolate outline and a raised
  bottom edge, Sniglet for headings, IBM Plex Sans for body text, chocolate
  instead of near-black, raspberry `#c2255c` for main buttons. The zekel
  wordmark stays in the brand green.
- **Player cards**: a "Your turn" or "AI" pill in the corner; points as a
  five-segment striped bar that says "N to go" (or "Winner!"); influence shown
  as "N/5" because it is capped at 5.
- **Intel cards are candy wrappers** (direction A of five tried): a bar in the
  card's color with crimped ends and a cream label carrying the action name and
  who it is best for. No action pictures on any card; only treat cards carry a
  picture. A double card has a dark "×2" pill inside its top corner. Rejected:
  lollipop, candy-cane frame, frosted cookie, and "board space" cards; also
  sword, coin and eye icons on the cards.
- **New players are taught on the table**, not only in a rulebook: a four-step
  turn tracker, a color guide that is always on screen, numbered outlines on
  the board for every place the chosen card can take each piece, and a plain
  sentence of what the action would do there.

## Not designed yet

- The Deposed Queen Quiche (the 5-player Nomads): no piece shape, no home, and
  no off-board pool are drawn. The quiche and tomato icons exist in
  `docs/design/assets/`.
- The phone (the brief makes it a later pass).
- Motion. The canvas jumps a moved piece to its new space; the app must slide
  it along its path (see the build file).
- Dark mode.
