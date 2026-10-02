# Fractured Fist — the arcade theme: what to build

**Built 2026-09-29** on the branch `ff-arcade-theme`, items 1 to 6 in order,
one commit each. Item 2 went the game-drawn-screen way (the owner's pick);
what the build decided is in `docs/implementation-plan.md`, section 17.
Item 7, the phone, was built on 2026-10-02; its decisions are in the same
section, under "The phone".

Status 2026-09-29. Written for whoever implements the next Fractured Fist
table pass. It builds on [fractured-fist-build.md](fractured-fist-build.md),
which is done; nothing decided there is reopened here except where this file
says so.

The design is the canvas in
[`docs/design/fractured-fist-arcade/`](../design/fractured-fist-arcade/README.md).
Read its README first. Every rule, card, cost and turn step still comes from
[fractured-fist.md](fractured-fist.md), with the engine over the rulebook. Do
not copy a number out of the boards: they are drawings of a sample mid-game
state.

## In one paragraph

Fractured Fist gets its own table theme, the way Neither Guts nor Gears has
one, and the rest of Universe keeps the warm-but-flat look from the brief. The
theme is a dark arcade stage with heavy italic capitals, hard black outlines
and yellow-orange highlights, matching new card art that shows the game's four
species. Four things change: the table's look, a few places on the table, the
card face, and the look of the strike moment. The strike's timings and every
rule about it stay as they are.

## What the owner decided

- **Theme scope.** Only the Fractured Fist table. `themeFor` in the glue returns
  the theme class; the styles are scoped under it, as `ngg/ngg.css` is.
- **Both stamina bars at the top, facing each other**, like health bars in a
  fighting game: you on the left, the opponent on the right, "VS" between.
  Each bar has seven slanted blocks, a misstep meter under it, and the big
  stamina number. The opponent's hand, deck and discard counts sit by their
  name. This replaces the opponent's panels in the side column and your panel
  in the bench.
- **The side column runs the full height** and holds, top to bottom: the
  supply, the last move with pace and replay, and the log. The bench (your
  hand, deck, discard) sits under the play column only.
- **The supply is a list**, one row per stack: cost, a small crop of the card
  art, the name, the effect chips, and both counts (you, them). In the Channel
  step, stacks you can buy are outlined and glow; the rest dim. There is no
  separate "Buy" word; the outline is the cue. The opponent's stacks are never
  selectable.
- **The action bar** shows the two step tags (Technique, Channel) as the step
  indicator, the counters for the current step (Actions; or Spirit and
  Channels), one line of what you can do, and the buttons. End turn is the one
  primary button. The Focus reload explanation is the button's tooltip.
- **The card face** follows the print-and-play sheet: cost in a coloured
  corner triangle, the name in italic capitals, a strip of the card's art,
  the effect chips. Resources show their spirit value top right.
- **Card art**: 34 scenes, one per card, in `docs/design/fractured-fist-arcade/art/`.
- **Species per card**: see the table below. Schools are mostly one species.
- **The strike moment** gets the arcade look described below. Same beats, same
  lengths, same rules.

## The theme's values

Take these from `Table-Technique.dc.html` rather than retyping them where you
can; listed here so the tokens can be named.

| Use | Value |
|---|---|
| Page ground | `#131116`; the play column's stage `#18151c`; bench `#0f0e12` to `#0b0a0d` |
| Panels | `#221e27`, raised parts `#2c2732`; 2 px black border, 4 px 4 px 0 black shadow, 6 px radius |
| Text, muted text | `#f4efe6`, `#a9a2b3` |
| Highlight, second highlight | `#FFD23F`, `#FF5A1F` |
| Damage, defense | `#ff5646`, `#4ea3ff` |
| Display type | Barlow Condensed 800 italic, upper case (Google Fonts, OFL) |
| Small labels | Barlow Condensed 600–800, upper case, letter-spacing 0.08em |
| Sentences | the site's body face, unchanged |

Buttons and tags are slanted (`skewX(-10deg)` to `-12deg`, text counter-skewed).
The top bar is black with a 3 px highlight rule under it.

Barlow Condensed is new to the repository: add it to `ATTRIBUTIONS.md` with its
licence (SIL Open Font License) when it lands.

**Card type colours** (corner triangle), from the print-and-play sheet:
resource `#F2E53A`, starter technique `#19A58B`, optional technique with no
school `#2A74B8`, technique with a school `#8A6BB0`, Misstep `#111111`.
**Cost number colour on school cards**: Masters' Circle white, The Uncounted
black, Titan Entertainment `#FF8A1F`, The Awakened `#A6E22E`.

## Species on each card

| Card | Species shown | Card | Species shown |
|---|---|---|---|
| Attack | Human | Impose Pressure | Unmoored, seen as Bouaux |
| Block | Bouaux | Leg Sweep | Human (guest) |
| React | Grankiki | Overwhelming Assault | Unmoored, seen as human |
| Quicken | Bouaux | Ruthless Barrage | Unmoored, seen as Grankiki |
| Center | Human | Showstopper | Grankiki |
| Distract | Unmoored, seen as human | Targeted Strike | Grankiki |
| Assess | Grankiki | Grand Finale | Grankiki (three of them) |
| Focus | Human | Devastating Blow | Bouaux (guest) |
| Momentum | Grankiki | Energy Channeling | Bouaux |
| Mastery | Bouaux | Enlightened Flow | Bouaux |
| Misstep | Human | Inner Harmony | Human (guest) |
| Defensive Kata | Human | Transcendent Strike | Bouaux |
| Perfect Form | Human | Read Opponent | Human |
| Master's Riposte | Human | Deflecting Block | Grankiki |
| Flowing Counter | Bouaux (guest) | Smoke Bomb | Unmoored, seen as human |
| | | Combination Rush | Grankiki |
| | | Thoughtful Composure | Bouaux |
| | | Mental Clarity | Unmoored, seen as Grankiki |
| | | Flying Kick | Human |

## The strike moment

The beats and their lengths do not change: `STRIKE_BEATS` in
[`StrikeMoment.tsx`](../../apps/web/src/table/StrikeMoment.tsx) already has
locked = slow + flip, travel = tumble, absorb = slow + fast, land = tumble,
fade = drop. About 3.1 seconds at 1×. What changes is what each beat shows:

1. **Locked.** The board dims under speed lines. A slanted yellow banner,
   "Round N · Strike!", slides in. Both fighters slide in from their sides with
   their stamina blocks, a blue defense shield in front of each, and each
   player's queued damage pops up as a red burst with the number.
2. **Travel.** Both bursts fly across at once and cross with a white flash.
3. **Absorb.** Each shield flares and a "Block N" tag drops onto it. Each burst
   shrinks and its number changes from what was queued to what got through.
4. **Land.** What got through bursts on the target (a yellow burst with "−N"),
   the target's plate shakes, and the lost stamina blocks break off one at a
   time. A hit that was fully stopped gets a "Blocked!" stamp on the shield.
5. **Fade.** The fighters slide out, the board comes back, and only then does
   the event land, so the played rows sweep to the discards as they do today.

If the strike ends the game, "K.O." stamps across the middle on the land beat
and the moment hands over to the existing end panel, which stays put.

Rules that stay exactly as they are:

- "Got through" is the stamina the engine took off (`lane.through`), never
  `damage − defense` worked out in Universe. The "Block N" number is the same
  display-only difference the overlay shows today.
- Nothing in the moment asks the player anything. Pace is the queue's
  0.5 / 1 / 2, "Skip to the end" closes it, "Replay the strike" is
  `replayLast`.
- Pieces move in: slide, drop, pop. Only the dimming fades. Reduced motion
  keeps the timing and turns movement into fades, as today.
- The caption line under the action stays, in plain words, with `aria-live`.

## The work, file by file

**1. The theme.** `apps/web/src/glue/fractured-fist.ts` gains `themeFor`,
returning a class such as `ff-theme`. A new stylesheet beside the glue
(following `glue/ngg/ngg.css`) scopes every rule under that class: the top
bar, panels, buttons, action bar, log, last move, bench and the card face.
*Acceptance:* the Fractured Fist table matches the two table boards; every
other game's table and every other page is pixel-for-pixel unchanged.

**2. Both stamina bars at the top.** `TablePlan` has no place for this. Two
ways. **The owner picked the second, a game-drawn screen, on 2026-09-29**
(see `docs/implementation-plan.md`, section 17):

- *Recommended:* an optional `versus` field on `TablePlan` (each side: name,
  stamina, max, misstep count and cap, one line of public counts), drawn as
  table chrome between the top bar and the board, the way the action bar is.
  The stamina blocks can be the track primitive underneath. Every value comes
  from the view; the misstep cap from `reference_data.max_missteps`.
- Or draw Fractured Fist as a game-drawn screen, as Neither Guts nor Gears is.
  More freedom, much more code, and it leaves the primitives behind.

*Acceptance:* both stamina values and misstep counts are on screen at all
times; the opponent's tableau is gone from the side column and yours from the
bench, and nothing they showed is lost.

**3. Side column and bench.** The supply leaves the board for the side column.
The bench sits under the play column only when this theme is on; other games
keep the full-width bench. *Acceptance:* at 1440 × 900 nothing scrolls, and
the supply, last move and log are all visible.

**4. The supply as a list.** `CardZoneData.mode` gains `list` (a Universe
addition the engine ignores, like `counts`). A list row is a card drawn flat:
cost, art crop, label, chips, counts. *Acceptance:* ten rows, each with both
counts; in the Channel step only the stacks with a legal `buy_card` are lit;
the opponent's counts are never selectable.

**5. The card face.** `CardData` already has `cost` and `artUrl`. The glue sets
`cost` from the engine's reference data instead of putting "cost N" in the
badges, and sets `artUrl` from the card id. Copy the 34 SVGs from the canvas
folder into the web app's static assets under the engine's card ids. The
themed card draws the corner triangle in the type colour, the italic name,
the art strip (`preserveAspectRatio="xMidYMid slice"`) and the chips.
*Acceptance:* every card on the table, in the hand, in the discard, in the
supply and on the setup page's loadout shows its art and its cost corner;
face-down cards show the themed back (black, teal corners, count in a yellow
burst).

**6. The strike moment.** `StrikeMoment.tsx` and its styles, restyled under
the theme as described above. `STRIKE_BEATS` is untouched. *Acceptance:* both
lanes run together; a fully blocked hit shows "Blocked!"; lost blocks break
off one at a time; K.O. hands over to the end panel; pace, skip and replay
work; reduced motion still works.

**7. The phone (added and built 2026-10-02).** The owner brought the phone
layout forward for Fractured Fist only; the brief's later phone pass still
holds for everything else. The boards are the six `Phone-*` files in the
canvas folder, at 390 × 844. Build it inside `FfScreen` and `ff.css` for
narrow screens, with the same reading of the view (`glue/ff/read.ts`); the
desktop table does not change.

- *The table, stacked:* top bar (title, round, "Your move", a menu button);
  both fighters' plates at the top, smaller; their played row, the strike
  line as two short rows, your played row, with cards about 62 × 88; the
  action bar (step tags; the step's counters beside one line of help; the
  buttons in one row); the hand fanned along the bottom, with small deck and
  discard piles beside its label. Nothing scrolls at 390 × 844.
- *The supply is a sheet.* In the Channel step the action bar shows a Supply
  button with how many stacks the engine lists a `buy_card` for. The sheet
  is the same list, with taller rows; tapping a lit row buys, as on desktop.
- *The menu is a sheet* holding what the side column held: undo, rules,
  settings, share, the last move with pace and replay, the log, and leave.
- *A tap on a card opens it up close.* On a phone, tapping a card (yours,
  theirs, played or in hand) opens a sheet with the full printed face from
  the card art and a line of what it does. When the engine lists a play for
  that card, the sheet has a Play button that sends that move; otherwise
  only Close. This is the one change in how you play on a phone: two taps
  instead of one, so a small card is never played by mistake. The batch
  "Play all resources" keeps its button in the action bar.
- *The strike, upright:* the opponent's plate at the top, yours at the
  bottom, both shields between, the hits crossing up and down. Same
  `STRIKE_BEATS`, captions, pace, skip, replay, Blocked and K.O. as desktop.
- Every control is at least 44 px tall; no fake status bar or keyboard.

*Acceptance:* at 390 × 844 the Technique and Channel steps match their
boards without scrolling; the supply and menu sheets open and close and
nothing in the side column is lost; a tap on a lit card opens the card sheet
and its Play button sends the listed move, and a card with no listed play has
no Play button; the strike plays upright with pace, skip and replay; the
desktop table is unchanged. Record what the build decides in
`docs/implementation-plan.md`, section 17.

## Out of scope

The other three games, the
printed cards themselves (the art is the same files, but no print output is
built here), and the opponent's turn beyond what the table already does.

## Before calling it done

Run the security playbook in application-change mode and record the report
under `docs/security-reviews/`; the last report says a full review is also due.
Then check the one thing that matters most: every number on the table and in
the strike traces to the view or the engine's reference data, and no rule was
copied into Universe.
