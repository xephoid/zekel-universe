# Sweetlands Imperium: candy theme — the design canvas

Start here. This folder is the source of truth for how the Sweetlands Imperium
table looks once it has its own theme: the printed board redrawn as a trail of
glossy candies, each faction's land sprinkled in its own way, pieces shaped
like each leader's treat, and panels that look like frosted wafers. The rest of
Universe keeps the brief's look; only the Sweetlands table changes, the same
way the Fractured Fist arcade theme and the Cybernoir rain and neon theme work.

What to build is in
[`docs/games/sweetlands-candy-theme-build.md`](../../games/sweetlands-candy-theme-build.md)
(the desktop table, built) and
[`docs/games/sweetlands-phone-build.md`](../../games/sweetlands-phone-build.md)
(the phone). Every rule, space, count and turn step still comes from
[`docs/games/sweetlands-imperium.md`](../../games/sweetlands-imperium.md), with
the engine as the source of truth. Nothing in this folder is a rule. The
positions, points, hands and dice on the boards are a sample round-4 game, not
a fixture.

## Read in this order

1. This file.
2. `docs/games/sweetlands-candy-theme-build.md`, then
   `docs/games/sweetlands-phone-build.md`.
3. Open `Table.dc.html`. It is the whole table at 1440 × 960 and it is
   clickable: pick a card in the hand, pick a piece, move, battle, roll.
4. Open `Phone-Table.dc.html`. It is the same table at 390 × 844 and it is
   clickable the same way; the other `Phone-*` boards open on one moment each.

Each `.dc.html` file is a standalone page and renders in a browser. The
images come from `docs/design/assets/` (the faction portraits and the treat
icons already used by the app).

## What is here

| File | What it is | Status |
|---|---|---|
| `Table.dc.html` | The whole table on your turn: players and pieces on the left, the board in the middle, your hand below it, the turn panel and color guide on the right. Interactive. | Chosen, built |
| `First-Game.dc.html` | The "How to play" page: how to score, the three pieces, moving by color, the four steps of a turn, the six color actions. | Chosen, built |
| `Phone-Table.dc.html` | The phone (390 × 844) on your turn: the top bar on one line, the score chips, the five zoom buttons, the board, the turn panel, the hand. Interactive: everything below opens from here. | Chosen |
| `Phone-Choose.dc.html` | The phone with a card picked: numbered outlines on the board and the six choices as a two-column grid in the turn panel. | Chosen |
| `Phone-Zoom.dc.html` | The phone with a piece picked: the board zoomed to double size on the land it lands in; "Move and battle" and "Just move". | Chosen |
| `Phone-Battle.dc.html` | The phone in a battle: both sides' sugar cubes and the Roll button in the space under the board; the board stays in view. | Chosen |
| `Phone-Menu.dc.html` | The phone with the menu open: the Players and How to play tabs and the table's buttons, in a sheet that stops under the board. | Chosen |
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

## The phone boards (added 2026-10-13, rendered and approved 2026-11-12)

Five phone screens at 390 × 844, the same sample round-4 game as the table.
What to build is `docs/games/sweetlands-phone-build.md`. They follow the
Fractured Fist and Cybernoir phone tables: what the side column held moves
into a menu sheet, and the board is kept in view.

Every board was rendered at 390 × 844 on 2026-11-12 and checked against the
three things the mobile audit of production found that day (the turn panel
covering the board, the page running off the right edge, the top bar's round
label wrapping into the title). Fixed in the working files before approval:

- The zoom buttons ran past the right edge ("Cheesecake" was cut off). They
  are now five equal columns, the treat shape over a short name.
- The top bar had a second line ("Round 4 · first to 5 points"). It is now
  one line: "Sweetlands", an "R4" chip, a short turn pill, the menu button.
- The battle took the whole screen and the players sheet covered most of the
  board. Both now stay in the space under the board.
- The zoom hint covered the board's bottom row; it is gone. The picked card
  no longer runs into the "Your hand" label. With a card picked, the six
  choices are a two-column grid so all of them fit. Where each piece stands
  wraps instead of being cut off.

Decided on the phone boards:

- **One column, the board always in view.** From the top: the top bar, the
  score chips, the five zoom buttons, the board, then the space under the
  board, which holds the turn panel and the hand, or a battle, or the menu.
  Nothing is ever drawn over the board. On a 390 × 844 screen the board is
  364 × 286 and sits at the same place on every board.
- **The top bar is one line**: the title, the round as a chip ("R4"), the turn
  pill, and a 44 px menu button. No second line, no other buttons.
- **The menu sheet stops under the board.** It holds what the side column and
  the top bar's buttons hold on a desktop: a Players tab (each player's card,
  points bar, influence, sugar, cards, and their three pieces with a Find
  button that zooms the board to that piece), a How to play tab (moving by
  color, the six color actions, how to win), and Undo, Settings and Leave.
  The score chips open it on the Players tab.
- **Zoom by land.** The whole board fits, but its spaces are 26 px. Five
  buttons ("All", "Yours" and the three rivals) zoom it to double size on one
  land, sliding there. Picking a choice zooms to the land the piece lands in.
- **The battle replaces the turn panel and the hand**, never the board:
  each side's portrait, sugar cubes and dice, the sentence on how dice work,
  and a big Roll button.
- **Every control is at least 44 px**: the menu button, the zoom buttons, the
  choices (46 px), the hand cards (82 px), the menu's rows and tabs. Only
  the board's own marks are smaller on the whole-board view; zoomed, the
  spaces are 52 px, and every move the board offers is also a button in the
  turn panel.

Where a phone board and the built desktop table disagree, the built table wins
(see `docs/implementation-plan.md`, section 19): the sentence under each
choice is the engine's own description, not the board's sample wording ("Battles
Fudge's Knight"); a knight battle starts with the action's own button and shows
the engine's dice after it, and only a foe battle asks for Roll first; the turn
pill is the table's own label, so the board's "Pick a piece" and "Battle!" are
the turn panel's step, not the pill; the menu is the table's own menu sheet,
with Rules, Share, the last move and the log as well as the board's three
buttons.

## Not designed yet

- The Deposed Queen Quiche (the 5-player Nomads): no piece shape, no home, and
  no off-board pool are drawn. The quiche and tomato icons exist in
  `docs/design/assets/`.
- A phone held sideways (wider than 640 px, so it gets the desktop table).
- The phone's Recall, secret goal and Draw steps are not drawn; they use the
  same turn panel as "Play one card".
- Motion. The canvas jumps a moved piece to its new space; the app slides it
  along its path (built, see the candy theme build file).
- Dark mode.
