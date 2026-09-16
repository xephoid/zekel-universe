# Zekel Universe — design brief

Status 2026-09-15: a brief for a visual and interaction designer. Nothing here
is built. It describes what the product is, who uses it, every screen, how the
table should move, and what to deliver. Where a decision is still open it is
marked **ASSUMPTION** so it can be confirmed or changed.

Revision note, after the first design draft: the assumptions below are all
confirmed. Decisions added from the draft review are marked **DECIDED**. Game
content in the draft (kingdoms, abilities, the board, the Warble Way crew) is
placeholder by choice; the four reference documents in `docs/games/` remain the
source of truth for a later fidelity pass. Phone layouts are a later pass. The
domain is **zekel.games**.

## What this is

Zekel Universe is a website where people play board games in the browser
against AI opponents or with friends, and where independent game designers
share their games so people will play them.

The games themselves are run by a separate rules engine. It decides what moves
are legal, plays the AI, and tells us whose turn it is. Universe draws the
table, moves the pieces, and talks to the player. Universe never invents a rule.

Two references, and how we differ from each:

- **itch.io** for browsing and for how designers show their work. We are warmer
  and less cluttered.
- **Board Game Arena** for playing. We are slower on purpose during AI turns,
  and everything moves like it would on a real table.

**Warm but flat.** No felt textures, no wood grain, no photographic card edges.
The warmth comes from the palette, the type, soft shadows, and the way things
move. Flat shapes that behave like physical objects.

## Who it is for

- **A player who clicked a link.** They landed on a game page from a designer's
  post. They should be playing against the AI in under a minute, with no account.
- **A player with friends.** Signed in, has a friends list, plays live in one
  sitting or takes turns over days.
- **A designer.** Has a page for each of their games and a profile that works as
  their storefront. Wants people to play, and wants to see that they did.
- **A voice player.** Plays with eyes closed or eyes busy. Hears the table,
  speaks their moves. This may be for accessibility or for preference; the
  screen must work for both.

## The feeling at the table

This is the whole pitch, and the designer owns it.

- Cards leave the deck and arrive in a hand. They do not appear.
- Pieces slide along the board from where they were to where they go.
- Tokens drop from above and settle with a little weight.
- Stacks and hands have slight randomness in rotation and offset, so they look
  handled rather than printed.
- A moving thing lifts: its shadow grows while it travels and shrinks when it
  lands.
- Nothing appears or vanishes in place. Everything comes from somewhere and goes
  somewhere: a discard slides to the discard pile, a spent token returns to the
  supply.
- Motion is short. A card flight is a few hundred milliseconds, not a second.
- When the operating system asks for reduced motion, movement becomes a fade and
  timing stays the same, so the pacing of a turn is preserved.

**AI turns are a slideshow.** When an AI takes its turn, the engine hands us the
whole turn as an ordered list of moves. We play them back one at a time, slowly
on purpose, each move animating with a one-line caption saying what happened.
The player can slow it down, speed it up, or replay the last move. There is no
skip that jumps to the end. This is most of what a player watches, so it needs
to be designed as a moment, not a loading state.

**DECIDED:** when several seats act in a row, the slideshow is continuous, one
flow with no pause or "next up" beat between seats. And it is the same for
human players: when a friend takes their turn, everyone else sees it play back
as the same slideshow, at the same pace, with the same captions. A move is a
move, whoever made it.

## Screens

In the order a new player meets them.

### Home

- Featured games (editorial, a few at a time).
- Newest games.
- Announcements and designer updates, in one feed.
- Browse by player count, play time, and tag; search.
- Signed-in players also see **My tables**: games waiting on their move,
  games in progress, and invitations. This block is the first thing they see
  when they have a pending turn.

Every game appears as a card with cover art, name, designer, player count, and
play time. Clicking goes to the game page.

### Game page

- Cover art, name, designer (links to their profile), player count, play time,
  a short description, screenshots, and a link to the rules.
