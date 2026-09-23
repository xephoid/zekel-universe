# Cybernoir 2127 — what to build

Started 2026-09-21, built out 2026-09-22. Written for whoever implements
the Cybernoir table, and kept as the record of what was done and what was not.

All eight items below are built (2026-09-22). Every one was checked on a live
table except where an item says otherwise, and each of those exceptions names
what was not seen and why. A full game has still never been played end to end,
so the late-game moments — a completed Evidence set landing, a set bounced by a
block, a Burn clearing the table — remain unseen.

What is left is not on this list: the three asks that would let the table say
what something costs or does in the engine's own words rather than not at all
(a cost per legal move, a printed line per Contact ability, and the standing
candidate count), and the layout work the Crowding artboard covers.

The design is twelve artboards in `docs/design/`, all named **Cybernoir …**.
Two are whole tables — **Cybernoir Hacker Table** and **Cybernoir Detective
Table**. **Cybernoir Turn Bar** runs: open it in Play and press the verbs. The
rest are still sheets: **Case File**, **Contact Card**, **Clue Moment**,
**Canvassing**, **Block**, **Upkeep**, **Big Hands**, **Crowding**, and
**Table Now**, which is a screenshot of what ships today with the gaps pinned on
it. Edit the working files and republish with the `design` skill; never
hand-edit an assembled output.

Every rule, card, cost and turn step comes from
[cybernoir-2127.md](cybernoir-2127.md), which takes the engine over the printed
rulebook. Do not re-derive any of it here, and do not copy a number out of the
artboards: they are drawings, and their sample state is a mid-game snapshot, not
a fixture.

How the "wrong today" list was made, so it can be redone after the work: the
Hacker's seat view was lifted from the `table_events` payloads the server had
already stored for a real Cybernoir table in `apps/server/dev.db`, and rendered
through the real `glue/cybernoir-2127.ts`, `packages/primitives` and `app.css`
at 1440 × 900. The Detective's was built to the same view shape and rendered the
same way. Nothing below is a guess about how it looks.

## What is wrong today

[`apps/web/src/glue/cybernoir-2127.ts`](../../apps/web/src/glue/cybernoir-2127.ts)
emits a map, a jail track, an evidence row, a NOT-token pool and two tableaux,
and lets the generic layout place them. In a turn-7 position the board column is
833 px of content in a 635 px column, so:

- **The Hacker is never asked where to hide.** The engine picks the hideout at
  session creation and starts the game in the play phase, so the one secret the
  Hacker owns is taken from them before they see the table. See "The hideout"
  below. Fixed 2026-09-22, in both halves.
- ~~**The Hacker's Evidence is below the fold.**~~ Done — see item 3. The case
  file is the points track now, in the side column, with all thirteen slots
  drawn from turn one. Ten of them are on screen at 1440×900 and the last row
  is a scroll away. The move list is still below the fold; that is item 5.
- ~~**Truthful clues are not rendered at all.**~~ Done — see item 2 below.
  There is now a clue rail across the board: a slot per category holding its
  revealed value or drawn empty, and the ruled-out tokens beside it reading
  `Population 0`, not `NOT ×4`.
- ~~**Faction and borough ids reach the screen raw.**~~ Done — see item 1
  below. Badges read `Iceden Collective` and `Shizuoka Inc`, and every location
  carries its borough and how many people live there. It made the map more
  crowded, not less: three badges a node now overlap the names in places. That
  is layout, and it belongs to **Cybernoir Crowding**.
- ~~**The Hacker cannot see the informant count.**~~ Done — see item 4. Their
  panel carries "Informants facing you".
- ~~**The Detective cannot see their own informants.**~~ Done — see item 4. The
  informant row draws each name for its owner, with a line saying whether the
  Hacker has seen it. No view changed, so no privacy test moved.
- ~~**Twelve of the Detective's nineteen legal moves have nothing to touch.**~~
  Done — see item 6. "Who you can reach" draws everyone living at a played
  Location; a tap on one offers both prices in the engine's own words.
- ~~**Upkeep is a line in a list.**~~ Done — see item 7. One press asks what
  happens to each informant, with nothing preselected.
- ~~**The move menu is the interface.**~~ Done — see item 5. The turn is a row
  of verbs; the numbered list is still there, collapsed, one tap away. The
  200-character burn paragraph is a button's title, never its label.
