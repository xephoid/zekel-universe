# Implementation issues

Review date: 2026-09-16. Assessed against
[the implementation plan](docs/implementation-plan.md) and
[the design brief](docs/design-brief.md).

The app follows much of the planned architecture, but it is not yet a working
M1 implementation. Workspace packages, the engine wrapper, database tables,
primitives, game glue, and tests exist. The milestone acceptance checks are
not met by that structure alone.

All issues below were open at the time of review. P1 means a blocker to core
use or privacy. P2 means a significant gap against the plan.

## 1. P1 — A socket can receive another seat's private view

**Affects:** M2, seat privacy.

A socket stays subscribed to previous table rooms, while its stored seat
position is overwritten whenever it joins another table. Broadcasts use
that single position for every table room the socket belongs to.

**Reproduced:** A player owning seat 1 at the first table joined a second
table where they owned seat 0. When the first table broadcast its next move,
that player received seat 0's private view from the first table.

Source: [apps/server/src/app.ts](apps/server/src/app.ts), the broadcast and
`join_table` handlers.

**Required fix:** Determine ownership for the table being broadcast. Either
track subscriptions and owned seats per table or leave previous rooms when
switching tables. Do not trust a seat position from another table.

**Acceptance:** A socket joining multiple tables, including as a spectator,
never receives a view belonging to a seat it does not own. Keep this case
alongside the existing two-seat privacy test.

## 2. P1 — Browser requests and REST responses do not agree

**Affects:** M1 and every page using the same API client.

- The browser expects arrays where the server returns `{ games }`,
  `{ tables }`, and `{ events }`.
- The table endpoint returns `{ table, seats }`, but the browser treats the
  response as a table directly.
- The browser requests a game-detail endpoint that does not exist.
- Setup sends a numeric seat count instead of the required seat array and
  omits `hostPosition`.
- Table creation returns `tableId`, but navigation reads `id`.

**Reproduced:** The catalog response was not an array, game detail returned
404, and the browser's setup payload returned 400.

Sources: [api.ts](apps/web/src/api.ts),
[Setup.tsx](apps/web/src/pages/Setup.tsx), and
[app.ts](apps/server/src/app.ts).

**Required fix:** Define and use matching request and response contracts on
both sides. Add the missing game-detail route and preserve the returned
table identifier through navigation.

**Acceptance:** A new visitor can load the home page, open Fractured Fist,
submit setup, and arrive at the created table in a browser test.

## 3. P1 — Live gameplay messages do not connect

**Affects:** M1 and M2.

- The browser listens for `event`; the server emits `table_event`.
- Move submissions omit the required table ID and always claim seat zero.
- Undo sends a `move` message instead of the server's separate `undo`
  message.
- The server returns move rejections through acknowledgements. The browser
  does not handle those acknowledgements and instead listens for a
  `rejected` event.

Sources: [socket.ts](apps/web/src/socket.ts),
[Table.tsx](apps/web/src/pages/Table.tsx), and
[app.ts](apps/server/src/app.ts).

**Required fix:** Align event names, message payloads, acknowledgements, and
seat selection. Use the actual owned seat returned by the server.

**Acceptance:** Each human seat can submit a move, receive ordered events,
see a rejection reason and lesson, and invoke undo through the browser.

## 4. P1 — Human-first games have no initial board event or usable move menu

**Affects:** M1.

Session startup writes events only when an AI opens. A human-first table
therefore has no initial board event. The server does not call
`getLegalMoves` in its application flow, while the table expects a
`legal_moves` event field that is never sent. Teaching also expects a
`briefing` field that the wire event does not supply.

**Reproduced:** A newly started human-first table had zero events.

Sources: [realtime.ts](apps/server/src/realtime.ts),
[events.ts](apps/server/src/events.ts), and
[Table.tsx](apps/web/src/pages/Table.tsx).

**Required fix:** Supply each seat's initial view and legal moves, then keep
the legal menu and teaching information current as play advances. Preserve
seat privacy when delivering these fields.