- Two primary actions:
  - **Play now.** Starts a game against AI opponents immediately. Works with no
    account.
  - **Play with friends.** Asks the player to sign in if they have not.
- Below: the designer's updates for this game, like a devlog.

### Table setup

Before a game starts, the player sets up the table.

- Seats: how many, which are AI, AI difficulty per AI seat.
- **Live or by turns.** Live means everyone plays now in one sitting. By turns
  means each player takes their turn whenever and is notified. A game against
  only AI is always live.
- **The game's own choices.** Some games ask the player to pick a faction, build
  a character, or choose a starting loadout. These are real decisions the rules
  give the player. They are never skipped or defaulted. The engine tells us
  which choices exist and what the options are; this screen presents them.

### The table

The game itself. Described in its own section below.

### Sign-in

- Passwordless only. Continue with Google, GitHub, Discord, or an email link.
- Never a wall. A guest can play the AI without signing in. Sign-in is asked for
  when they try to do something that needs an account: invite a friend, join a
  table with people, keep a history.
- A guest who signs in mid-game keeps their seat and their history. Design the
  moment where a guest becomes a member without leaving the table.

### Profile

- Display name, avatar, a short bio, games played, favorite games.
- Friends: the list, requests in and out, who is online, and **invite to a
  table** from a friend's row.
- A designer's profile also lists their games and their updates. It is their
  storefront, so it should look good shared on its own.
- **DECIDED:** no following of designers and no follower counts in the first
  version. Leave them out.
- **DECIDED:** the designer of record for the owner's four games (Fractured
  Fist, Cybernoir 2127, Warble Way Galaxy, Sweetlands Imperium) is **Zekel
  Games**. Use that name wherever a designer is shown for them.

### Lobby

For a table with friends, before the game starts.

- The seats, filling up as people arrive.
- An invite link and a button to invite from the friends list.
- Each seat's ready state; the host starts when everyone is ready.
- For a by-turns table, the lobby can close and the game begins as soon as the
  seats are filled; nobody has to be present at the same time.
- **DECIDED:** a guest can be invited. Anyone with the link can take an open
  seat without an account. But a guest cannot start a table with friends: the
  host who opens a lobby must be signed in. This is the one place sign-in is
  required.

### Voice-only table

**CONFIRMED:** voice is a toggle on the normal table, and turning it on
collapses the visuals into a listen-mode layout rather than sending the player
to a separate mode. **DECIDED:** voice is not part of v0. The design stands
for later; see the implementation plan.

The listen-mode layout shows very little: the microphone state (listening,
heard you, thinking), a live transcript of what the player said and what the
table said back, a clear "your move" cue, and the narration as text for anyone
who wants to read along. It must work with a screen reader, with a keyboard, and
in the dark.

### Designer dashboard

Out of scope for this brief. The designer-upload flow is being worked out
separately. Leave a place for it in the navigation and nothing more.

## The table, in detail

### Layout, desktop

- Board in the center, as large as the space allows.
- The player's own hand along the bottom, cards fanned.
- Opponents arranged around the edges, each with a compact panel: name, avatar,
  a hand count or their visible cards, their tokens.
- A side column. **DECIDED:** the "bench" layout from the first draft is the
  one to keep: a column of about 420 px that stacks the other seats, the points
  track, and the log, with rules and chat one tap away. Not the tabbed rail.
  The column collapses.
- A slim top bar: game name, turn indicator, undo, settings, voice toggle,
  leave.

### Layout, phone

Full play on phone is required for every game, including the ones with large
boards. **DECIDED:** phone is a later pass, after the desktop table is settled.
The rules below still apply when that pass comes.

- Portrait first.
- The board fills the width. Pinch to zoom, drag to pan, double-tap to reset.
- The player's hand is a bottom drawer. It peeks (a strip of card tops) and
  pulls up to fan the full hand.
- Opponents shrink to a row of avatars with counts; tapping one opens their
  panel as a sheet.
- The log, rules, and chat are sheets, not a rail.
- Touch targets sized for thumbs. The whole game is played by tapping pieces and
  cards, so every tappable component needs a comfortable hit area even when the
  board is zoomed out.

