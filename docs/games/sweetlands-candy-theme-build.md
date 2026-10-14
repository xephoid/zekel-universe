# Sweetlands Imperium — the candy theme, what to build

Started 2026-10-13. Written for whoever implements the theme on the Sweetlands
table. The design is in
[`docs/design/sweetlands-candy/`](../design/sweetlands-candy/README.md); read
its README first. Rules, spaces and counts come only from
[`sweetlands-imperium.md`](sweetlands-imperium.md), with the engine over the
rulebook. Nothing is built yet.

Today the table is drawn by `apps/web/src/glue/sweetlands-imperium.ts` and
`apps/web/src/glue/sweetlands-board.ts` on the shared primitives: the board is
the plain map primitive with 80 small dots at percent positions, pieces are
dots labelled with a letter, the hand is the generic card fan. The owner's
complaint was that it "barely looks like the game" and that it is hard to tell
which pieces are where. This pass fixes both and teaches new players on the
table. It moves no rule and adds no move.

## Before anything else

1. **Render both boards.** Open `Table.dc.html` and `First-Game.dc.html` at
   their own sizes, screenshot them, and fix overlaps in the working files
   before copying anything into the app. They were not rendered during design.
   Things to look at first: the candy cane was replaced by a sword, check it
   reads at 25 px; the jellybeans on Jellybean's home roof at 36 px; the
   "N to go" text over the dark fudge-brown points bar; the crimped ends of
   the hand cards at about 113 px wide.
   Done 2026-10-13. What changed in `Table.dc.html`: the four player cards
   ran 83 px past the bottom of the page, so they are tighter and the hint
   under "Players and their pieces" has its own line; each piece row shows the
   space's color as a swatch and the land, with the full place as its tooltip,
   because the sentence was cut off; "N to go" sits over the empty part of the
   points bar, so it never covers the stripes; two pieces on one space sit
   side by side instead of one spilling over the space above; the crossroads
   signpost stays inside its own space; the treat card's plate is smaller so
   a two-line name clears the crimp; the vertical side labels set their text
   sideways, which keeps the apostrophe in "Cheesecake's"; the picture inside
   the milkshake glass and the cheesecake slice is a little larger, so the
   sword reads at 25 px; the roof jellybeans are bigger; and the "what to do
   now" panel scrolls when a card has many options, so the color guide stays
   on screen. `First-Game.dc.html` had no overlaps.
2. **Run the security playbook in documentation mode** for this hand-off, and
   change mode once code lands.

## Rules that apply to every item

- **The engine decides, Universe draws.** The canvas computes landing spots,
  outcomes and dice in its own script so the mockup is clickable. The app must
  not. Landing spots come from the engine's legal moves for the chosen card;
  the sentence under each option comes from the move's description; dice come
  from the engine after the person presses Roll.
- **Player agency.** Which card, which piece, ring or road, take the action or
  not, raise taxes or not: every one is asked, none is defaulted.
- **Nothing appears in place.** See item 9.
- **Primitives keep their data shape.** Where a primitive gains a mode
  (the board as a grid of candies, treat-shaped pieces), add fields to the
  existing data types the way the Cybernoir station map did, and keep colors as
  keys the glue's palette fills in. If the board is easier as a game-drawn
  screen (as Neither Guts nor Gears did), say so in
  `docs/implementation-plan.md` and keep the primitive data shape for the
  engine's debug client.

## What to build, in order

### 1. The theme hook

`themeFor` returns `sl-theme` for the Sweetlands table (as `ff-theme` and the
Cybernoir theme do). A new `sl.css` holds the look. Values, all from
`Table.dc.html`:

