# Fractured Fist — what to build

Status 2026-09-21. Written for whoever implements the Fractured Fist table.

**Built 2026-09-21.** Items 1 to 4 and 6 to 8 below are in `main`; item 5
is settled by the engine, not built (see the open question). What the build
decided, in `docs/implementation-plan.md` under "Decided in the Fractured
Fist pass": the draw stays automatic and the deck never lights up (the
engine has no draw step; asked for in the plan's section 13); the gutter
shows the queued numbers and the target's stamina without subtracting, and
the "N through" line appears only in the strike moment, read from the
stamina the engine took off; the moment is a glue hook (`momentFor`) that
plays before its event lands, behind a gate in the playback queue, rather
than a field of the plan; the step chips are Technique and Channel, the
engine's two phases; the reload button says how many reloads were used,
because the engine does not publish the cap. Two of the four shared-type
changes went as proposed (`counts` on a card; `steps` and `prompt` on the
plan), the moment became a hook, and the multi setup field gained groups, a
preset, chips and a summary function so the setup page draws the loadout.

The design is three artboards in `docs/design/`: **Fractured Fist Loadout**,
**Fractured Fist Table** and **Fractured Fist Strike**. The first two run — open
them in Play and press things. The third is a still sheet, because you cannot
read a 580 ms beat while it plays. Edit the working files and republish with the
`design` skill; never hand-edit an assembled output.

Every rule, card, cost and turn step comes from
[fractured-fist.md](fractured-fist.md), which takes the engine over the printed
rulebook. Do not re-derive any of it here, and do not copy a number out of the
artboards: they are drawings, and their sample state is a mid-game snapshot, not
a fixture.

## What is wrong today

[`apps/web/src/glue/fractured-fist.ts`](../../apps/web/src/glue/fractured-fist.ts)
hands the renderer eleven zones in a flat list and lets the generic layout place
them. Four consequences:

- Both supplies go out as full rows. Ten stacks each, twenty count-badged stacks
  on screen at once, and they are the same ten card types twice.
- Seven stat rows per player, all of them all the time. Spirit and channels sit
  at zero through the whole technique phase; refines pending is 0 except during
  the two seconds it matters.
- The moves that actually move the turn — advance, end turn, focus reload, skip
  refine — appear only in the numbered menu. The glue's own comment says so. The
  player's main control is a list item.
- Nothing happens at the strike. The round's climax is two numbers changing.

## What the design changes

1. **One supply shelf, both counts.** Ten stacks, each carrying `you 4 · them 2`.
   Each stack is still owned — the engine has no shared market — but drawing it
   once instead of twice is what the reference means by "a designer may still
   want to draw the two supplies near the centre so both are readable."
2. **The strike gutter**, between the two played rows: *you hit Rook, 2 damage
   less 1 defense = 1 through, Rook 6 to 5*. It answers the question the player
   is actually asking mid-round, which today costs them four separate stat rows
   and some arithmetic.
3. **Counters scoped to their step.** Actions during Technique; spirit and
   channels during Channel. Stamina and the misstep meter stay up always,
   because they are about the whole game rather than this turn.
4. **An action bar** that names the step, says what you can do now, and holds
   the buttons that move the turn.
5. **Every draw on a press** — see the open question below, which has to be
   settled before this one is built.
6. **Play all resources in one press**, with a note on the button when it would
   use up a Focus reload, so the shortcut never quietly forecloses a choice the
   rules gave the player.
7. **The strike as a moment**: six beats, both hits at the same time, the total
   travelling, the defence taking its bite, the pips dropping. Roughly four
   seconds at normal pace.
8. **The loadout as its own screen**: thirty techniques grouped by school, seven
   numbered slots, a running total of what the seven can buy you.

## Settle this first: who resolves the draw

The design puts every draw behind a press — the deck lights up and waits,
including the five at the end of the turn. That follows the brief's rule that
randomness is resolved only when the person presses a Roll or Draw button.

Universe cannot do that on its own. If the engine resolves the end-of-turn draw
inside `end_turn` and does not offer a `resolve_report` for it, then a Draw
button in Universe is either a lie (the cards were already dealt) or a second
copy of a rule, and the repository's first rule is that Universe never holds a
second copy of a rule. Check the engine's legal moves and choices for
Fractured Fist before building this.

Three ways it can land, in order of preference:

- **The engine already offers a draw step.** Then wire it to the existing
  Roll/Draw button, which `resolveReportMove` and the `roll-button` in
  [`Table.tsx`](../../apps/web/src/pages/Table.tsx) already support, and there is
  nothing new to build.
- **The engine can be asked for one.** Raise it there; it is the same shape as
  any other reported randomness. Note it in the engine's list of things Universe
  still needs.
- **It cannot.** Then the draw stays automatic, the deck does not light up, and
  the artboard is wrong on that one point — say so rather than faking the press.
  The Focus reload is unaffected either way: the reload button is itself the
  press.

## What the shared types cannot hold yet

None of these is a Fractured Fist decision. Each one lands on Sweetlands,
Cybernoir and Warble Way too, so decide them as shared-types changes.