**Acceptance:** A player sees their starting board and legal choices before
any move has been submitted. Rules briefings and the numbered menu work
through a complete game.

## 5. P1 — Setup does not preserve the planned player choices

**Affects:** M1, M2, M3, and M4; player agency.

The setup-checklist endpoint does not exist. The browser converts a failed
request into an empty checklist, which is treated as fully answered.
Session creation passes only seat zero's setup choices. Guests are not
prevented from hosting friend tables, and AI-only tables are not restricted
to live mode.

Sources: [Setup.tsx](apps/web/src/pages/Setup.tsx) and
[service.ts](apps/server/src/tables/service.ts).

**Required fix:** Implement the engine-driven setup flow for each human
seat. Distinguish a failed checklist request from a game with no setup
choices. Enforce guest-hosting and table-mode restrictions on the server.

**Acceptance:** Every required player choice reaches the engine without a
convenience default. Guests may join a friend's table but cannot host one;
tables against only AI are live.

## 6. P1 — Production startup is broken

**Affects:** M0 and deployment.

The compiled server imports an engine-client package that exports
TypeScript source. Running `node apps/server/dist/index.js` with Node
24.19.0 failed with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` on a TypeScript
parameter property.

Compose supplies `sqlite:/data/dev.db`, while the database parser accepts
`sqlite://` URLs or its explicit in-memory forms. The engine build context
also does not resolve to the documented sibling checkout when resolved
relative to the compose file. Postgres support remains unimplemented.

Sources: [engine-client/package.json](packages/engine-client/package.json),
[server.Dockerfile](infra/server.Dockerfile),
[docker-compose.yml](infra/docker-compose.yml), and
[db/index.ts](apps/server/src/db/index.ts).

**Required fix:** Build and export runtime-compatible workspace packages,
correct compose paths and configuration, and implement the planned durable
production database support.

**Acceptance:** The built server starts with the supported production Node
version. The documented compose command starts the stack, and the server
can create a digital engine session and read its view. Verify production
persistence separately from local SQLite operation.

## 7. P2 — Primitive fields and motion diverge from the plan

**Affects:** M1 and M4; the shared primitive contract.

The primitive fields differ from those in the engine checkout inspected
during review. Examples include `title` versus `label`, `kind` versus
`mode`, and `regions` versus `nodes`. A board description cannot transfer
unchanged as required by the plan.

Motion is largely limited to rearrangement within individual card zones.
Moving a card between zones does not share a movement origin. Grid and map
piece movement and the required dice/card animations are not implemented.

Sources: [types.ts](packages/primitives/src/types.ts),
[components.tsx](packages/primitives/src/components.tsx), and
[useFlip.ts](packages/primitives/src/useFlip.ts).

**Required fix:** Align primitive data contracts with the engine without
importing game rules. Implement movement between containers as well as
within them, including reduced-motion behavior.

**Acceptance:** Engine board descriptions render unchanged. Visually verify
all eight primitives in both themes, with reduced motion on and off,
including cards moving from piles to hands and pieces moving across boards.

## 8. P1 — Any website can open an authenticated socket to the server

**Affects:** M2 privacy; every table.

Socket.IO is configured with `cors: { origin: true, credentials: true }`,
which reflects whatever origin connects and allows cookies. A page on any
other site can open a socket that carries a visitor's Universe cookies, join
a table, and receive that visitor's private views and submit moves as them.
The REST side is protected by SameSite=Lax, but websockets are not.

Source: [apps/server/src/index.ts](apps/server/src/index.ts), the Socket.IO
options.

**Required fix:** Allow only the app's own origin (from configuration), or
serve the socket same-origin only.

**Acceptance:** A connection from a foreign origin is refused; a test asserts
it.

## 9. P1 — Every engine failure is shown to the player as a rules rejection

**Affects:** M1; trust in the table.

