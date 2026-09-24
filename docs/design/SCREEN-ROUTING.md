# Screen routing — Neither Guts nor Gears

How the fifty artboards in the design canvas fit together into one client.

**Audience:** whoever builds the NGnG table in Universe.
**Companions:** `SPEC-instance-gates.md` (what the view must return before most of
this can be built) and `DESIGN-ALIGNMENT.md` (where canvas and engine disagree),
both in `zekel/src/games/neither-guts-nor-gears/`.

---

## 1. There is no navigation

The first thing to unlearn: these screens are not pages and there are no links
between them. Nothing in this client decides what to show next.

The engine holds the state. The client asks for a view, and the view *already
is* a screen — one pure function maps it. A seat never navigates; it acts, the
state changes, and a different screen is the consequence.

```
route(view, viewerSeatId) -> Screen
```

Pure, total, no history, no stack of its own. Give it the same view twice and
you get the same screen twice. Reconnect mid-game and the correct screen comes
back without replaying anything. That property is worth defending: every bug
where "the UI got out of sync" is a bug where something other than `route`
decided what to show.

Three inputs decide everything:

| Input | From | What it settles |
|---|---|---|
| `pending` | `view.pending.kind` | Someone owes a decision. Highest priority. |
| `battle` | `view.battle.phase` | A battle is open; which stage of it. |
| `phase` + `active_action` | `view.phase`, `view.active_action` | Whose action is resolving and of what kind. |

Plus one more that is not part of the state at all: **which seat is looking**.
The same view renders four different screens at a four-player table. Section 5.

---

## 2. Three kinds of screen

The fifty artboards are not fifty destinations. They fall into three classes,
and the class decides how you build each one.

### 2a. Pending screens — the engine is waiting

The engine has set `pending`, named the seat that owes it, and will refuse
every move except the ones that settle it. One artboard, one pending kind, one
move out. These are the simplest: read the pending, render, submit, done.

### 2b. Composer screens — one move, several screens

Some engine moves carry more fields than a person can supply at once. `build`
wants an item, a payment of several collectors, and a base to spawn at. The
client walks the seat through that in stages and submits **one** move at the
end. Nothing reaches the engine until the last stage.

```
Choice Build  →  Choice Payment  →  Place It        ⟹  one `build` move
Move Battle                                          ⟹  one `move_units` move
```

Composer stages are client state, not engine state. They must be re-enterable
(section 6) and cancellable with no server call.

This distinction is the single most useful thing in this document. If you treat
Choice Payment as a pending screen you will invent a server round-trip that
does not exist; if you treat Access Request as a composer stage you will lose
the interrupt.

### 2c. Ambient surfaces — always there, never a destination

The map, the faction board, the action stack, the treaty ledger. They are
visible behind and beside every screen and they are never routed to. Their
artboards (`Main`, `Robot Board`, `Table`, `Table Six`, `Map Zoom`) are
specifications for persistent regions, not for pages.

---

## 3. The router, in full

Evaluate in this order and stop at the first match.

### 3a. Pending wins

| `pending.kind` | Screen | Class | Notes |
|---|---|---|---|
| `choose_leader` | Setup Draft | pending | |
| `choose_starting_location` | Setup Start | pending | |
| `report_draw` | *overlay* | pending | No board of its own — see 3e |
| `upkeep_reallocate_cores` | Core Reallocation | pending | Robot seats only |
| `access_request` | Access Request | **interrupt** | Not your turn |
| `second_purchase` | Second Purchase | pending → composer | Yes re-enters Choice Build |
| `smyth_reward` | Smyth Reward | pending | |
| `elara_spell` | Elara Spell | pending | Nested inside `move_battle` |
| `treaty_response` | Treaty Response | **interrupt** | Not your turn |
| `treaty_break_decision` | Treaty Break | pending, **repeatable** | Stays until the seat passes |
| `battle_commit` | Battle Commit **or** Shared Tactics | pending | See 3d |
| `counter_target` | Card Batch | pending | |
| `extra_selection` | Battle Extra | pending | |
| `initiative_tie` | Battle Activation | *state* | A mode on the ladder, not a screen |
| `battle_defense` | Battle Defense | **interrupt** | Not your turn |
| `retreat` | Move Retreat | pending | |
| `rally_selection` | Move Rally | pending | |
| `choose_milestone_hero` | Hero Claim → Place It | pending → composer | |
| `overlay_choice` | Overlay Choice | pending | |
| `place_reserved_hero` | Reserved Hero | pending | |
| `choose_spy` | Spy Assign | pending | Seat-private |

