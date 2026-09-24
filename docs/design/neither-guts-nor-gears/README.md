# Neither Guts nor Gears — the design canvas

Start here. This folder is the source of truth for how the NGnG table looks and
behaves in Universe. Fifty-four artboards, plus the index and the icon registry.

The engine that decides every rule lives in a **different repository**:
`zekel/src/games/neither-guts-nor-gears/`. Universe never holds a second copy
of a rule, so anything in here that looks like a rule is a *rendering* of one.

---

## Read in this order

1. **This file**, to the end. It is short.
2. **`../SCREEN-ROUTING.md`** — how the fifty-four boards become one client.
   The one idea: there is no navigation. `route(view, seatId) → Screen` is pure,
   and the engine's state decides what is on screen. Nothing links to anything.
3. **`zekel/src/games/neither-guts-nor-gears/SPEC-instance-gates.md`** — the
   change the engine needs before most of these screens can be built. Read it
   before writing client code, not after.
4. **`zekel/src/games/neither-guts-nor-gears/DESIGN-ALIGNMENT.md`** — where the
   canvas and the engine agree and where they don't, measured file by file.
5. **`zekel/src/games/neither-guts-nor-gears/GAME-DESIGN.md`** — the rules. Cite
   it rather than re-deriving anything.

Open the canvas itself while you read. Every artboard is a standalone
`.dc.html` page: open one in a browser and it renders.

---

## What is here

| Page in `canvas.json` | Boards | What it is |
|---|---|---|
| `choices` | 35 | One board per decision the rules give a player |
| `boards` | 5 | The two faction boards, the table at four and six seats, the map at three zooms |
| `icons` | 7 | The 81-mark registry, drawn out by family |
| `grammar` | 3 | Token grammar, map selection states, crowded hexes |
| `look` | 4 | Treatment exploration — a control and two live directions |

`canvas.json` is the index: board frames, page assignment, z-order, and the
design notes. The notes are not decoration — they carry the reasoning, the open
questions and the things I got wrong and corrected. Read the notes for any
board you are about to build.

`icons.js` is the shared mark registry. `NGG.icon(name)` returns SVG **path
data**, never markup. Every board links it relatively.

---

## State of play

**Thirty of the engine's thirty-two player-owned choices have a screen.** The
count comes from `choices.ts` in the engine, which is the best artefact in
either project — a catalogue of every decision the printed rules give a player.
Measure against that file, not against this folder.

The two without a screen are deliberate: an allied initiative tie is a state on
the activation ladder, and declining a queued action is a control on Choice
Planning. Both are noted rather than built.

**Three things are known-wrong and unfixed**, all in
`DESIGN-ALIGNMENT.md` §3 with the engine code that proves it. They are canvas
bugs, not engine bugs. None of them block starting.

**One thing blocks nearly everything**: pendings publish a single English
sentence and no structured payload, and a shut option's reason exists only as a
`GameError` thrown at attempt time. The canvas's whole grammar is *show the
option you cannot take and why*. That is `SPEC-instance-gates.md`, and it is
also a live menu/engine disagreement in `breakTreatyMoves`, so it is worth
fixing on its own merits.

---

## Four rules that are not negotiable

These are what make fifty-four screens read as one thing. Breaking one is not a
style choice, it is a regression.

**The copy rule.** A screen may print only: state the client holds, text
printed on a card or in the rules, or the engine's reason an option is illegal.
No strategy advice, anywhere, ever.

**The four visual states, one meaning each.** Grey (`grayscale(1)
brightness(1.14) contrast(.82)`) means *not part of this choice* and never
hides a label, glyph or piece. Dashed means *not on the board yet*. Struck
through in danger red with a reason means *shut, and here is why*. Solid fill
with its own mark means *on the board*.

**Never re-implement a rule.** If a screen needs to know whether a treaty can
break, the engine says so. Recomputing a predicate in the client is a second
copy of a rule and the brief forbids it outright.

**Player agency.** A decision the rules give the player is never made by the
server, the interface, or a convenience default. Randomness resolves only when
a person presses Roll or Draw — that is what `report_draw` is for.

---

## The treatment

The `look` page holds a control board diagnosing why the original screens read
flat, and two directions that stack:

- **Pressed** is the floor: screened tints instead of flat fills, square
  hairlines, a die line, a card back that reads as a back. Cheap, and it
  survives a phone.
- **Ink and Oil** goes on top: a wizard seat is a page somebody wrote on, a
  robot seat is a part somebody machined. Both faction boards are already in
  it — and applying it was a **token swap**: the theme object, the type
  families, the corner radii, and one ground element behind everything. Four
  changes on boards of seven hundred lines. Everything else followed from the
  tokens.

Two findings on that page matter for the client architecture:

**Tokens follow their owner, not the viewer.** A Covenant piece is a drawn ink
ring and a Foundry piece is a cut plate, on every seat's screen. Species becomes
readable off the board with no legend.

**The map stays one map.** Same inks, shapes, labels and positions for everyone.
A seat owns the frame around the board, the codes it writes on tiles, its
selection and reach marks, and its margin readout. That is the whole licence.
See `Look Map.dc.html`.

Everything on those boards is a gradient, a screened tint, a shadow, a border or
an inline SVG stroke. No art, no asset pipeline, nothing that needs an
illustrator before it can ship.

---

## Changing the design

These working files are the source of truth. Edit them here, then rebuild the
canvas with the `design` skill — never hand-edit an assembled output.

Two things bite:

- **A `{{hole}}` is a dotted lookup into `renderVals()` and nothing else.** Not
  an expression, and it cannot carry markup. An icon hole carries SVG path data.
- **Check `sc-for` aliases against the keys you return.** An `as="s"` shadows a
  returned `s`, silently. It has cost me an hour twice.

There is a harness worth keeping: execute every board's `renderVals()` in plain
JS and assert that every `{{hole}}` a row uses is a key those rows carry. It
catches both of the above before a render does.

---

## Where to start

`SCREEN-ROUTING.md` §12 has the build order and the reasoning. In short: the
shell, then the router with every branch stubbed, then **Choice Build → Choice
Payment → Place It including the Access Request interrupt and the resume**.

That one chain exercises composition, interruption, parking, staleness and a
second seat, all at once. It will hit the gates problem inside an hour, which is
why the spec is item 3 on the reading list rather than item 5.