1. **`TablePlan` has nowhere for the action bar.** It carries `board`, `bench`,
   `side`, `points`, `palette`, `title` and `status`, and `status` is one line of
   text. The step chips, the "what you can do now" line and the buttons that move
   the turn are not zones and should not be faked as a `track`. Something like a
   `steps` field (named steps, one current) and a `prompt` field (title, sub, and
   the legal moves offered as buttons) would cover it, and would give Sweetlands
   a home for its step prompt too.
2. **`CardData` has one `count`.** The supply shelf needs two, and they mean
   different things — yours is a thing you can spend down, theirs is information.
   The cheap path is `badges`, which already exists and takes strings. The honest
   path is a small `counts` list so the renderer can style the owner's differently.
   Pick one deliberately; the cheap path will be hard to take back.
3. **There is no concept of a moment.** The strike takes over the screen for four
   seconds and then hands the table back. Universe has `Sheet` and `EndPanel` for
   things that wait for a person, and the playback queue for things that pace
   themselves, but nothing for a scripted beat driven by a view diff. This is the
   biggest piece of new ground in the design and it is worth designing as table
   chrome, not as a ninth primitive.
4. **`SetupField` of kind `multi` has no grouping.** Thirty flat checkboxes is
   what produces today's screen. Either add an optional `group` to the options
   and teach [`Setup.tsx`](../../apps/web/src/pages/Setup.tsx) to render sections
   with a slot summary, or let a glue supply its own setup screen for a choice
   this size. The first helps every game; the second is faster.

## What already exists — reuse it, do not rebuild it

- **Pace.** `PlaybackQueue` already has `Pace = 0.5 | 1 | 2`, `BASE_MS`, and a
  pace persisted under `universe:pace`. The strike overlay's Slow/Normal/Fast is
  that pace, not a new one. The prototype uses 1.6/1/0.6; use 2/1/0.5.
- **Pace control and replay.** `PaceControl` and `playback.replayLast` in
  [`parts.tsx`](../../apps/web/src/table/parts.tsx) are the overlay's pace row and
  its "replay the strike".
- **The result banner.** `EndPanel` is already the end-of-game panel. The
  artboard's banner is what it should look like for this game, not a second one.
- **Motion hints.** `arriveFrom` on a card zone already exists, which is how a
  bought card flies from the supply to the discard rather than appearing there.
- **Durations.** `packages/tokens` has `motion.slide`, `drop`, `normal`, `slow`
  and the two easings. The beat timings on the strike sheet should be expressed
  in those tokens, not as new numbers.
- **Step-scoped stats need no type change.** `TableauData.stats` is a list the
  glue builds, so the glue simply emits the stats the current step can change.

## The work, file by file

**1. One supply shelf.** `glue/fractured-fist.ts`. Emit one card zone built from
both players' `supply` maps instead of two. *Acceptance:* one zone in the plan,
ten cards, each showing both counts; buying still lights only the affordable
stacks in the channel phase, and the opponent's stacks are never selectable.

**2. Step-scoped counters.** `glue/fractured-fist.ts`. Build `stats` from the
phase: actions in technique, spirit and channels in channel, stamina and
missteps always, damage and defense to the gutter. *Acceptance:* no stat row
shows a counter the current step cannot change; stamina and missteps never
disappear.

**3. The action bar.** Shared types plus `Table.tsx`. Settle type change 1
first. *Acceptance:* advance, end turn, focus reload and skip refine are buttons
in the bar, each present only when the engine lists it as legal; the numbered
menu still works and is no longer the only way.

**4. The strike moment.** Shared types plus table chrome. Settle type change 3
first. *Acceptance:* both hits animate together; the overlay closes itself
because nothing in it asks the player anything; pace, skip and replay work off
the existing playback pace; a stamina of zero ends on the result banner instead
of the sweep, and that one stays put.

**5. The draw press.** Depends entirely on the open question above.

**6. Play all resources.** `glue/fractured-fist.ts` plus the action bar. It sends
one `play_card` per resource, in hand order, and it is offered only when there is
more than one. *Acceptance:* the button never appears unless every card it would
play is a legal move right now; when a Focus reload is still legal and the batch
includes Focus, the button says so before it is pressed.

**7. The loadout screen.** `Setup.tsx`, plus `setupFields` in the glue. Settle
type change 4 first. *Acceptance:* thirty techniques grouped by school; seven
slots; the default seven is a button, never a preselection; an eighth pick says
why instead of swapping silently; the totals are derived from the picks and not
from a table in Universe.

## Out of scope

Card art (the anatomy is drawn, the art is not), phone layouts (a later pass per
the brief), and the opponent's turn, which the artboard stands in for with a
Continue button where the AI slideshow belongs.

## Before calling it done

Run the security playbook in application-change mode, as `CLAUDE.md` requires,
and record the report under `docs/security-reviews/`. Then check the one thing
that matters most here: that nothing in this work put a copy of a rule into
Universe. Every number on the table should trace to the view or to the engine's
reference data. The place that is easiest to get wrong is the strike, where it is
tempting to compute `damage - defense` locally instead of reading what the engine
reports.