The move handler treats any error with a `reason` property as a rejected
move. `EngineError` now exposes `reason` as a getter, so a lost connection,
a schema mismatch, or an engine bug all become `move_rejected` with a
"reason" the player reads as a rule they broke.

Source: [apps/server/src/realtime.ts](apps/server/src/realtime.ts), the
catch in the move handler.

**Required fix:** Branch on the engine's error code. Only the engine's own
recoverable move codes (illegal move, not your turn, ambiguous move, invalid
shape) are rejections to show the player; everything else is a server fault
reported as such.

**Acceptance:** With the engine stopped, a move attempt shows a server
problem, not a rule.

## 10. P1 — Anyone seated can undo anyone's move

**Affects:** M2; player agency between humans.

Undo checks only that the caller holds some seat at the table. In a
two-human game, either player can undo the other's move, and the engine's
undo reverts the last human move plus the AI moves after it as one unit.

Source: [apps/server/src/realtime.ts](apps/server/src/realtime.ts),
`handleUndo`.

**Required fix:** Decide the rule and enforce it. The simplest rule that
matches the brief: only the seat that made the last human move may undo it,
and only before the next human acts.

**Acceptance:** A second human's undo is refused; the acting player's is
accepted.

## 11. P2 — The playback pace has a skip-to-end

**Affects:** M1; a decided brief rule.

The pace options include `instant`, which dwells zero milliseconds per
event. That is the skip to the end the brief forbids. Replay is only
replay-from-start; the brief asks for replay of the last move. Reduced
motion sets every duration to near zero, so a whole AI turn lands at once;
the brief asks for movement to become a fade with the timing kept.

Sources: [PlaybackQueue.ts](apps/web/src/playback/PlaybackQueue.ts),
[Table.tsx](apps/web/src/pages/Table.tsx), and
[tokens.css](packages/tokens/src/tokens.css).

**Required fix:** Remove the instant pace. Add replay of the current or last
event. Under reduced motion, keep the dwell time and swap movement for
fades.

## 12. P2 — Glue modules hold second copies of rules

**Affects:** M1 and M4; the "engine decides every rule" rule.

The glue hard-codes facts the engine owns and will drift from it:

- Fractured Fist: a table of 11 card names, types, and costs (the game has
  30 techniques; cards outside the table render blank), a misstep cap of 10,
  a default max stamina of 7, a 20-space round track.
- Sweetlands: "points out of 5".
- Warble Way: a default crew capacity of 5 (the reference says 3), the level
  thresholds 6/12/24/48 and the credit cliffs written into labels.
- Cybernoir: "evidence out of 13".

Sources: [fractured-fist.ts](apps/web/src/glue/fractured-fist.ts),
[sweetlands-imperium.ts](apps/web/src/glue/sweetlands-imperium.ts),
[warble-way-galaxy.ts](apps/web/src/glue/warble-way-galaxy.ts),
[cybernoir-2127.ts](apps/web/src/glue/cybernoir-2127.ts).

**Required fix:** Read card names, costs, caps, and thresholds from the
engine's view or its rules reference data. Where the view lacks a value the
table needs to show, ask the engine to add it to the view rather than
copying it here.

**Acceptance:** No numeric rule constant or card catalog appears in any glue
module.

## 13. P2 — Two primitives cannot be tapped, and colors bypass the token system

**Affects:** M1; the primitive contract.

Track and Pool take no `lit` or `onSelect`, so nothing on a track or in a
supply can ever be a legal-move target. Every primitive resolves a color
key to a literal hex value from a per-game table and inlines it; the plan
says parts carry color keys and read colors from CSS variables the game
supplies, so a palette can be themed and swapped without re-rendering.

Sources: [components.tsx](packages/primitives/src/components.tsx),
[styles.ts](packages/primitives/src/styles.ts).

**Required fix:** Give every primitive the same `lit`/`onSelect` contract.
Resolve color keys to CSS variables set on the table container by the glue.

## 14. P2 — The agency test does not test the thing it is named for

**Affects:** the plan's section 11 check.