| Part | Value |
|---|---|
| Page | `#fdeef3` with three dot patterns (pink `#ffb3c9`, sky `#b8e8ff`, lemon `#ffe48a`) on a 44 px tile |
| Top bar | `#ffd6e6`, 3 px bottom border `#5a3214`, a 3 px `#e9b07a` edge under it |
| Panels | `#fffaf6`, 2 px `#5a3214` outline, radius 16, `box-shadow: 0 3px 0 #5a3214` |
| The "what to do now" panel | as panels, 2.5 px outline, 4 px raised edge, a 5 px `#ffd6e6` rim |
| Text | `#3d200b` (main), `#5e3a28`, `#8a5a44` (quiet) |
| Main button | `#c2255c`, white text; hover `#9c1c49` |
| Quiet button | `#fffaf6`, 2 px `#e8a9bd` border |
| Headings, card names | Sniglet 800, falling back to Bricolage Grotesque |
| Body | IBM Plex Sans |

Self-host Sniglet (SIL Open Font License) and credit it in `ATTRIBUTIONS.md`.
The zekel wordmark keeps its brand green.

### 2. The board as a grid of candies

The board is the printed 14 × 11 grid, 48 px squares at the design size, scaled
to fit. Every coordinate is already in `sweetlands-board.ts`.

- **Space colors** are the printed ones: red `#ff004d`, orange `#ffa300`,
  yellow `#ffec27`, green `#00e436`, blue `#29adff`, purple `#83769c`. Replace
  `SPACE_COLORS` (the purple question in the reference is settled: muted).
  Use the same values on the cards and in the color guide.
- **A space** is a rounded candy: radius 10, 2 px margin, a white gloss on the
  top half, a darker 3 px inner bottom edge, a 1.5 px `#5a3214` outline and a
  2 px raised edge. No region number.
- **Road spaces** carry a chocolate arrow toward the castle (direction = toward
  the next road space; the last one toward the castle square it touches).
- **Junction spaces** (ring index 5) carry the crossroads signpost in their top
  corner, with the tooltip "Crossroads: you may turn onto the road toward the
  castle here".
- **Treat spaces** are round white plates with the treat art; random slots
  have a dashed outline. Which random treat is where comes from the view.
- **Lands.** Every grid square is given a region: a space or home tile its own;
  an empty square the region of the nearest space (straight-line distance, ties
  to the lower region); the four castle squares none. Each land is filled with
  its pattern and outlined with a 5 px line in its region color wherever the
  neighbouring square belongs to another region or to nobody.

  | Region | Fill | Outline |
  |---|---|---|
  | 1 Milkshake | `#fde3b4`, pink and white sprinkles | `#f5a623` |
  | 2 Fudge | `#d6ad84`, chocolate chips and cream dots | `#8b5a2b` |
  | 3 Jellybean | `#e6d2ff`, green and pink beans | `#9013fe` |
  | 4 Cheesecake | `#fffaf0`, crumb and pink dots | `#8a8270` |

  The assignment is drawing only and can be computed once from the coordinates.
- **Homes.** Each start tile shows its leader's home (drawings in
  `Table.dc.html`, the `homeMS` / `homeFD` / `homeJB` / `homeCC` blocks) on a
  tinted tile with a border in the faction color.
