# Zekel Universe — implementation plan

Status 2026-09-17: M0 through M5 built and checked. M5 (storefront): home
with featured, newest, the updates feed, browse and search; game pages with
the devlog and the rules; the designer profile for Zekel Games; watch links
using the engine's public view. Its acceptance check (a stranger with a game
link is playing in under a minute with no account) runs in CI as
`e2e/storefront.spec.ts`. M4 (two more games):
Sweetlands Imperium and Warble Way Galaxy played through against the live
engine in CI (`e2e/sweetlands.spec.ts`, `e2e/warble-way.spec.ts`), the
Sweetlands board checked space for space against the reference document
(`apps/web/src/tests/glue.test.ts`), Roll and Draw buttons, choosers and
forms for moves the engine lists as templates, and the Sweetlands art in
place. M2 (friends, live):
sign-in by email link, friends and invites with tests, and the lobby; its
acceptance check (two signed-in browsers at one Cybernoir table, neither
receiving the other's view) runs in CI as
`e2e/cybernoir-two-browser.spec.ts`. M3 (by turns): the mode at setup,
self-starting tables, notifications with one email nudge, My tables, and
resuming a table after a reload or a server restart; the browser half runs
in CI as `e2e/by-turns.spec.ts` and the restart half as the server's
`by-turns.test.ts`. See section 15 for what was decided along the way and
what remains. The plan turns
the decisions in `docs/design-brief.md` and the engine's `docs/digital-mode.md`
into a build order with acceptance checks. It is written to be handed to
someone who has read those two documents and the four game references in
`docs/games/`.

Two rules run through every step. The engine decides every rule; Universe
never holds a second copy of one. And a decision the printed rules give to a
player is never made by Universe, not even to smooth a flow.

## 1. What already exists on the engine side

The engine (zekel) is a Node service speaking the Model Context Protocol over
HTTP. Everything Universe needs from it is in place today:

- Sixteen game-agnostic tools: list games, get rules, create a session, get a
  seat's view, get legal moves, apply a move, play an AI's whole turn, undo,
  check for game over, and a few more.
- **Digital seats.** A human seat created with `table: "digital"` holds no
  physical cards. The engine tracks its hand and deck, and the seat's own view
  shows them. Randomness for that seat resolves only through a no-payload
  move called `resolve_report`, offered as a legal move when a draw or roll is
  owed. That is the Roll and Draw button.
- **Per-seat snapshots.** Playing an AI turn returns an ordered list of moves.
  When digital seats are present, each move carries `player_views`, one view
  per digital human seat, keyed by player id, as it stood after that move.
  Measured at about 2 KB per seat per move.
- **Mode-aware guidance and teaching.** Each game returns different
  session-start text for digital sessions. Every response can carry a rules
  briefing the first time a rule matters, and a rejected move carries the
  reason and the lesson.
- **Numbered move menu.** Responses that end on a human's turn include the
  legal moves as a numbered list with descriptions. This is what voice reads.
- **Persistence.** Sessions persist in MongoDB by default, with a SQLite
  fallback, so a by-turns game survives an engine restart.

What the engine does not do, and Universe must: users, tables, friends,
notifications, realtime fan-out, playback pacing, and drawing anything.

Two engine limits shape the deployment. Tool results are JSON inside text
blocks with no output schema, so Universe parses and validates them. And the
engine keeps per-connection transports in memory, so Universe talks to one
engine process.

## 2. Shape of the code

One pnpm workspace, TypeScript throughout.

```
apps/
  server/        Node API + websockets; the engine's only client
  web/           React + Vite; the browser app
packages/
  engine-client/ typed wrapper over the engine's tools; the only MCP code
  shared/        types shared by server and web (tables, seats, events, views)
  primitives/    the eight board primitives as React components
  tokens/        design tokens as CSS variables and TypeScript
infra/
  docker-compose.yml   engine + server + web + postgres, one command
```

**apps/server.** Fastify. REST for everything a page loads, Socket.IO for
everything that changes while a page is open, one room per table. Postgres through Drizzle, with
SQLite for local development through the same schema. Passwordless sign-in
(Google, GitHub, Discord, and email links) through a self-hostable library.
Holds the engine's bearer token and every session's host token; the browser
never sees either.

**apps/web.** React with Vite. Routes for home, game page, table setup, lobby,
table, profile, sign-in. The table route hosts a game glue module that maps
the seat's view onto primitives.

**packages/engine-client.** One class with one method per engine tool.
Connects with the official MCP client SDK over streamable HTTP with the
bearer token. Parses the text block as JSON, validates the fields Universe
depends on with zod, and turns engine error codes into typed errors. Nothing
outside this package imports the MCP SDK or knows a tool name.

**packages/primitives.** Card, card zone, tableau, bag, track, pool, grid,
map. Each takes the same data fields as the engine's web component of the
same name (`CardData`, `CardZoneData`, and so on), so a board description
written for the engine's debug client works here unchanged. Each emits one
select event with component, id, and label. Each accepts a previous value of
its data and animates the difference.

**packages/tokens.** The colors, fonts, radii, shadows, and motion durations
from the brief, published as CSS variables and as a TypeScript object. Both
apps and the primitives read from here and nowhere else.

## 3. Data model

Postgres tables, named for what they hold.

- **users** — id, display name, avatar, bio, created. No password column ever.
- **identities** — user id, provider, provider's subject id. One user, many.
- **auth_sessions** — cookie sessions for signed-in users.
- **guests** — id, cookie token hash, display name, created,
  `upgraded_to_user_id` nullable. A guest who signs in keeps their seats.
- **friendships** — requester, addressee, status (pending, accepted), created.
- **games** — the catalog as shown to players: engine game id, name, designer
  name, player count, play time, tags, cover image, description, rules link,
  visibility. Refreshed from the engine's list on startup; the extra fields
  live here.
- **game_updates** — designer posts per game: game id, title, body, posted.
- **tables** — id, game id, host (user id), mode (live, turns), status (lobby,
  playing, finished), engine session id, encrypted host token, created,
  finished.
- **seats** — table id, position, kind (human, ai), user id or guest id, AI
  difficulty, engine player id, setup choices as JSON, ready flag.
- **invites** — table id, from user, to user, status.
- **table_events** — table id, sequence number, kind (setup, move, ai_move,
  roll, draw, system), actor seat, engine summary, engine move, per-seat views
  as JSON keyed by seat position, created. This is the playback feed and the
  log. It is what a reloading browser resumes from.
- **notifications** — user id, kind (your turn, invite, table finished),
  table id, read flag, created.

Seat views are private. A row in `table_events` holds every seat's view, and
the server sends each connection only the view for the seat that connection
owns. Spectators get the engine's public view, fetched separately.

## 4. How a move flows

Universe is the only thing that talks to the engine, and every state change
becomes a table event. That single rule gives realtime and playback for free.

1. A browser sends a move over its table websocket: `{ seat, move }`.
2. The server checks the connection owns that seat and the table is playing.
3. The server calls the engine: apply the move as that seat, with the host
   token. On rejection it forwards the engine's reason and lesson to that
   browser only.
4. On success the server fetches each digital seat's view from the engine
   (one call per seat) and writes one `table_events` row holding the summary,
   the move, and the views.
5. The server pushes the event to every connection on the table, each with
   only its own seat's view, and the public view to spectators.
6. If the engine's `next_step` says an AI is up, the server calls "play the AI
   turn" once. The response is a list of moves with per-seat views already
   attached. The server writes one event per move and pushes them in order.
7. If the game is over, the server marks the table finished and writes a
   system event with the result.

The browser holds a playback queue. Events arrive as fast as the server
produces them; the table plays them one at a time at the pace the person has
chosen. A human's move and an AI's move go through the same queue and animate
the same way. Nothing skips to the end. Reloading the page fetches the events
after the last one the browser showed and resumes the queue.

Undo is one engine call. It produces a system event that tells every browser
to rewind its board to the previous view.

## 5. Taking a turn on screen

The engine's legal moves drive what lights up. The glue module for a game
maps each legal move onto the primitive it touches: a card that can be
played, a cell a piece can reach, a region a unit can enter. Tapping the lit
part submits that move, or advances a multi-step pick when the move needs a
target next. The numbered menu from the engine is always available as a list,
and is the whole interface for voice.

When the legal moves contain `resolve_report`, the table shows the Roll or
Draw button, sized as the brief says, and nothing else resolves it. The
engine's response to the press carries what was rolled or drawn, and the
event animates the dice or the card.

Every setup choice the engine lists in its setup checklist is a screen the
player fills in. Universe never defaults one.

## 6. Sign-in, guests, tables

- A guest is created on first visit with a cookie. Guests can play against AI
  and can take a seat at a friend's table by link. Guests cannot open a lobby.
- Sign-in is passwordless. On sign-in, a guest's id is attached to the new
  user and their seats and history move with them.
- Opening a table: pick a game, set seats and AI levels, choose live or by
  turns (by turns needs at least one friend seat), make the game's own setup
  choices. Against AI only, the engine session is created and play starts.
  With friends, the table enters the lobby.
- Lobby: invite link and friends list. Each arrival takes a seat and makes
  their setup choices. Live tables start when all are ready and the host
  starts. By-turns tables start themselves when the seats are full.
- The engine session is created with every human seat as `table: "digital"`.
  Universe holds the host token and acts for every seat. The engine's join
  codes are not used.

## 7. Live and by-turns

Live tables keep websockets open and play continuously. By-turns tables use
the same events and the same engine session; the difference is who is
connected. When a turn passes to a seat whose owner is not connected, the
server writes a notification and, after a delay, sends an email. The home
page's My tables block reads from notifications and tables. The engine
persists the session, so nothing is lost between visits. The server keeps no
game state of its own beyond the events.

## 8. Voice and listen mode — after v0

**DECIDED:** voice is out of v0. The listen-mode design in the brief stands,
and nothing in v0 may make it harder later, but no voice work happens until
the milestones below are done. Two things v0 keeps ready for it: the numbered
move menu from the engine is always available on the table as a list, and
every table event carries the engine's summary text, which is what will be
read aloud.

When voice comes, the shape is: the browser streams the microphone to a
speech-to-text provider using a short-lived token from the server; a matcher
on the server compares words against the numbered menu and printed names
first; a Claude fallback with no engine tools may only return one of the legal
moves or a question; text-to-speech reads the summaries in the game's own
voice. That design is recorded here so it is not re-invented, not so it is
started.

## 9. The primitives and the first glue modules

Build the primitives first, as a package with a storybook-style gallery page
showing every state in light and dark. Motion is the FLIP technique: measure
positions before and after a data change and animate the transform between
them, so a card leaving a pile and arriving in a fan is one movement. Dice
tumble and tokens drop as CSS keyframes. Reduced-motion turns movement into
fades and keeps the timing.

Then one glue module per game, in this order, each a small file that maps a
seat's view onto a primitive tree and maps legal moves onto lit parts:

1. **Fractured Fist.** Two tableaux, two hands, two decks, two discards, a
   played row. Simplest, and the only game with no report pendings at all.
2. **Warble Way Galaxy.** A tableau for the character, crew, and ship; tracks
   for level and damage; a pool for credits; a pile for the travel deck; a grid
   for the ruin. Roll and Draw buttons. Solo and with no hidden zones, so it is
   the simplest game with dice.
3. **Sweetlands Imperium.** The board as a map of 80 regions with the four
   junction roads, per the reference; tableaux per seat; the Intel piles; the
   points track; the token pool. Draw buttons and the Knight battle roll.
   Faction portraits and treat icons from `docs/design/assets`.
4. **Cybernoir 2127.** A map of 19 locations in three boroughs, two very
   different tableaux, the evidence row, the clue tokens. The first two-human
   game, so it exercises seat ownership and per-seat playback.

## 10. Milestones and acceptance checks

Each milestone ends with something a person can use.

**M0 — Skeleton.** Workspace, tokens package, engine client with contract
tests against a real engine process in compose, empty server and web apps,
CI running typecheck and tests. *Check:* `docker compose up` brings up the
engine in HTTP mode and the server can create a digital session and read a
view.

**M1 — Play now.** A guest opens the Fractured Fist page, presses Play now,
and plays a full game against the AI on desktop. Primitives package with its
gallery. Table screen in the bench layout with the top bar. Legal moves light
up parts. Slideshow playback of AI turns with pace control and replay. Undo.
Rules briefings. End-of-game screen. *Check:* a complete game start to finish
with no engine rule re-implemented in Universe and no step resolved without
the player.

**M2 — Friends, live.** Sign-in, profiles, friends, invites, lobby, live
multiplayer. Cybernoir with two signed-in humans on two browsers, each seeing
only their own hand and each getting the other's moves played back. Guest
joins by link. *Check:* a second browser never receives the first seat's view
over the websocket, verified by test.

**M3 — By turns.** Mode choice at setup, notifications table, email nudge, My
tables on home, resume from events after a reload days later. *Check:* close
every browser, restart the server, return, and the table resumes correctly.

**M4 — Two more games.** Warble Way Galaxy and Sweetlands Imperium glue, Roll
and Draw buttons, dice and card animations, Sweetlands art in place. *Check:*
the Sweetlands 80-space map matches the reference document space for space.

**M5 — Storefront.** Home with featured, newest, updates, browse and search.
Game pages with covers, screenshots, rules link, devlog. Designer profile
for Zekel Games. Spectator links using the public view. *Check:* a shared
game link lands a stranger in a playing game in under a minute with no
account.

**M6 — Phone.** The later pass from the brief: portrait layouts, the hand as
a drawer, pinch-zoom boards, thumb-sized targets, Sweetlands first because it
is hardest. *Check:* every game playable end to end at 390 pixels wide.

M0 through M6 is v0. Voice (section 8) comes after.

## 11. Testing

- **Engine client contract tests** run against a real engine in compose and
  fail if a response shape Universe depends on changes.
- **Server tests** cover seat ownership on every websocket message and REST
  route, the event writer, and the notification writer.
- **An agency check** in the glue tests: for every game, every move Universe
  ever submits without a person's tap or word must be a `resolve_report`
  pressed by that person, an undo, or a no-choice acknowledgement the engine
  itself offers as the only legal move. Anything else fails the test.
- **End-to-end** with a browser driver for the M1 flow, then M2 with two
  browsers.
- **Motion** is checked by eye in the primitives gallery, in both themes, with
  reduced motion on and off.

## 12. Deployment

**DECIDED:** the first public instance runs on Heroku. Locally, compose runs
the same pieces: the engine in HTTP mode with a bearer token, the server with
the web app built into it, and Postgres.

Heroku shapes three things:

- **Two apps, one dyno each.** The engine is its own Heroku app on a single
  dyno, because its per-connection transports live in memory and cannot be
  spread across dynos. The Universe server is a second app, also one dyno at
  first, serving the built web app as static files. Websockets work on Heroku
  without special configuration.
- **No disk.** Heroku's filesystem is wiped on every restart and dynos
  restart at least daily, so neither app may keep anything on disk. The
  engine's SQLite store is out; its session store must be a database. The
  engine supports MongoDB today, which means a MongoDB Atlas instance
  alongside Heroku Postgres, two databases for one product. The better path
  is a Postgres session store in the engine (section 13) so one Heroku
  Postgres add-on serves both apps.
- **Secrets are config vars.** The engine's bearer token, the sign-in
  provider keys, the email key, and the database URLs are Heroku config
  vars, never in the repository. The engine app's URL is private to the
  Universe app; nothing else needs to reach it.

When the public engine repository exists, the engine app deploys from it
directly.

## 13. Things the engine may still need

None of these block M1. Each is a small change on the engine side when the
milestone that wants it arrives.

- **A Postgres session store**, so the engine and Universe share one Heroku
  Postgres add-on instead of adding a MongoDB service. The engine already has
  a store interface with SQLite and MongoDB behind it, and its own guidance
  asks that SQL stay portable, so this is a third small file. Wanted by M0's
  first deploy, not by local development.
- A human move's response could carry per-seat views the way an AI turn does,
  saving Universe one call per seat per move. M2 decides whether it matters.
- The engine returns JSON in text blocks. A typed HTTP layer over the same
  functions would remove the parsing step. Worth it only if the contract tests
  turn out to be a maintenance burden.
- A per-game view schema would let a generic renderer replace hand-written
  glue for simple games. Not before four glue modules exist to learn from.
- **A faction choice per seat in Sweetlands** (and, generally, per-seat
  setup choices): today one `assign_setup_choices` move assigns every seat,
  so at a table with friends one player picks for all. Wanted before
  Sweetlands with friends; M4 records the limitation.
- **A draw step in Fractured Fist.** The engine resolves every draw inside
  the move that causes it (`play_card`, `end_turn`, `focus_reload`) and
  lists no `resolve_report`, so the table cannot put the draw behind a Draw
  button as the brief asks; the deck deals itself. A draw step of the same
  shape as the other games' reported randomness would let the deck light
  up and wait. Until then the Fractured Fist artboard is wrong on that one
  point, and the build notes say so.
- **The Focus reload cap in Fractured Fist's reference data.** The engine
  allows three reloads a turn but publishes the number nowhere, so the
  reload button says how many were used and not how many are left.

## 14. Decisions made and still open

**Realtime: a library. DECIDED.** Socket.IO. It gives rooms (one per table),
automatic reconnection with the client's last-seen sequence number so the
event queue resumes cleanly, and a fallback transport where websockets are
blocked. One dyno needs no extra adapter; if the server ever scales past
one, Socket.IO's Postgres or Redis adapter carries rooms across dynos. The
main alternative, a game-server framework with its own room and state model,
would duplicate what the engine and the events table already do.

**Email: sending goes through one thin interface; the provider is a config
choice.** Sign-in links and by-turns nudges are the only two emails in v0.
The server uses Nodemailer-style transport so any provider with SMTP or a
simple API works, which matters for people self-hosting an open-source
project. For the first instance, three reasonable providers:

- **Resend.** Simplest developer experience, a generous free tier, React
  email templates if wanted, a Heroku-friendly API. The default suggestion.
- **Postmark.** The strongest deliverability reputation for transactional
  mail, which sign-in links depend on. Slightly more setup, paid from the
  start beyond a small trial.
- **Amazon SES.** Cheapest at volume and no vendor lock, but the most setup
  and the worst first-day experience.

Start with Resend. Switching later is a config change, not a code change.

**Still open**

- Which hosted text-to-speech voice, when voice work begins after v0.

## 15. Decisions made while building (2026-09-16)

The first build pass took the plan to M0 and M1 and made the M2 backend
honest. Each item below was agreed before the work started.

- **Scope of the pass.** M0 and M1 complete and checked (a guest plays a
  full game of Fractured Fist against the AI in a browser test; the built
  server starts under Node; compose runs the stack), every privacy and
  security fix from the implementation review, and the M2 backend contracts
  (lobby, join, ready, two-human privacy with a passing test). M3 to M6
  follow in later passes.
- **Undo.** Only the seat that made the last human move may take it back,
  and only while nobody else has acted since. The engine reverts that move
  and the AI moves after it as one unit; the browsers receive a rewind
  event with the restored views.
- **Spectators.** Not in v0. Joining a table's socket room requires a seat;
  spectator links wait for M5, when the engine's public view (an MCP
  resource today, not a tool) gets a proper path.