The test exercises a classifier against hand-written move lists. It never
touches the table page or any code path that submits a move. A
`useEffect` that submitted a move on render would pass it. The plan's check
was that every move Universe submits without a person's tap is a Roll/Draw
press, an undo, or the engine's sole legal move.

Sources: [agency.test.ts](apps/web/src/tests/agency.test.ts),
[Table.tsx](apps/web/src/pages/Table.tsx).

**Required fix:** Route every submission through one function that records
its trigger, and test the table page by rendering it with a fake socket and
asserting no submission happens without a simulated tap or press.

## 15. P2 — Auth hardening gaps

**Affects:** M2 and deployment.

- Cookies are not marked `secure`, so on Heroku they are sent over plain
  HTTP if anything ever downgrades.
- Sign-in sessions never expire and there is no sign-out route.
- The sign-in link token travels in a query string, and Fastify request
  logging is on, so the token is written to logs.
- No rate limit on issuing sign-in links.
- Production starts silently with the all-zeros development secret and an
  empty engine token when the variables are unset. Rotating the secret later
  invalidates every stored host token.
- Guest-to-user upgrade moves seats but not `tables.host_guest_id`, so an
  upgraded host can no longer start their own lobby.

Sources: [app.ts](apps/server/src/app.ts), [config.ts](apps/server/src/config.ts),
[index.ts](apps/server/src/index.ts).

**Required fix:** `secure` cookies in production, session expiry and
sign-out, link tokens in the request body or fragment, a rate limit on link
issuing, refuse to start in production without real secrets, and move host
ownership on upgrade.

## 16. P2 — Anyone can subscribe to any table's move stream

**Affects:** M2 and M5.

Guest cookies are free, and `join_table` accepts any table id from any
principal. A non-seated connection receives every event's summary and
engine move with a null view. If spectator links are meant to be public,
this is fine and should be stated; if not, joining needs a check.

Source: [app.ts](apps/server/src/app.ts), the `join_table` handler.

**Required fix:** Decide whether tables are spectatable by anyone with the
id. Either way, fetch and send the engine's public view to spectators.

## 17. P2 — Event sequencing is not safe on Postgres

**Affects:** M0 deployment.

The next sequence number is computed as `MAX(seq) + 1` and then inserted,
with only a non-unique index on `(table_id, seq)`. On SQLite this is
serialized; on Postgres two concurrent writers can take the same number.

Source: [realtime.ts](apps/server/src/realtime.ts), `nextSeq`;
[db/index.ts](apps/server/src/db/index.ts), the events DDL.

**Required fix:** A unique constraint on `(table_id, seq)` and a retry on
conflict, or a per-table counter updated in the same transaction.

## 18. P2 — Build hygiene

- The primitives package's build is `tsc -b || true`, which hides build
  failures, and it emits `.js`, `.d.ts`, and `tsbuildinfo` next to the
  sources. None of those are ignored, so a normal build dirties the tree.
- A failed engine connection is cached forever in the engine client; an
  engine hiccup at boot disables the client until the server restarts.
- Fastify logs at info level in production, which is where the sign-in
  token leak above comes from.

Sources: [primitives/package.json](packages/primitives/package.json),
[.gitignore](.gitignore),
[engine-client/src/index.ts](packages/engine-client/src/index.ts).

## 19. P2 — Table page and setup diverge from the brief in smaller ways

- Top bar lacks the turn indicator, settings, and leave; the side column has
  no log and no points track.
- Setup has one AI level for all seats and no friend seats.
- "Play with friends" always goes to sign-in, even when signed in.
- Glue robustness: Cybernoir marks an empty jail slot with a marker position
  of `-1`; Warble Way parses the ruin from a debug string rather than data.

Sources: [Table.tsx](apps/web/src/pages/Table.tsx),
[Setup.tsx](apps/web/src/pages/Setup.tsx), [Game.tsx](apps/web/src/pages/Game.tsx),
[cybernoir-2127.ts](apps/web/src/glue/cybernoir-2127.ts),
[warble-way-galaxy.ts](apps/web/src/glue/warble-way-galaxy.ts).