- **The castle** spans its four squares, pink with icing, no label. Under it,
  a dark red pill shows one small sugar cube per die the foe rolls (from the
  view's foe; Dragon 5, Orc 3, Fiend 2), with a tooltip, and no foe name.
  When the foe is defeated the pill goes.
- **The frame**: `box-shadow: 0 0 0 7px #e9b07a, 0 0 0 9px #b8733a, 0 0 0 11px #5a3214`.
- **Side labels** on all four sides: the faction's treat shape, the land's name
  ("Your land (Milkshake)" for your own), region number, tax level, and a
  "pieces travel" arrow. Pieces go counter-clockwise: bottom →, right ↑,
  top ←, left ↓. The left and right labels are vertical text; draw their
  arrows rotated explicitly, since vertical text does not turn pictures.

### 3. Treat-shaped pieces

Each faction's three pieces share its treat's shape; a picture inside says
which piece it is. The SVG drawings are in `Table.dc.html` (the four `isMS`,
`isFD`, `isJB`, `isCC` blocks and the `GLYPH` table for where the picture sits).

| Faction | Shape | Picture color |
|---|---|---|
| Milkshake | milkshake glass with cream, cherry and straw | dark |
| Fudge | fudge cube | white |
| Jellybean | jellybean | white |
| Cheesecake | cheesecake slice with strawberry and crust | dark |

Pictures: crown = Leader, sword = Knight, wrapped candy = Ambassador. Every
shape has a white halo so it reads on any space. Size 25 px on the board, two
per row when several share a space; 20 px in the players panel. A focused piece
gets a 3 px `#c2255c` ring and a slow pulse. The tooltip names owner, piece and
place ("Fudge's Knight — red space · Fudge's land"). Quiche (5 players) is not
designed; see the README.

### 4. The players panel

One card per seat, yours ringed in orange: portrait, short name and full name,
a "Your turn" (raspberry) or "AI" (pink) pill that never wraps, then:

- **Points**: a five-segment bar, filled segments in the region's outline
  color with white diagonal stripes; inside it, "N to go", or "Winner!" at 5.
- "N/5 influence" (influence is capped at 5), sugar cubes, cards in hand.
- The three pieces as rows: small piece, its name, where it is in words.
  Clicking a row or a piece on the board highlights both.

### 5. The hand: candy-wrapper cards

Each card is a wrapped candy bar, about 112 × 150:

- Body in the card's color with a white shine down one side, 2 px chocolate
  sides, crimped zig-zag ends top and bottom (paths in `Table.dc.html`).
- A cream label across the middle: the action name (Sniglet 15) and a line:
  "Best with your Knight", "Any piece", "Twice, same piece", "Treat card".
- No action pictures. Treat cards are pink wrappers with the treat art in a
  cream circle above the label.
- Double cards: a dark "×2" pill inside the top-right corner, below the crimp.
- Picked: the card lifts 10 px and gets a raspberry ring. After a card is
  played the rest of the hand dims.
- Each card is a button with an accessible name ("Red card: Battle").

Next to "Your hand": Intel tokens, deck and discard counts, and the "Trade 4
cards for any color" button (2 for Fudge), all from the view.

### 6. Playing a card: the turn panel

The right column, top to bottom: the four-step tracker (Recall, Draw, Play a
card, Influence; done steps mint, the current one raspberry), the "what to do
now" panel, the color guide.

The play flow (all options from the engine's legal moves for that card):

1. No card picked: "Play one card", one sentence on moving by color, a tip,
   and "Pass instead (+1 influence, ends turn)".
2. Card picked: one numbered button per legal destination per piece, ring and
   road counted separately ("Knight → the red space in Fudge's land"), each
   with what the action would do there. The board shows a dashed outline with
   the same number on each destination. Clicking either selects it.
3. Destination picked: the board keeps only that outline, solid; the panel
   offers "Move and battle" (or the action's name) and "Just move" when the
   action does something, and a way back.
4. A battle: both sides' sugar cubes as blank dice and a Roll button. The
   dice and the result come from the engine after Roll.
5. Spend influence: buy an Intel token (1), buy a sugar cube (3), End turn.

Recall and Draw are not drawn on the canvas; give them the same panel.

### 7. The color guide

Always on screen. One row per color: swatch, "Red · Battle", who it helps
most, one plain sentence. The row for the picked card's color is outlined.

### 8. The first-game page

`First-Game.dc.html` is the "How to play" page, opened from the top bar
button. It covers how to score, the three pieces and the four treat shapes,
moving by color with a small example, the four steps of a turn, and the six
color actions. Show it before a person's first Sweetlands game; where that is
remembered is for the build to decide.

### 9. Motion

Not drawn on the canvas. Follow the moments table in
`sweetlands-imperium.md`: a played card flies to the discard; a piece hops
space by space to its destination (or turns onto the road at the junction); a
treat card lifts the piece and drops it on the plate; captured pieces fly home;
in a battle the sugar cubes tumble after Roll. The numbered outlines fade in
and out with the choice, which is fine: they are not table objects.

## Open

- The Quiche (Nomads) pieces, home and off-board pool.
- The phone layout.
- Dark mode for the theme.