### Taking a turn

- Legal moves are shown by lighting up the actual components you can touch: the
  cards you can play, the spaces you can move to, the piece you can pick up.
  Tap one to play it. Where a move needs more than one tap (pick a card, then a
  target), the table guides each step.
- A numbered list of the same legal moves is always available as a fallback,
  and is what voice players hear.
- **Roll and Draw.** When the rules call for dice or a hidden draw, a big
  physical button appears. Nothing rolls or draws until the player presses it.
  The roll and the draw are their own animation: dice tumble and settle; a card
  leaves the deck and flips.
- **Undo** reverts one step and is always visible.
- **Confirm before irreversible.** Some moves cannot be undone once the AI has
  responded. The table says so once, briefly, before the first such move.

### Waiting

- On an opponent's turn, the table shows who is up and what they are doing, and
  the AI slideshow plays.
- In a by-turns game, waiting can be days. The table shows "waiting on Sam" and
  offers a way back to My tables. A notification brings the player back.

### Teaching

The engine tracks which rules a player has met. The first time a rule matters,
a short lesson appears next to the thing it is about, and does not appear
again. When a move is rejected because of a rule, the reason appears at the
component, with the lesson one tap away. Lessons can be turned off in settings
for players who know the game.

### End of game

Scores or the winner, the final table still visible behind, and three actions:
play again with the same table, share the result, and return to the game page.

## The eight primitives

Every game board is composed from eight components. Design these once, with
their motion, and every game inherits them. This is the largest and most
valuable part of the work.

1. **Card.** One physical card: a face with a name, values, and optional art;
   a back when face down. Flips. Selected, playable, and disabled states.
2. **Card zone.** How cards are laid out: a **row** (a market or a landscape
   of face-up cards), a **fan** (a hand), or a **pile** (a deck or discard with
   the top card visible and a depth count). Hidden piles show only a count.
3. **Tableau.** A player's board: a titled panel with stat rows (a meter when a
   maximum is known) and slots for nested zones such as their hand, their bag,
   or their own tracks.
4. **Bag.** A push-your-luck draw bag: the bag with a count, the known contents
   as chips if the rules allow, the chips pulled so far in a row, and a state of
   drawing, busted, or stopped.
5. **Track.** A line or a ring of spaces: a score track, a progress track, a
   circular round marker. Spaces can be filled, can hold pieces, and can have
   markers pointing at them.
6. **Pool.** A supply of counted things: resource chips with quantities.
7. **Grid.** A square-cell board: colored terrain cells, round piece tokens
   with an initial and small badges. Pieces slide from cell to cell.
8. **Map.** A positional board: named regions placed at points on a background,
   pieces stacked on regions. Pieces travel between regions.

Each primitive needs: its resting look in light and dark theme, its selected
and legal-move states, its phone-size version, and its motion (how a thing
enters it, leaves it, and moves within it).

**DECIDED, after the first draft:** the eight primitives are the unit of
implementation, not the screens. The first draft drew the Sweetlands table as
one-off pieces; a component sheet was added to the canvas that draws all eight
in the draft's own vocabulary and names which part of the table is which. The
build order follows: primitives first, with their states and motion, then game
tables composed from them. Each primitive takes the same fields as the matching
component in the engine's web component library (card, card zone, tableau,
bag, track, pool, grid, map), so a game's board description works in the
engine's debug client and in Universe without change. A primitive never
hard-codes a game's colors: parts carry color keys, and the game supplies the
palette.

Games add color and layout on top of these primitives but do not replace them.
A game's palette (its faction colors, its terrain colors) is applied to the
primitives as theme variables.

## The existing mark

There is no logo image. The engine's debug client draws a wordmark in code,
and it is the only brand mark that exists. Open
[docs/brand/wordmark.html](brand/wordmark.html) in a browser to see it at its
original size, scaled up, in light and dark, and with the meeple alone.