## Milestone assessment

| Milestone | Assessment at review |
| --- | --- |
| M0 — Skeleton | Partial. Workspace structure exists; startup and deployment block acceptance. |
| M1 — Play now | Blocked by REST, socket, initial-state, and move-menu integration. A complete browser game has not been demonstrated. |
| M2 — Friends, live | Partial backend. Privacy fails; sign-in and lobby integration are incomplete; profiles and friends are placeholders. |
| M3 — By turns | Event storage exists, but turn notification logic is never called, email is a no-op, and reconnect/resume is incomplete. |
| M4 — Two more games | Glue, coordinates, and art exist. Playable flows, required animations, and rendered map fidelity remain unproven. |
| M5 — Storefront | Basic page shells. Search, updates, designer profiles, and public spectator views are missing. |
| M6 — Phone | Not implemented to acceptance. Boards use fixed dimensions, with no hand drawer or pinch/pan interaction. |

Additional evidence behind these assessments:

- Sign-in calls a different route from the one the server registers. The
  generated email link targets a GET URL, but completion is registered as
  POST only. Startup uses a console email linker; provider sign-in is absent.
- The lobby requests a missing seats endpoint and has no working join or
  ready controls. Its host flag is hard-coded.
- `notifyTurnIfDisconnected` has no application callers, and its email hook
  does not send anything.
- The socket joins only once rather than on each connection, supplies no
  last-seen sequence, and does not persist the last displayed event across
  page reloads.
- Spectator event conversion receives no separately fetched public view, so
  spectators receive a null view.
- The end page is not connected to a game-over transition and does not show
  the winner or scores over the final board.

Sources: [api.ts](apps/web/src/api.ts), [app.ts](apps/server/src/app.ts),
[index.ts](apps/server/src/index.ts),
[Lobby.tsx](apps/web/src/pages/Lobby.tsx),
[Profile.tsx](apps/web/src/pages/Profile.tsx),
[realtime.ts](apps/server/src/realtime.ts),
[socket.ts](apps/web/src/socket.ts),
[PlaybackQueue.ts](apps/web/src/playback/PlaybackQueue.ts),
[Home.tsx](apps/web/src/pages/Home.tsx),
[End.tsx](apps/web/src/pages/End.tsx), and
[app.css](apps/web/src/app.css).

## Verification and limits

- All six workspace package typechecks passed when invoked directly.
- The server TypeScript compilation passed; the resulting server failed to
  start as described in issue 6.
- The frontend production build passed, with warnings about `//` comments
  in the tokens CSS.
- The existing suite passed 43 tests. Four real-engine contract tests were
  skipped because no live engine was configured for that run.
- An isolated test using an in-memory database reproduced the cross-table
  privacy failure, missing game endpoint, rejected browser setup payload,
  catalog response mismatch, and missing initial event. The temporary test
  was removed after review.
- Docker was unavailable, so the full compose stack was not run. No complete
  game, two-browser end-to-end flow, restart/resume flow, or visual motion
  acceptance check was completed.
- Existing tests cover useful isolated behavior, but do not establish that
  the browser and server work together. The current two-seat privacy test
  does not cover one socket joining multiple tables.

- A second review (2026-09-16) drove the engine client's move path against a
  live engine before the realignment commit and found every response shape
  mismatched; that commit fixed it. Items 8–19 above come from that review
  and were re-checked against the realigned code.

## Recommended order

1. Fix the confirmed privacy leaks (issues 1 and 8) and retain regression
   tests.
2. Complete M0: reliable builds, runtime startup, compose, and live engine
   contracts.
3. Align REST and websocket contracts, initial state, legal moves, setup,
   and undo. Complete a real browser-driven Fractured Fist game for M1.
4. Finish the primitive contracts and motion checks required by M1.
5. Continue in milestone order, using each acceptance check before treating
   later scaffolding as finished functionality.