A pending owed by **another** seat is not nothing. Every other seat shows its
own last screen with a waiting state and the engine's own sentence — the view
gives you `pending.question` verbatim for exactly this.

### 3b. Then the battle

When `pending` is null and `view.battle` is not:

| `battle.phase` | Screen |
|---|---|
| `commit` | Battle Commit / Shared Tactics (via the `battle_commit` pending) |
| `cards` | Card Batch / Battle Extra when a pending is open; otherwise a resolution ticker over the table |
| `activations` | Battle Activation, or **Robot Infiltrator** when the activating unit is a hero carrying a spy |
| `retreat` | Move Retreat |
| `done` | fall through to 3c |

### 3c. Then the phase

| `phase` | Screen |
|---|---|
| `setup_factions` | Setup Table |
| `setup_leaders` / `setup_locations` / `setup_done_pending_grants` | reached only through their pendings |
| `upkeep` | no screen — an upkeep ticker over the table; the one decision is 3a's `upkeep_reallocate_cores` |
| `planning` | Choice Planning |
| `action` | by `active_action.cardKind` — see 3d |
| `culture` | no screen — an income ticker |
| `claims` | Hero Claim (via pending) |
| `treaty_break` | Treaty Break (via pending) |
| `end_of_round` | no screen |
| `game_over` | The End, results half |

### 3d. Inside an action

`active_action.cardKind` has exactly three values. There is **no diplomacy
action card**.

| `cardKind` | Wizard seat | Robot seat |
|---|---|---|
| `build` | Choice Build → Choice Payment → Place It | Robot Build → Robot Payment → Place It |
| `research` | Choice Research | Choice Research |
| `move_battle` | Move Battle → (Elara Spell) → battle | Move Battle → battle |

Species branches on `view.players[me].species`, not on faction. Two artboards
exist for build and payment because a robot's collectors are typed and a
wizard's are not — the difference is real and it is in the reach maths, not
the styling.

**Diplomacy is not routed to.** Treaties form only at the start or end of an
active player's action, so `Diplomacy` and `Treaty Offer` are a panel the
active seat can open at those two moments and at no other. Gate it on
`phase === 'action' && !battle && activePlayerId === me`, which is the same
predicate `describeMoveGates` uses for `form_treaty`.

**Shared Tactics** replaces Battle Commit for a viewer who holds a
shared-tactics treaty with anyone in this battle. It is the same pending and
the same move; it is a different screen because there is a second hand on it.

### 3e. Screens with no artboard, by design

| Case | Render as |
|---|---|
| `report_draw` | An overlay on whatever surface asked for the draw: Setup Draft at setup, Choice Research on a card purchase, Hero Claim on Chaimidious. A digital seat sees a Draw button; a physical seat reports what it drew. Never silent — see §12. |
| `initiative_tie` | A mode on Battle Activation's ladder: the tied units become pickable. |
| skip a queued action | A "decline" control on Choice Planning's queue, not a screen. |
| `upkeep`, `culture`, `end_of_round` | Tickers over the table. State changes the seat watches, not decisions it makes. |

---

## 4. Screen inventory, by trigger

Thirty-five artboards on the Player choices page. Every one of them is reached
by exactly one route above. If you find yourself wanting a link *from* one *to*
another, you have found a composer chain (section 2b) or a bug.

```
SETUP        Setup Table → Setup Draft → Setup Start
PLANNING     Choice Planning
BUILD        Choice Build ─┐                    Robot Build ─┐
             Choice Payment┤→ Place It          Robot Payment┤→ Place It
             Second Purchase (re-enters the chain)
             Access Request (interrupts it, on another seat)
RESEARCH     Choice Research · Smyth Reward
MOVE         Move Battle → Elara Spell → battle
BATTLE       Battle Commit / Shared Tactics
             → Card Batch → Battle Extra   (the batch loop, repeats)
             → Battle Activation / Robot Infiltrator
                 ↳ Battle Defense (interrupts, on the defending seat)
             → Move Rally · Move Retreat
DIPLOMACY    Diplomacy → Treaty Offer → Treaty Response (on the partner)
             Treaty Break (end of round)
HEROES       Hero Claim → Place It · Reserved Hero · Spy Assign · Spy Reveal
             Overlay Choice
UPKEEP       Core Reallocation
END          The End
```

---

## 5. One state, four screens

Every seat renders the same view differently, and this is not decoration — it
is the privacy contract. `getPlayerView` returns a superset of
`getPublicView` with four private keys: `your_battle_hand`,
`shared_tactics_hands`, `your_spy_assignments`, `your_knowledge`.

Four perspectives, for any state:

1. **Mine to decide.** The pending names me, or the active action is mine. Full
   screen, controls live.