- **One bad row.** The Detective's panel lists an Overclock the Detective does
  not have (it reads the Hacker's marker). The Hacker's own hideout used to
  print as `The Hive · Corp 2`; the engine now names it, and the map marks it.

## What the design changes

1. **A clue rail on the board.** Three truthful slots, one per category, each
   holding its value or drawn as an empty outline, and the NOT tokens beside
   them reading `NOT Population 0`. Both seats see the same rail; it is public.
2. **The case file as the points track.** The Hacker's 13 slots in their printed
   shape — one Weapon, a row of three Witnesses, three rows of three Motive —
   with empty slots as outlines, at the top of the side column where the brief
   puts the points track. The Detective gets the same thirteen as a threat bar.
3. **Cards carry their own decision.** A Contact shows cost, affiliation,
   ability and whether a face-down informant could bounce it. A Location shows
   borough, population, affiliation and its residents, because residents are
   what playing it puts in reach.
4. **A verb bar instead of a transcript.** Eight verbs with their costs; picking
   one asks the single question that verb needs. The numbered list stays one tap
   away.
5. **Who you can reach.** Everyone living at a played Location, with both prices
   on them, in the Detective's side column. This is where those twelve moves go.
6. **Upkeep and the block as real panels.** Upkeep is keep-or-release per
   informant against the AP it costs. The block prompt states what each door
   costs — a revealed informant and a clue, or the card resolving — with neither
   preselected.
7. **Hands that grow.** Full cards to seven, a tightening fan to eleven, then
   affiliation stacks (borough stacks for Locations). 44 px is the floor for any
   exposed strip. See **Cybernoir Big Hands** and **Cybernoir Crowding**, which
   covers every other zone that swells.

## The hideout

The Hacker chooses one of the nineteen locations and hides there all game. It is
theirs to choose — `cybernoir-2127.md` says so, and so does the engine's own
setup checklist, which already carries the wording for a digital human Hacker.

It did not happen, until 2026-09-22. In
`zekel/src/games/cybernoir-2127/engine.ts`, `createInitialState` auto-completed
setup whenever both seats were *tracked*, and Universe marks every human seat
`digital`, which the engine reads as tracked. So the engine picked the hideout
itself and handed back a session already in the play phase. Trackedness (who
holds the cards) and who decides are two different things, and that conflated
them.

**Both halves are fixed.** The engine auto-completes setup only when the AI
plays the Hacker, and it names the chosen location in the Hacker's own view
beside the three printed facts. In Universe, a session that starts in the setup
phase lights all nineteen locations on the map, a tap names that location back
with its borough, population, faction and the people who live there, and only
"Hide here" sends the move. Reaching the move through the numbered menu instead
asks for the location as a list. The Detective sees "The Hacker is choosing a
hideout" and nothing lit. Checked in two real browsers, including the two-human
privacy spec. Tests: `glue.test.ts` "cybernoir-2127 glue" and
`table-forms.test.tsx` "cybernoir's hideout, chosen on the map".

Two things follow from it and are deliberately not done:

- A friend or guest holding the Hacker seat picks at the table, which is the
  path above. There is no setup-screen route, on purpose: it would only work
  when the host is the Hacker, and it would park the secret in the `tables`
  row until the game started.
- A human Detective against an AI Hacker still auto-completes, because the
  engine picks that hideout secretly and must keep it out of every response.
  That is correct, not a gap.

## Settled: the Hacker's own hideout

Taken: **the engine names it in the Hacker's own view** — the recommendation
below. The view now carries `location_name` beside the three printed facts, so
the map marks the safehouse for its owner and the bench prints the place rather
than `The Hive · Corp 2`. A view that gives the facts without a name still
marks nothing, which is what a session from before the engine stored the
location id sends. Universe keeps no copy of the fact.

The original note follows, for the reasoning.

## Settle this first: the Hacker's own hideout

The Hacker's view sends `hideout` as `{borough, population, affiliation}`, not
the card. So the map cannot mark the safehouse for the one player allowed to see
it, and the bench prints the raw ids. Three ways out:

- **The engine names it in the Hacker's own view.** The engine knows, the Hacker
  is entitled to it, and it is a two-line change in `views.ts`. This is the
  recommendation.
- **Universe remembers the setup answer.** The digital Hacker chooses the
  hideout through Universe, so the server saw it once. It would survive a
  reload only if stored with the table, and it would be a second copy of a fact
  the engine owns — which `CLAUDE.md` forbids for rules and should discourage
  here too.
- **Leave it.** The map highlights every Location matching the description and
  the Hacker counts. Worst of the three: on turn one that is a dozen nodes.

Until it is settled, build the map so the safehouse mark is driven by a name,
and leave the mark off when the view gives only a description. Do not invent the
match in the glue.

## What the shared types cannot hold yet

1. **Empty slots in a card zone.** The evidence case is thirteen slots of which
   seven are filled. `CardZoneData` has `cards` and nothing else. Proposal: an
   optional `empty?: number` — how many outlines to draw after the cards. One
   zone per row (Weapon, Witnesses, Motive I, II, III) keeps it simple.
2. **A card's cost and its group.** `CardData` has `label`, `subtitle`,
   `badges`, `colorKey` and `counts`. A Contact needs its printed play cost
   drawn as a pip, not a badge among badges, and the fan needs a key to group by
   when it folds. Proposal: `cost?: string | number` and `groupKey?: string`.
3. **An empty pool slot.** A clue category that has not been revealed is a slot,
   not a missing item. No type change needed if `count: 0` renders as an
   outline; check the Pool renderer before adding a field.

Nothing else. In particular the action bar, the chooser, the form hook and the
full-row zone all already exist — see the next section.

## What already exists — reuse it, do not rebuild it

- **The action bar.** `PlanStep`, `PlanPrompt`, `PromptAction` and `ActionBar`
  shipped in the Fractured Fist pass, and `Table.tsx` already renders
  `plan.steps` / `plan.prompt` and collapses the numbered menu when a prompt has
  actions. The verb bar is `steps` and `prompt` emitted from the glue, not new
  chrome.
- **`urgent` on a prompt.** The refine window's interrupt styling is exactly
  what the block decision needs.
- **`movesForSelect` and `MoveChooser`.** A person who can be arrested for 1 AP
  or recruited for 3 is one card that resolves to two moves; the chooser already
  asks which. Ship that before considering per-card buttons.
- **`formFor`.** The upkeep split belongs here — the generic template form would
  render `keep` and `release` as two comma-separated text boxes.
- **`span: 'full'`** for the clue rail across the board's width.
- **`arriveFrom`** so a drawn Contact flies from the deck, and the motion tokens
  in `packages/tokens` for every duration.
- **`reference_data`** already carries `affiliations`, `boroughs`, `locations`
  with population and residents, and every person's cost and ability. Nothing on
  these screens needs a constant in Universe.

## The work, file by file

**1. Printed names, not ids. DONE.** `glue/cybernoir-2127.ts`. A `names()`
lookup from `reference_data.affiliations` and `boroughs`, used everywhere a key
reaches the screen: the map badges, the hideout sheet and picker, and the
Hacker's own safehouse row. An id the reference data does not carry is put into
words rather than shown raw, and never guessed at. *Acceptance met:* checked on
the live table — no `Gang 1`, no `Corp 2`, no raw id, and every location badge
carries its borough, how many people live there, and its printed faction.
`glue.test.ts` covers both the named case and the fallback.

**2. The clue rail. DONE, except the Burn check.** `glue/cybernoir-2127.ts`,
plus two small library changes. It is a **track** rather than a pool: three
spaces — Borough, Population, Affiliation — each holding its revealed value or
drawn empty, full width across the board, with the ruled-out tokens as a pool
beside it. The pool reads `Population 0` and `Affiliation Iceden Collective`.

Two library changes went with it, both general rather than Cybernoir-shaped:
a track space is a circle when it holds a number and grows into a pill when it
holds a word, so a track can carry values as well as positions; and a pool of
one-offs leaves off a count of one, which is the rule the card already used for
its own count.

*Acceptance:* every token on the table is on screen with its value for both
seats — met, and checked on the live table with a bought clue. A Burn empties
the rail and the map's dimming clears with it — **not checked**: reaching a
Burn takes a long game, and the map does not dim on a clue yet anyway. Do that
with the counting question below.

**3. The case file. DONE, except the two motion checks.**
`glue/cybernoir-2127.ts` plus type change 1. Five rows — Weapon, Witnesses,
Motive First, Second, Third — in `plan.points`, drawn small so a row of slots
is a row of name chips rather than a row of full cards.

How many slots each row holds comes from the engine, not from a count here:
`reference_data.evidence` now publishes the shape of the win (`EVIDENCE_SHAPE`
/ `EVIDENCE_TOTAL` in the engine, which also replaced a bare `13` the AI had
twice). An engine that does not publish it gets the played cards and no
outlines. How many cards win the game is a rule, and Universe does not hold it.

*Acceptance:* thirteen slots from turn one — met, and checked on the live
table; ten are on screen at 1440×900 and the last row is a scroll down the
side column. The brief puts the points track under the other seats, not above
them, so this is where it lands. A completed set landing as three cards at
once, and a bounced set emptying its slots — **not checked**: both need a long
game to reach. The rows are wired to fly from the hand (`arriveFrom`).

**Type change 1 landed**, plus one the notes did not ask for: `empty?: number`
on `CardZoneData` draws the outlines, and `size?: 'small'` draws a zone as name
chips rather than faces. Thirteen full-size cards do not fit a 420 px column,
and a zone whose job is to show a shape is a general thing, not a Cybernoir
one.

**4. Locations and people carry their facts. DONE.**
`glue/cybernoir-2127.ts` plus type change 2. A Contact carries its cost as a
pip in the corner, its affiliation as a badge, and what playing it does as its
second line. A Location carries its three printed facts and, underneath, who
lives there. The Hacker's panel carries "Informants facing you", and the
Detective's informant row now shows each name to the one person entitled to it
with a line saying whether the Hacker has seen it — no view changed, so no
privacy test moved.

*Acceptance met*, checked on the live table for both seats.

**Type change 2 landed in part:** `cost?: string | number` on `CardData`.
`groupKey?` was not added — nothing uses it until item 8, and an unused field
is surface for nothing.

**Left over from this item:** a Contact's ability is the engine's own id put
into words — "Board Discard", "Hand Discard". The engine publishes no sentence
for an ability and Universe must not write one. "Draw 3" and "Reveal
Informant" read fine; "Discard Retrieval" does not. The fix is an ability
catalog in the engine's reference data with a printed one-liner each, the same
shape as `affiliations`. Small, and not done here.

**5. The verb bar. DONE, with one thing not as asked.**
`glue/cybernoir-2127.ts`, plus one variant on `PromptAction`: a verb may carry
several listed moves, and pressing it opens the chooser that already existed
for taps. One move behind a verb sends on the press; nothing is ever chosen
for the player.

*Acceptance met:* a verb is drawn only where the engine lists a move behind it
(checked on the live table for the Detective, and in fixtures for both seats);
the numbered list still holds every move and collapses to one tap; the burn
paragraph is the button's `title`, never its label.

**Not as asked: the cost is not on the button.** The notes wanted each verb's
cost as its `note`. A `LegalMove` is `move_id`, `description`, `move` — there
is no cost on it, and a cost per verb is a rule Universe would be inventing.
Where the engine states a cost it states it inside its own sentence ("Play
Blackice (2 AP)"), so a verb with one move behind it carries that sentence as
its note, and a verb with several says how many instead. Putting the cost on
the button properly needs the engine to publish it per move — the same shape
as the two other asks in these notes.

**6. Who you can reach. DONE, one acceptance point unseen.**
`glue/cybernoir-2127.ts`, using `movesForSelect`. Everyone living at a played
Location, in the Detective's side column, ids `cn:person:<name>`, lit when an
arrest or a recruitment names them.

*Acceptance:* every arrest and recruit the engine lists has something on screen
that lights — met; tapping a person with both moves opens the chooser — met,
and checked on the live table; a person already spoken for is drawn out of
reach with where they are ("your informant", "in jail · booked", "played as
Evidence") — built and covered in fixtures, but **not seen live**: it needs a
longer game than these checks reach.

The reason given is *where they are*, which is a public fact or one this seat
is entitled to. Why that puts them out of reach is a rule, and the engine says
it by not listing the move.

One thing the notes did not mention: the reach list does **not** show a
Contact's printed cost. That is what the Hacker pays to play them, not what the
Detective pays to reach them, and showing it beside an arrest would read as its
price.

**7. Upkeep and the block. DONE, the block itself unseen live.**
`glue/cybernoir-2127.ts` via `formFor` and `prompt`.

Upkeep is one press. The engine lists every keep-and-release combination as
its own move, so the form asks what happens to each informant and sends the
listed move the answers make — it never assembles one. Nothing is preselected
and the button stays dead until every informant is answered for.

*Acceptance:* each informant shown, nothing preselected — met, checked on the
live table. **The AP it costs, and the AP left after, are not drawn.** A legal
move carries no cost, and "one AP each" is a rule; the engine states the cost
inside its own sentence for each combination, which the numbered list still
shows. Adding it properly is the same ask as item 5's.

The block is an interrupt: the turn's verbs step aside and one question is
asked, in the warning colour, with both doors stated and neither preselected.
Declining is a button like any other and says nothing afterwards. The clue the
block buys is the same shape — a category per button. *Acceptance:* both doors
stated, no default, no timer — met in fixtures. **The block itself was not seen
live**: it needs the AI to hold a face-down informant matching a card the
Hacker plays. The clue-reveal half *was* seen live, in a real game.

One thing to know: a pending step this glue has no words for draws no verb bar
at all, and the numbered list opens itself instead. That is the fallback
working, but it reads as an empty bar. The remaining pending types are the
burn's own choices and the three ability follow-ups.

**8. The growing hand. DONE.**
`packages/primitives` CardZone, plus `groupKey` and `groupNames` on the card
and zone.

Up to seven nothing overlaps. From eight the fan tightens, and never past a
thumb — by eleven the 44 px floor is already what binds, not the taper. Past
eleven the hand folds into stacks on what its cards say they stack with:
faction for Contacts, borough for Locations. Each stack shows its count and
who is inside, and opening one fans that stack alone. Spread lays the whole
hand out as a grid and is there as soon as the fan starts overlapping.

*Acceptance:* a sixteen-card hand is readable — met, and checked on the live
table at fourteen cards, which folded into five faction stacks. A stack holding
a legal card lights itself — met, covered in `hand.test.tsx`; and fixing it
turned up a real bug, below. Every legal card reachable in one tap from the
collapsed state — met in the fan, where every strip is tappable; from the
folded state it is two, a stack then a card, which is what the design says
("tapping one fans that stack alone"). Spread is the one-tap answer.

**A bug this turned up: the Hacker's hand was never lit at all.** Cybernoir's
play moves name a person (`person_name`, `people`), and `litParts` only lit
hand cards by index, which is a different game's shape. So the engine could be
offering every card in the hand and none of them lit. Cards are now lit by
name, and a tap on one means every move that names it.

## 9. The look, against the artboards

Added 2026-09-22, after the eight items. They are all about what the table
*says*; none of them is about what it *looks like*, and the difference showed:
the table had the design's information and not its design.

**Done: colour and panels.**

- **Faction colour.** The palette carried the two seats and the three boroughs
  and not one faction, so affiliation — the field a Motive set is built from,
  and what a big hand folds on — reached the screen as a grey pill. The six
  faction colours are in the palette now, taken from the artboards, and every
  person and every location wears their own rather than the seat holding them.
- **Panels.** Each region is a white card on the paper with a header, the way
  the action bar already was and the way every table artboard draws it. It is
  in `app.css` on `.zone`, not in the library, and it is the whole product's
  language, not Cybernoir's: the other games' artboards use the same
  `var(--surface)` / `var(--line)` the tokens already hold. Checked on
  Cybernoir, Fractured Fist and Sweetlands — all three read better and none
  broke.

### The city is a map

**Settled 2026-09-22.** The city stays a map. Two of the three documents say
so outright and the third was never disagreeing:

- `cybernoir-2127.md` maps it to Map: "19 named regions grouped in 3 borough
  areas, each with a population badge and an affiliation color chip … No
  edges or routes."
- The Primitives component sheet — the authority on the eight — says it in as
  many words: "Cybernoir's 19 locations are a map." It draws a region as a
  wide pill with the name below, and shows the states this game needs.
- The Hacker Table artboard draws borough rows of chips, which reads as a
  different primitive but is the same one *laid out in bands with the borough
  names drawn*.

So the fault was never the primitive. It was that the map could not draw what
the other two documents already described: there were no bands, and a 34 px
circle cannot hold a location, which is why the badges overflowed.

Two additive fields on the map close it, and both default off so Sweetlands'
eighty-space board is untouched: `areas`, named parts of the board drawn as
labelled bands behind the regions standing in them, and `nodeShape: 'pill'`
for a board whose regions are places rather than spaces.

With bands, each of the three facts a clue can name is said once and where it
fits: the **borough** is the band, the **faction** is the region's colour, and
**how many live there** is its one badge. They were three text badges each
before, which is what made the map unreadable.

Still missing: the "crossed off" state the component sheet draws — a location
the Detective has seen in hand or in the discard. The engine keeps
`seen_locations` in state and does not put it in the view, so the table cannot
draw it. That is a fourth ask of the same shape as the other three.

**Not done, and the bigger half:**

- ~~**The city is drawn with the wrong primitive.**~~ Settled 2026-09-22: it is
  a map, and it always was. See "The city is a map" below.
- **The verb bar** is a horizontal strip of buttons; the design is a column of
  rows, each with its cost on the right and a note beneath, feeding a detail
  panel. **Not being done** (decided 2026-09-22): the cards themselves are the
  interface, and the effort went there instead — see below. The strip stays as
  the way to reach a verb that is not a card, and it now always has one while
  the engine is waiting.
- **Table Now** still holds a screenshot of the table from before any of this.
  It should be refreshed from the working files with the `design` skill.

## 10. The cards are the interface

Added 2026-09-22, in place of turning the verb bar into a column.

**A card in hand lights wherever it can be played.** It was named, not
indexed: the Hacker's moves name a person and the Detective's name a location,
and `litParts` lit the map region for a Location and nothing for the card in
hand holding it. So the Detective could tap a region of the city to play a
card, but not the card. Both seats' hands now light for every move that names
what is on them — a play, a discard for a clue, a guess — and a tap on a card
means every move that names it, so one that could be played or discarded asks
which.

**The jail says who is in it.** Three slots of anonymous 13 px dots with their
names in a tooltip, and labels that wrapped. `cybernoir-2127.md` says what it
should be: "3 spaces in a line, each holding a stack of face-up POI cards;
arrows between spaces." A track can do that now — `pieceShape: 'named'` draws
what stands on a space as named chips in a labelled slot rather than as dots,
and `arrows` draws the line between them. Each name carries its faction on its
edge. Both default off, so every other track is unchanged.

## 11. The case file is evidence, not a score

Added 2026-09-22. The case file drew each Evidence card as a bare name chip
— a progress count for the Hacker. For the Detective it is the opposite: it
is the case. Evidence is face up for good, and what is printed on it is theirs
to read.

Each card now carries what the card says: **where that person lives**, which
is the fact that narrows nineteen locations down, their faction, which is what
a Motive set is made of, and their cost. Seen on a live table, a played Motive
set read as three people all living at one location — and that location was
the safehouse. The ability is left off: a card played as Evidence never used
one.

Both seats see it, because it is the card's own printed face either way.

**A chip stopped hiding the card's facts.** `size: 'small'` was drawing a name
and suppressing the subtitle and badges outright, which also meant "Who you
can reach" never showed where an unreachable person was, though the glue had
been setting it since item 6. A small zone is about the shape of a row, not
about withholding what a card says.

**And the action bar is never empty while the engine is waiting.** A move type
no verb claimed drew no button at all, so the turn's follow-up questions —
which Location to discard, which informant to flip, what to take back — left
a blank bar at exactly the moment an answer was owed. They now get a button
labelled with the engine's own word for the move. This blocked three live
checks before it was fixed, which is how it was found.

## Out of scope

Card art, the phone pass (M6), voice, and the informant identities on the
Detective's row before item 4 — that is a one-line fix but it changes what a
privacy test asserts, so do it with the seat tests in front of you.

## Before calling it done

Run the security playbook in application-change mode, as `CLAUDE.md` requires,
and record the report under `docs/security-reviews/`. Re-run the two-human
privacy spec: this pass puts more of each seat on screen than before, and the
face-down informant change moves a card from "hidden from everyone" to "visible
to its owner".

Then the check that matters most here: that nothing in this work put a copy of a
rule into Universe. The tempting one is the Motive set. It is legal only if the
three affiliations differ, at most two are gangs, and no earlier set used the
same trio — and it would be easy to compute that in the glue to grey out a
card. Do not. The engine lists every legal Evidence play; a trio that is not in
`legalMoves` is not offered, and the reason is shown only when the engine's own
description gives one.
