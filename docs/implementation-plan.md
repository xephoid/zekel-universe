# Zekel Universe — implementation plan

Status 2026-09-15: a plan, nothing built. It turns the decisions in
`docs/design-brief.md` and the engine's `docs/digital-mode.md` into a build
order with acceptance checks. It is written to be handed to someone who has
read those two documents and the four game references in `docs/games/`.

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

**apps/server.** Fastify. REST for everything a page loads, websockets for
everything that changes while a page is open. Postgres through Drizzle, with
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

## 8. Voice and listen mode

Listen mode is the normal table with visuals collapsed, per the brief.

- The browser streams the microphone to the speech-to-text provider using a
  short-lived token the server hands out. The provider's key never reaches the
  browser.
- Text becomes a move in two stages. First, a matcher on the server compares
  the words against the numbered menu and the printed names in the legal
  moves: a number, a card name, "roll", "draw", "undo", "options". This is
  free and instant and covers most turns. Second, when nothing matches
  cleanly, a Claude agent is asked, with the legal moves and the transcript
  as context, and it may only return one of those moves or a question back to
  the player. It has no engine tools and no tokens. It cannot act on any seat.
- The engine's summaries and the game's own narration voice are read aloud.
  Text-to-speech starts with the browser's built-in voices and moves to a
  hosted voice when the first game proves the flow. Every spoken turn states
  what is owed: how many dice, for what, against what number.
- The screen shows the microphone state, the transcript, the numbered moves,
  and a large "your move" cue, and works with a screen reader.

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
   for the ruin. Roll and Draw buttons. This is also the first voice game.
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

**M5 — Voice.** Listen mode on Warble Way: streaming speech-to-text, the menu
matcher, the Claude fallback wrapped to one seat, text-to-speech. *Check:* a
full Warble Way game played with the screen covered.

**M6 — Storefront.** Home with featured, newest, updates, browse and search.
Game pages with covers, screenshots, rules link, devlog. Designer profile
for Zekel Games. Spectator links using the public view. *Check:* a shared
game link lands a stranger in a playing game in under a minute with no
account.

**M7 — Phone.** The later pass from the brief: portrait layouts, the hand as
a drawer, pinch-zoom boards, thumb-sized targets, Sweetlands first because it
is hardest. *Check:* every game playable end to end at 390 pixels wide.

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

One machine at first. Compose runs the engine in HTTP mode with a bearer
token and MongoDB or SQLite persistence, the server, the web app behind the
server, and Postgres. The engine is one process, which is what its in-memory
transports require. Secrets come from the environment and never from the
repository. When the public engine repository and package exist, the compose
file pulls the published image or package instead of a local checkout.

## 13. Things the engine may still need

None of these block M1. Each is a small change on the engine side when the
milestone that wants it arrives.

- A human move's response could carry per-seat views the way an AI turn does,
  saving Universe one call per seat per move. M2 decides whether it matters.
- The engine returns JSON in text blocks. A typed HTTP layer over the same
  functions would remove the parsing step. Worth it only if the contract tests
  turn out to be a maintenance burden.
- A per-game view schema would let a generic renderer replace hand-written
  glue for simple games. Not before four glue modules exist to learn from.

## 14. Open decisions

- Which email provider for sign-in links and by-turns nudges.
- Which hosted text-to-speech voice, once the browser's built-in voices have
  proven the flow.
- Where the first public instance is hosted.
- Whether Universe's realtime layer uses plain websockets or a library with
  rooms and reconnection built in. Plain websockets are the default until a
  need appears.