2. **Mine to watch.** Someone else owes the pending. Same surface, controls
   dead, and `pending.question` printed as the waiting line.
3. **Mine to answer, out of turn.** An interrupt: `access_request`,
   `treaty_response`, `battle_defense`. These arrive uninvited and must
   *replace* whatever I was looking at, including mid-composition.
4. **Not mine at all.** The table view; ambient surfaces only.

The three interrupt screens are the only ones that take over a seat that was
doing something else. Build them as a layer above the composer, not as a route
that discards it.

A note on secrets. A seat's screen may show what that seat may see and nothing
more. Battle Commit shows my hand; the same board at another seat shows
`'committed (secret)'` and a count. Robot Infiltrator shows which opposing
seats hold an inspectable spy; Spy Assign shows my carrier and nobody else's.
Never render from `getPublicView` plus a client-side filter — ask for the
seat's own view.

---

## 6. Resume: the nested pendings

Three pendings carry a `resume: ResumeAction`, which is the engine saying *I
have parked your move and will re-run it when this settles*:

```ts
{ kind: 'access_request', /* … */ resume: ResumeAction }
{ kind: 'elara_spell',    /* … */ resume: ResumeAction }
{ kind: 'choose_spy',     /* … */ resume: ResumeAction }
```

`ResumeAction` is `{ action: 'build' | 'research' | 'move_battle', move }`.

The flow, using the case the Access Request board draws:

1. I compose a `build` in Choice Build → Choice Payment and submit it.
2. The engine finds a placement on a tile I do not hold and arms
   `access_request` on **that tile's owner**, with my whole move in `resume`.
   `activePlayerId` moves to them.
3. My screen becomes "mine to watch". Theirs becomes the Access Request
   interrupt.
4. They answer. On a grant the engine re-runs my parked move; on a refusal
   nothing commits and my composer must come back with its proposal intact.

Three consequences for the client:

- **Access requests are a queue.** `armAccessRequest` takes `missing[0]` and
  re-arms on each resume, so a proposal touching two seats produces two
  sequential interrupts. Show which of how many.
- **A parked composer may come back stale.** The engine re-solves payments on
  a stale access-resume rather than rejecting them. Do not assume the proposal
  you submitted is the one that commits; re-read the view after the resume.
- **A refusal is not an error.** It is a legal outcome of a legal move. The
  composer re-opens on the payment stage with the refused placement marked, and
  the engine records the refusal in `active_action.refusedAccess` so the same
  tile is not proposed again blindly.

`second_purchase` is the same shape without the `resume`: the first purchase
has already committed, and the pending offers a second pass through the build
composer. If the second falls through, the first stands.

---

## 7. Ambient surfaces

Four regions are on screen throughout and change underneath whatever screen is
routed. Build them once.

| Region | Artboard | Reads |
|---|---|---|
| The map | `Table`, `Table Six`, `Map Zoom` | `view.map.tiles` — label, current resource, base owner, units, heroes, collectors |
| Your faction board | `Main` (wizard) / `Robot Board` (robot) | your `publicPlayerView` plus the four private keys |
| The action stack | header strip | `view.action_stack` — face-down except your own and the resolving one |
| Treaties and victory | `Diplomacy` panel | `view.treaties`, `view.victory_status` |

The map's tile labels come from the engine (`map.tiles[].label`), which runs
the same `tileLabel` the canvas does. Never compute a label in the client and
never show a raw `"c,r"` coord to a person — several pendings still publish
coords, and converting them is the client's job until §2 of the gates spec
lands.

---

## 8. The visual grammar, as rules

Four states, one meaning each, used identically on every board. They are the
reason the screens read as one system, and they are trivial to break.

| Look | Means | Never means |
|---|---|---|
| **Grey** (`grayscale(1) brightness(1.14) contrast(.82)`) | not part of this choice | hidden, unknown, or disabled-for-now |
| **Dashed outline** | not on the board yet — a proposal, an in-hand token, an unclaimed hero, an empty slot | damaged, temporary, or selected |
| **Struck through + danger red + a reason** | shut, and here is the engine's sentence why | ineligible with no explanation |
| **Solid fill + own mark** | on the board, committed | highlighted |

Two rules that follow:

- **Grey never hides.** A greyed tile keeps its label, its glyph and its
  pieces. Greying is a statement about *this decision*, not about visibility.
- **A shut option always carries its reason**, and the reason is the engine's
  string, not the client's paraphrase. This is what `SPEC-instance-gates.md`
  exists to supply; until it lands, several boards cannot be built correctly
  and should ship with the option omitted rather than with invented copy.