- **Engine changes.** None in this pass. The server fetches each game's
  reference data from the engine once and serves it to the browser; a label
  drops any number the engine does not publish (Cybernoir's evidence
  thresholds, for one).
- **Database.** Kysely instead of Drizzle, because one schema has to run on
  SQLite locally and Postgres in production and Drizzle needs a schema per
  dialect. Booleans are integers and JSON is text so both agree. The
  engine's own Postgres session store stays engine-side work.
- **Sign-in.** Email links only for now, with tokens in the database, a
  short expiry, single use, a rate limit, secure cookies in production,
  session expiry and sign-out. The token travels in the URL fragment and is
  posted by the landing page. Google, GitHub and Discord wait for client
  ids. Resend is the mail provider by configuration; the console otherwise.
- **Primitive contract.** The engine's component interfaces (`CardData`,
  `CardZoneData`, `TableauData`, `BagData`, `TrackData`, `PoolData`,
  `GridData`, `MapData`) are the base; Universe adds only optional fields
  (a card's art and subtitle, a map node's roads, a tableau's active label).
- **Catalog.** No allowlist: every game the engine lists appears, with the
  designer of record and storefront copy set for the four Zekel Games titles.
- **Browser tests.** Playwright, with a CI job that plays a full game
  against the engine in Docker.
- **Motion.** One FLIP root for the whole table; identical cards get stable
  instance ids in the browser so the card that was tapped is the card that
  flies. Reduced motion becomes fades with the same timing.
- **Commits.** Small commits by area.

Decided in the M3 pass (2026-09-17):

- **The nudge.** One email per turn, sent only after the player has been
  away and up for a delay (ten minutes by default, `TURN_NUDGE_DELAY_MS`),
  and only if they are still away and still up when the server looks (every
  minute, `TURN_NUDGE_SWEEP_MS`). Coming back to the table answers the
  notification, so a quick return never draws an email. Guests have no
  address and get no email; they see My tables like everyone else.
- **Resume.** The server keeps no game state in memory that matters. On
  every table open it compares the last event with the engine's next step
  and writes whatever a restart lost: an AI turn that never ran, a move
  whose event was never written, or a finish. The browser resumes from the
  last event it saved and replays the rest.
- **Schema changes.** From version 3 on, the database migrates in place
  with one statement list per version; a database from a newer server is
  refused, never rewritten.

Decided in the M4 pass (2026-09-17):

- **Template moves become forms.** Some legal moves the engine lists are
  skeletons with blanks or with a convenience default ("edit to each
  human's choice"). The table never sends one as listed: a glue describes
  the questions (`formFor`), the table asks them with nothing preselected,
  and the completed move goes through the agency policy's `form` trigger,
  which checks that the answers changed only the asked-for keys of a listed
  template. A generic form covers blanks the glue does not describe.
- **A tap that could mean several moves asks which.** Sweetlands names
  moves by card id, and one card can mean many moves (unit, action, ring or
  road). The chooser shows the engine's own descriptions, one button each.
- **Battles on a digital seat.** The engine change of this pass: a digital
  human seat has no dice, so a knight's battle with the castle foe is rolled
  by the server when the player presses the move, as for an AI; physical
  seats keep declaring their roll. Sweetlands legal moves now carry ids, and
  Warble Way's reference data lists the races and archetype cards. All
  three are in the engine's commit "Digital seats: the server rolls a
  Sweetlands foe battle…".
- **Sugar dice are not d6.** Sweetlands battles report both totals in the
  log; the pip dice on the table are for Warble Way's d6.
- **Faction assignment at a multi-human table.** The engine offers one move
  that assigns every seat, so the seat that presses it picks for everyone.
  Against AI that is the host's decision to make; with friends it is not.
  An engine change (a faction choice per seat) is wanted before Sweetlands
  with friends leaves v0; recorded in section 13.

Decided in the M5 pass (2026-09-17):

- **Storefront content lives in the server.** The designer of record, the
  player-facing copy and the designer's updates are checked-in content
  (`apps/server/src/storefront.ts`), seeded into `games` and `game_updates`
  at startup and served by `/api/updates`, `/api/games/:id/updates` and
  `/api/designers/:slug`. A designer dashboard that edits them is later
  work; the navigation has its place ("Designers").
- **Browsing runs in the browser.** The catalog is small; search and the
  three filters (players, play time, tag) work over the list the server
  sent. Play-time buckets come from the catalog's own strings.
- **Watching is the engine's public view.** `GET /api/tables/:id/watch`
  needs no account and returns the engine's public view (its resource
  `game://{game}/sessions/{session}`, hidden information omitted by the
  engine), the seats by display name and the log of event summaries. It
  never reads a seat's payload. The page polls every three seconds and
  draws the board with the same glue and no seat of its own. The engine is
  asked at most once every two seconds per table. A watcher has no socket
  and no seat: the M2 rule stands.
- **Screenshots wait.** The brief's game page lists screenshots; none exist
  yet, and a placeholder image would be a fake. The layout takes them when
  the storefront gets real cover art.
- **Rules on their own page.** `/games/:id/rules` shows the engine's rules
  text, which is the rules the table enforces; a designer's printed rulebook
  link sits beside it when one is set.

Design pass (2026-09-17), after a review found the pages had drifted from
the canvas:

- **The canvas is the measure.** Every page now follows
  `docs/design/Zekel Pages.dc.html` in its own numbers: the 60px white bar
  with Browse, My tables (with the count of turns waiting), Designers, the
  search field and who you are; pages 40px in from the edge; home as My
  tables, then Featured and Newest with the filter chips beside the
  heading, and the updates feed in a 340px column; the game page's 420px
  cover with four screenshot slots, the chips, the two buttons and the
  devlog as a dated list; setup with seat rows, the player-count stepper,
  Live and By turns as cards and a sticky summary; the lobby with tagged
  seat rows and the invite cards; sign-in as a card over the page; the
  profile with the big avatar and the friends column; the end of the game
  as the results card. The table's bar carries the wordmark, the game, the
  round and the turn pill as `Sweetlands Table.dc.html` draws it.
- **Shared pieces.** The wordmark, the avatar circle and the cover
  placeholder live in `apps/web/src/ui.tsx`; the tokens gained the canvas's
  hairline, chip, badge and card-shadow values so no page needs a literal.
- **What still differs, on purpose.** The canvas draws the Sweetlands board
  as a grid of colored squares; the table draws it with the map primitive
  (blobs and roads), the composition the primitives sheet chose. The hand
  is a row of larger cards, not a rotated fan. The sign-in card offers email
  only, since v0 has no other provider.

Added on request (2026-09-21):

- **My tables has its own page** (`/tables`, where the bar's My tables
  points): every table of yours, grouped by your move, in progress, in the
  lobby and finished, and nothing else. A table you host alone (against
  the AI, or a lobby nobody joined) can be deleted there, with a confirm
  in the row; `DELETE /api/tables/:id` refuses any other case (403), and
  takes the table's events, seats, invites and notifications with it. The
  engine keeps its session.
- **Every setup choice on the setup screen.** Some games take their setup
  choices only as moves once the session exists (Sweetlands' factions and
  foe, Warble Way's character), so the setup screen asked for nothing and
  the table asked instead. Now a glue lists those choices as setup fields
  (choice, multi, text or number), turns the answers into `setupMoves`,
  and the server applies them by the host's seat right after the session
  is created and before the table opens; a refused one fails the start
  with the engine's reason (422) and leaves no table behind. Choices that
  belong to a friend who is not at the setup screen (their faction) stay
  at the table; a table against the AI has the host make them all. The
  Cybernoir rules choice the engine takes as an option (when Overclock
  grants the draws) is a setup field too, and so is which role the host
  plays, Detective or Hacker: it becomes the engine's `detective` option,
  the Detective's player id by seat position, and the other seat takes the
  other role. The table's own forms remain for tables that reach a choice
  unanswered.
- **The tab icon is the wordmark's meeple.** `apps/web/public/favicon.svg`
  redraws the five shapes of `docs/brand/wordmark.html` as vector art in
  the brand orange, lying on its back as it does in the logo so it reads as
  the k (the brief had suggested the upright meeple; the k was asked for).
  A 32 px PNG covers browsers without SVG icons and a 180 px PNG on the
  page background is the home-screen icon; both are rendered from the SVG.

Decided in the Fractured Fist pass (2026-09-21), after the three artboards
`Fractured Fist Loadout`, `Fractured Fist Table` and `Fractured Fist Strike`
and the build notes in `docs/games/fractured-fist-build.md`:

- **The draw stays automatic.** The engine has no draw step for this game
  (section 13), so the deck never lights up and nothing pretends to wait
  for a press. The Focus reload button is itself the press for that draw.
- **The gutter does not subtract.** Between rounds it shows what each
  player has queued against the other and the target's stamina, as two
  small pools read straight from the view. What gets through is the
  engine's to say, and it says it at the strike: the moment reads the
  stamina the engine took off, never `damage − defense` of its own.
- **Two counts on one card.** `CardData` gains an optional `counts` list
  (`label`, `value`, `own`), a Universe addition the engine ignores, so one
  shelf carries "you 4 · them 2" on every stack. `count` is unchanged.
- **The action bar is table chrome.** `TablePlan` gains `steps` (named
  steps, one current) and `prompt` (a title, a line of what you can do now,
  and buttons). Every button is bound to a move the engine listed, or to a
  batch; none appears otherwise. The numbered menu stays, collapsed when
  the bar has buttons. The other three glues are untouched this pass.
- **A batch is a fifth submission trigger.** "Play all resources" is one
  press that sends several listed plays one at a time; the table finds the
  move for the next card only among the legal moves the engine returned
  after the previous one landed, and stops the moment a card means nothing
  or several things. The agency policy records it as `batch`, with the
  same test as a tap at each send. The button says what the press spends
  when a Focus reload is still legal.
- **The strike is a moment that plays before its event lands.** A glue may
  answer `momentFor(before, after)`; the playback queue gained a gate that
  holds the next event until the table says so. The overlay plays four
  beats over the board as it still is (both hits at once, in the motion
  tokens: locked, travel, absorb, land), fades, and only then does the
  event land, so the played rows sweep to the discards as the FLIP already
  does. Pace is the queue's 0.5/1/2; Skip closes it; "Replay the strike" is
  `replayLast`, which runs through the gate again. A game ending on the
  strike lands on the existing end panel, which stays put. The build notes
  had the moment as a plan field; a plan is computed from the view on
  screen, and this one has to play before that view changes, so it is a
  hook instead.
- **Counters scoped to the step.** Actions during Technique, spirit and
  channels during Channel, refines while a refine is pending, and only for
  the player on turn; stamina and the misstep meter always. Two step chips,
  Technique and Channel, because those are the engine's phases; the
  artboard's Cleanup chip stood for the draw press that cannot exist.
- **A full-row zone.** A zone may carry `span: 'full'` and take a whole
  row of the board, which is how the two played rows and the shelf stack
  between the hand and the side column. The self tableau moved into the
  bench beside the hand, where the other games already put it.
- **The loadout is a grouped pick on the setup page.** A `multi` setup
  field may carry groups, a preset, a summary function and per-option
  chips, badges and tags; the setup page then draws sections by school,
  seven numbered slots in the summary column, "Use the default seven" from
  the engine's `starter_loadout` (a button, never a preselection), and the
  totals from the engine's per-card `effects`. An eighth pick says why
  instead of swapping. It stays on the setup page rather than becoming its
  own route.
- **Out of this pass.** The side column's round panel with the turn order
  (the turn pill and the tableau badge cover it), the Voice and Chat
  buttons, the opponent's turn (the slideshow already exists), card art,
  and the phone layout.

Still open:

- The engine's Postgres session store (section 13) before the first Heroku
  deploy.
- Cover art and screenshots for the four games (M5's layout is ready for
  them).
- Cybernoir 2127's glue compiles against the primitive contract and passes
  fixture tests and the two-human privacy spec, but a full game has not been
  played through in the browser. All eight items of the table's design pass
  have landed — printed names instead of ids, the clue rail both seats share,
  the case file as the points track, cards carrying their own facts, the turn
  as a row of verbs, who the Detective can reach, upkeep and the block as real
  panels, and a hand that folds into stacks as it grows. What each one did not
  manage is written up beside it in `docs/games/cybernoir-2127-build.md`; the
  late-game moments are still unseen, because no full game has been played
  end to end. Six library changes came with them,
  all general rather than game-shaped: a track space grows from a circle into
  a pill when it holds a word; a pool of one-offs leaves off a count of one; a
  card zone can draw empty slots after its cards, so a zone whose shape is
  part of the game says what is missing; a card zone can draw small, as name
  chips rather than faces; and a fan that outgrows what a fan can hold folds
  into stacks on a card's `groupKey`, with a Spread control that lays the
  whole hand out. `CardData` gained `cost`, drawn as a pip rather than one
  badge among many.
- **Every zone is a panel, and games colour their own parts.** A zone is now a
  white card on the paper with a header, the way the action bar already was
  and the way every table artboard draws it — one rule on `.zone` in the app's
  stylesheet, not in the library, since it is page chrome rather than a
  primitive's business. Cybernoir supplies its six faction colours, so
  affiliation reads as colour on every person, location and stack instead of
  as a grey pill. Checked on three games. The table still differs from the
  artboards in two ways that are not styling, both written up in
  `docs/games/cybernoir-2127-build.md`: the city and the verb bar. The city is
  now settled — see below. **DECIDED: the verb bar stays a strip.** The design
  has it as a column of rows feeding a detail panel; the cards themselves are
  the interface instead, and the effort went there. A card in hand now lights
  wherever it can be played — it was named rather than indexed, so the
  Detective could tap a region of the city to play a Location but not the card
  holding it — and a tap on a card means every move that names it. The strip
  stays as the way to reach a verb that is not a card.
- **A small card zone still says what its cards say.** `size: 'small'` was
  suppressing the subtitle and badges, so a chip was a bare name. It is about
  the shape of a row, not about withholding a card's facts. Cybernoir's case
  file now carries what is printed on each piece of Evidence — where that
  person lives, their faction, their cost — because Evidence is face up for
  good and for the Detective it is the case, not a score. The same fix made
  "Who you can reach" show where an unreachable person is.
- **A track's spaces can hold named cards.** Cybernoir's jail is "3 spaces in
  a line, each holding a stack of face-up POI cards; arrows between spaces",
  and it was drawn as anonymous dots with the names in tooltips.
  `pieceShape: 'named'` draws what stands on a space as named chips in a
  labelled slot, and `arrows` draws the line between them. Both default off.
- **DECIDED: Cybernoir's city is a map.** It was never the wrong primitive.
  The game reference maps it to Map and the Primitives component sheet says
  "Cybernoir's 19 locations are a map"; the table artboard draws the same map
  laid out in borough bands. What was missing was on the map itself, and two
  additive fields close it: `areas`, named parts of a board drawn as labelled
  bands behind the regions standing in them, and `nodeShape: 'pill'` for a
  board whose regions are places rather than spaces. Both default off, so
  Sweetlands' eighty-space board is unchanged. With bands each printed fact is
  said once and where it fits: the borough is the band, the faction is the
  region's colour, and how many live there is its one badge.
- **An action-bar button may stand for several moves.** `PromptAction` gained
  a `moves` variant: a verb with one listed move behind it sends on the press,
  and a verb with several opens the chooser that already existed for taps,
  showing the engine's own sentence for each. It is how a turn becomes eight
  verbs instead of nineteen sentences without anything being chosen for the
  player. When every move behind a verb answers one question the glue knows
  how to ask — upkeep's sixteen keep-and-release combinations — the verb asks
  that once instead of listing them.
- Two rules stayed in the engine rather than being copied here, both by adding
  a published fact: how many cards win the game (`reference_data.evidence`),
  and which location a Hacker hides in. Two more are open the same way —
  whether the table may count how many Locations a clue leaves standing (the
  engine's scoreboard already computes it), and a printed one-liner per Contact
  ability, which the engine publishes only as an id today.
- **Settled: Cybernoir's hideout is the Hacker's choice.** The engine used to
  pick it at session creation, because `createInitialState` auto-completed
  setup whenever both seats were *tracked* and Universe marks human seats
  `digital`, which the engine reads as tracked. Who holds the cards and who
  decides are different things. The engine now auto-completes only when the
  AI plays the Hacker, and names the chosen location in the Hacker's own view
  beside the three printed facts (the facts do not identify a place: Trailer
  Towers and Little Ghana share all three). Universe opens the setup phase
  with the whole city lit, names the tapped location back before anything is
  sent, marks the safehouse on the map for its owner, and tells the Detective
  to wait. This closes the "Settle this first" question in
  `docs/games/cybernoir-2127-build.md`; the engine naming it was that note's
  own recommendation, and Universe holds no second copy of the fact.
- The phone pass (M6).

## 16. Neither Guts nor Gears (decided 2026-09-23)

The design canvas is `docs/design/neither-guts-nor-gears/`; how its boards
become one client is `docs/design/SCREEN-ROUTING.md`. Decisions made before
building:

- **DECIDED: a bespoke screen inside the table.** The NGnG glue keeps a
  `plan()` for Watch and the move-menu fallback, and adds a React screen that
  replaces the board and bench: a pure `route(view, seat)`, client-side
  composer stages (Build → Payment → Place It), and an interrupt layer above
  them (access request, treaty response, battle defense). The top bar, log,
  playback, undo and the numbered move menu stay shared with every game.
- **DECIDED: Ink and Oil over Pressed.** Wizard seats read as inked pages,
  robot seats as machined parts, tokens follow their owner on every seat's
  screen, and the map stays one map. Done as tokens scoped to the NGnG table.
- **DECIDED: faction on the setup page; Leader draft and starting sites in
  the table.** The draft and the reverse-order starts are shared-pool picks
  in turn, so they are in-table pendings.
- **DECIDED: follow the engine where the canvas disagrees**
  (`DESIGN-ALIGNMENT.md` §3 in the engine): treaties break several at a time
  with a Done, one gate over a Shared Tactics partner's whole hand, no claim
  that a partner's commitment is visible, Detection as its own control beside
  the activation, and "request 1 of 2" on an access request.
- **DECIDED: what a screen may print.** State the client holds, printed card
  and rules text, the engine's reason an option is shut, and short how-to
  lines ("Click a hex to place it"). No design commentary, no strategy advice.
- **How the view's gaps are closed.** Pendings that publish `options` are read
  from them; pendings that publish only a `question` take their option set from
  the seat's legal moves. Map pieces come from `players[].units`, `heroes` and
  `committed_collectors` joined to `map.tiles` by coord, never from the
  `"Name (owner)"` strings. `active_action` is still the string
  `"kind by owner"`; one tested reader handles it until the engine publishes a
  structured field.

### Where NGnG stands (2026-09-23)

Built, in the build order of `SCREEN-ROUTING.md` §12:

1. **The shell.** The map (one map for every seat; pieces from the owners'
   own lists; tokens slide between hexes and fly in from their owner's
   supply), the action stack, the seats, the culture race, and the seat's
   faction board as a strip and a full sheet, in Ink or Oil.
2. **The router.** `route(view, seat, legalMoves)` is pure and tested
   against views the engine produced (`scripts/ngg-fixtures.mjs` plays seeded
   games and captures each decision; `scripts/ngg-fixtures-rare.mts` takes
   the rare ones from the engine's hand-built states). A route without a
   dedicated screen falls back to a chooser that lists the pending's options,
   shut ones struck through with the engine's reason.
3. **The purchase composer** (Build, Research, a second purchase, the
   economic spend): choose, pay, place; one move on the last press; the draft
   survives an interrupt. Access Request is the owner's interrupt, with the
   declared purchase and its queue position; the buyer sees the same terms.
4. **The battle**: Move Battle, Elara's spell, the secret commit and Shared
   Tactics, the Counter, the Extra, the activation ladder with Detection
   beside it, the Infiltrator, the defense (and the Spy Reveal) as an
   interrupt, Retreat, Rally.
5. **Everything else**: setup at the table, the Leader draft, starting
   sites, planning, Core reallocation, the draw (the Draw button sits in the
   decision that asks for it), the treaty offer as an interrupt, the
   break window, Diplomacy and the offer composer, hero claims, a reserved
   hero, the overlay, the spy, the end.

`/dev/ngg` (dev server only) draws any captured view as the deciding seat or
a watcher. `e2e/ngg.spec.ts` plays a live table through the screens alone.

**Engine changes, on a branch not yet merged** (`claude/ngg-structured-view`
in the engine): `resolving_action { card_kind, owner }` beside the
`active_action` sentence; `battle.units[].ref`, the id battle moves name a
unit by; and build moves that name where the piece goes — one per owned base
for a unit, one per legal site for a new base, none at the base limit — so
the engine never picks the spawn for the player. Universe reads the new
fields first and falls back to what the current engine sends.

**Open, and each needs the engine:**

- **Collector reach.** The payment stage shows the engine's proposed
  placements to commit or drop; the player cannot move a collector to another
  tile, because reach is chained (each placement extends the next, §6.1) and
  the view publishes none of it. Computing the chain here would be a second
  copy of the rule. The engine needs to publish reach, or accept a proposal
  and answer with the next legal tiles.
- **A claimed hero is placed by the engine** at the first base, with no move
  to choose (a player-agency gap). Hero Claim is built without a Place It step.
- **Treaty Response** has no structured proposer or treaty type
  (`pending.context`); the screen shows Accept and Decline only.
- **Second purchase** does not say whether it is a build or a research;
  **Spy Assign** does not publish the source (Illusionist or Infiltrator);
  **The End** has no structured kind of win; **Overlay Choice** does not name
  the resource each hero would make the tile.
- **Shut reasons carry raw seat ids and coords** ("rob is in this battle…");
  the screens show them as faction names and tile labels for display only.
- **A Counter with no possible target** leaves its owner owing a decision
  with no legal move (captured in `pending-counter_target-4p`).
- **The robot Infiltrator's look** (`use_detection`) is accepted by the
  engine but never listed, so the screen omits it.
- **One seat assigns every seat's faction** (`assign_setup_choices`); at a
  table with friends that is the host choosing for them.
- **A new base may be listed on a tile that already holds one of your
  bases**; the engine's site rule does not exclude it. A rules question.
- The Ink fonts (IM Fell English, Caveat) are not bundled yet; the wizard
  seat falls back to a serif until they are added with their OFL credit.