## Status after the build pass of 2026-09-16

Each item above was rechecked against the code after the pass. "Fixed" means
a test in the normal suite covers it; "partial" names what is left.

| Issue | Status | Where |
| --- | --- | --- |
| 1 socket cross-table view | Fixed: seats tracked per table on the socket; seatless joins refused | `apps/server/src/app.ts`, `socket-privacy.test.ts` |
| 2 REST contracts | Fixed: `packages/shared` is the wire contract; the game route exists | `apps/web/src/api.ts`, `rest.test.ts` |
| 3 socket messages | Fixed: event names, acknowledgements, the owned seat, undo as its own message | `apps/web/src/socket.ts`, `table.test.tsx` |
| 4 initial event and menu | Fixed: an opening event with the view, legal moves, menu and briefing; legal moves on the last event of every flow | `apps/server/src/realtime.ts`, `move-flow.test.ts` |
| 5 setup choices | Fixed for Fractured Fist: the loadout is a seven-pick from reference data with nothing preselected; guests cannot host; AI-only is live. Partial: checklist steps for the other games are offered as legal moves on the table but those games are unplayed | `apps/web/src/pages/Setup.tsx`, `tables/service.ts` |
| 6 production startup | Fixed: packages build to dist, the built server starts under Node 22 and 24, compose paths and database URLs work, Postgres implemented. Compose and the live Postgres test could not run on the build machine (Docker down); CI runs both | `packages/*`, `infra/`, `db/index.ts` |
| 7 primitive fields and motion | Fixed: engine interfaces adopted; one FLIP root moves parts between zones; flips, drops, tumbles and reduced-motion fades. Checked by eye for Fractured Fist and in the gallery | `packages/primitives` |
| 8 socket origin | Fixed: exact origin check on the handshake and on state-changing requests | `sockets.ts`, `socket-privacy.test.ts` |
| 9 faults shown as rules | Fixed: only the engine's rule codes are rejections | `realtime.ts`, `move-flow.test.ts` |
| 10 anyone can undo | Fixed: only the last human mover, before anyone else acts | `realtime.ts`, `move-flow.test.ts` |
| 11 playback pace | Fixed: no instant pace, replay of the last move, reduced motion keeps timing | `PlaybackQueue.ts`, `queue.test.ts` |
| 12 glue rule copies | Fixed: names, caps and thresholds come from reference data or the view; labels drop numbers the engine does not publish | `apps/web/src/glue/*`, `glue.test.ts` |
| 13 track and pool not tappable; colors | Fixed: every primitive takes lit and select; colors are CSS variables from the palette | `packages/primitives/src/components.tsx` |
| 14 agency test | Fixed: one submission function records the trigger; the rendered table is tested with a fake socket | `glue/agency.ts`, `table.test.tsx` |
| 15 auth hardening | Fixed: secure cookies in production, expiry, sign-out, token in the fragment, rate limits, refusal without secrets, host moved on upgrade, spent guest tokens | `app.ts`, `auth.ts`, `hardening.test.ts` |
| 16 anyone can subscribe | Decided: no spectators in v0; a seat is required to join | `app.ts` |
| 17 sequence numbers on Postgres | Fixed: assigned in the insert under a unique index with retry; per-table serialization of mutations | `realtime.ts`, `db.test.ts` (Postgres when configured) |
| 18 build hygiene | Fixed: real builds, dist ignored, failed connections not cached, no request logging | `packages/*`, `engine-client` |
| 19 table and setup gaps | Fixed: top bar, log, points track slot, per-seat AI levels and friend seats, friends flow when signed in, informant ids, no debug parsing for the ruin | `Table.tsx`, `Setup.tsx`, glue modules |

Milestones after the pass: M0 done; M1 done (a browser test plays a full
Fractured Fist game); M2 backend done with a two-browser test at the socket
level, the browser lobby untested end to end; M3 partial (notifications
written, no email nudge); M4 to M6 not started beyond compiling glue.