And the copy rule, which governs every string on every screen: a screen may
print only **state the client holds**, **text printed on a card or in the
rules**, or **the engine's reason an option is illegal**. Strategy advice
belongs nowhere in this client.

---

## 9. Motion

From the Universe brief: *nothing appears in place*. A fade-in is a bug in the
motion language. The screens that need it most:

| Moment | Motion |
|---|---|
| Collectors committing | each token flies from the faction board to its tile, in payment order |
| Battle cards revealing | all commitments flip together, never in sequence |
| A card being countered | it travels to the public discard, face up |
| A hero being placed | from the claim panel to the base hex |
| Cores reallocating | out of one platform, across the map, into the other |
| A unit dying | removed after the whole attack resolves, not on the hit — §9.5 resolves protection before simultaneous casualties |

The last one is a rules constraint wearing an animation's clothes: an area
attack must not remove anything until every protection choice is made, so the
client cannot animate deaths as they are calculated.

---

## 10. What the client must never do

- **Never re-implement a rule.** Universe holds no second copy. If the screen
  needs to know whether a treaty can break, the engine says so; the client does
  not evaluate "is a unit collecting on a partner's tile".
- **Never parse prose.** `LegalMove.description` and `pending.question` are for
  people. Anything the layout depends on comes from a structured field or does
  not exist yet.
- **Never submit a move to discover whether it is legal.** That is the current
  temptation and the reason for the gates spec.
- **Never resolve randomness silently.** A draw happens when a person presses
  Draw; `report_draw` exists so a physical seat can report instead.
- **Never make a choice the rules give the player**, including by convenience
  default. If only one option is legal, show the one option and let them take
  it.

---

## 11. A worked round

Four seats: **The Covenant** (you, wizard), **The Foundry** (robot),
**The Unbolted** (robot), **The Ledger** (robot, Leader dead since round 13).

| # | Engine state | Your screen | The Foundry's |
|---|---|---|---|
| 1 | `phase: upkeep`, pending `upkeep_reallocate_cores` for Foundry | table + upkeep ticker, waiting line | **Core Reallocation** |
| 2 | `phase: planning` | **Choice Planning** | Choice Planning |
| 3 | `phase: action`, `active_action: build by you` | **Choice Build** (composer) | table, waiting |
| 4 | same, composer stage 2 | **Choice Payment** | table, waiting |
| 5 | you submit; engine arms `access_request` for Foundry | table, waiting, `pending.question` | **Access Request** (interrupt) |
| 6 | they grant; engine resumes your build | **Place It** (composer stage 3) | table, waiting |
| 7 | move commits; pending `second_purchase` for you | **Second Purchase** | table, waiting |
| 8 | `active_action: move_battle by you`, pending `elara_spell` | **Elara Spell** | table, waiting |
| 9 | you move into E2; `battle.phase: commit` | **Battle Commit** | Battle Commit |
| 10 | all committed; `battle.phase: cards`, pending `extra_selection` for you | **Battle Extra** | table, waiting |
| 11 | batch two; pending `counter_target` for you | **Card Batch** | table, waiting |
| 12 | `battle.phase: activations` | **Battle Activation** | Battle Activation on their units |
| 13 | your Evoker attacks their Warden; pending `battle_defense` for Foundry | waiting | **Battle Defense** (interrupt) |
| 14 | `battle.phase: retreat` | **Move Retreat** | Move Retreat |
| 15 | `phase: culture` | income ticker | income ticker |
| 16 | `phase: claims`, pending `choose_milestone_hero` for you | **Hero Claim** → Place It | table, waiting |
| 17 | `phase: treaty_break`, pending for you | **Treaty Break** (repeatable) | table, waiting |

The Ledger's column is the same as The Foundry's throughout. A dead Leader
removes the ability to *trigger* a victory and nothing else — that seat keeps
its pieces, keeps its turns, and keeps every screen in this table.

---

## 12. Build order

1. **The shell**: map, faction board, action stack, header. Everything else
   renders inside it and nothing works without it.
2. **The router**, with every branch returning a stub. Get the state machine
   right before any screen is pretty; it is the part that is expensive to
   change later.
3. **One composer, end to end**: Choice Build → Choice Payment → Place It,
   including the Access Request interrupt and the resume. That chain exercises
   every hard mechanic in the client at once — composition, interruption,
   parking, staleness, and a second seat.
4. **The battle loop**: Commit → Card Batch → Battle Extra → Activation →
   Defense → Retreat. Longest chain, most pendings, and the one where the
   privacy contract matters most.
5. **Everything else**, which by then is a matter of filling in a table.

Step 3 will surface the gates problem in the first hour. Read
`SPEC-instance-gates.md` before starting it, not after.