What it is: the word **zekel** set in Google Slackey, tight
letter-spacing, in the brand green. The **k is replaced by a meeple** (the
little wooden person from board games) **lying on its back**, head to the left,
legs to the right, so its outline reads as a k. The meeple is built from five
rounded shapes: a round head, a wide shoulder bar, a body, and two splayed legs.
The whole meeple is the action orange — head, body, and legs alike. In dark
theme the letters become cream and the meeple becomes the brighter orange.

The upright meeple on its own, all orange, is a natural app icon and
favicon. The designer may redraw the mark properly as vector art and should
keep the idea: the meeple is the k, drawn entire in the one spot of orange.

## Design system to start from

These tokens already exist in the engine's debug client and should be the
starting point. Push on them where they fall short; keep the warmth.

**Light**

| Token | Value | Use |
|---|---|---|
| background | `#f7f1e6` | page |
| surface | `#ffffff` | panels, cards |
| surface-2 | `#efe7d8` | secondary panels, tags |
| text | `#1c1a17` | body |
| brand | `#1f4d3a` | forest green: logo, links, highlights |
| action | `#e0762b` | warm orange: primary buttons |
| action-hover | `#c9662a` | |
| highlight-bg | `#e6efe9` | legal-move and selection glow |
| you | `#fbe3d2` on `#7a3a12` | the player's own things |
| ai | `#dde9e1` on `#1f4d3a` | AI seats |
| danger | `#b3261e` on `#fbe0dd` | errors, rejected moves |

**Dark**

| Token | Value |
|---|---|
| background | `#1a221c` |
| surface | `#232e26` |
| text | `#f3ead9` |
| action | `#ff8a3d` |
| highlight | `#9bb08a` |
| danger | `#ff7b6b` |

**Type.** Bricolage Grotesque 700 for display. IBM Plex Sans for body. IBM Plex
Mono for numbers, scores, and dice.

**Radii.** 6, 8, and 12 px.

**Themes.** Light and dark, following the system setting, with a manual toggle.

## Tone

**CONFIRMED:** the product is called Zekel Universe to players. The domain is
zekel.games.

**CONFIRMED:** copy is warm and plain outside the game: short sentences,
everyday words, no jargon. Inside the game, the narration of AI moves and
outcomes is written in the game's own voice; some games have a dramatic game
master voice, most are matter-of-fact.

## Deliverables

- Every screen above, desktop first, light and dark for the table and home at
  minimum. Phone versions in the later pass.
- The eight primitives as components, with all states, both sizes, and a
  written motion spec for each (what moves, from where, how long, what easing).
- The AI slideshow moment, designed end to end: a move animating, its caption,
  the pace control.
- The Roll and the Draw, as animations.
- A token sheet: colors, type, spacing, radii, shadows, motion durations.
- Reference boards: one screen of each of these four games composed from the
  primitives, to prove the system covers them. Each game has its own reference
  document in `docs/games/` with every component, count, color, turn step, and
  moment to animate, plus reference images where they exist:
  - **Fractured Fist** ([docs/games/fractured-fist.md](games/fractured-fist.md))
    — two players, each with a deck, hand, and discard; a card-driven fighting
    game.
  - **Cybernoir 2127** ([docs/games/cybernoir-2127.md](games/cybernoir-2127.md))
    — two players, a city of 19 locations, one hidden hideout the Detective
    narrows down. No reference images exist; the look comes from the text.
  - **Sweetlands Imperium** ([docs/games/sweetlands-imperium.md](games/sweetlands-imperium.md))
    — two to five players, an 80-space area-control board, a shared card deck,
    many tokens. This is the hard one on a phone.
  - **Warble Way Galaxy** ([docs/games/warble-way-galaxy.md](games/warble-way-galaxy.md))
    — one player, a character sheet, a crew, a ship, dice checks, and a
    narrator. This is the first voice-only game.

## Out of scope

- The designer-upload flow.
- Marketing pages beyond the home page.
- Anything that decides a rule. The engine does that.
