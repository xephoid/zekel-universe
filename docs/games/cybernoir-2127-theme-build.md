# Cybernoir 2127 — the rain and neon theme, what to build

Started 2026-10-02. Written for whoever implements the theme on the Cybernoir
table. The design is in
[`docs/design/cybernoir-rain-neon/`](../design/cybernoir-rain-neon/README.md);
read its README first. Rules, cards and counts come only from
[`cybernoir-2127.md`](cybernoir-2127.md). The functional work in
[`cybernoir-2127-build.md`](cybernoir-2127-build.md) (clue rail, case file,
verb bar, who you can reach, upkeep and block panels, hands that grow) is
already built; this pass changes how those pieces look and adds the map and
the portraits. It moves no rule and adds no new move.

Built so far (2026-10-02): item 1, the theme hook, with Chakra Petch, Special
Elite and Share Tech Mono self-hosted; item 2, the subway map. The map is a
new station mode of the map primitive (`nodeShape: 'station'`, with `lines`,
column `areas` and per-station marks); its positions are in
`apps/web/src/glue/cn/metro.ts`, taken from `Metro-Map.dc.html` with the table
board's short names. The table stretches the map to the room it has, as the
table boards do, so the bends are 45° only at the design's proportions. Below
300 px tall the names collide, so the map stops shrinking there. Item 3, the
clue tokens: a `token` shape for the track (`spaceShape`) and the pool
(`itemShape`, with `caption` and `sash` per item); each coin's lettering is
sized to its longest word so a faction name never breaks mid-word. Item 4,
the portraits: the 50 crops are in `apps/web/public/art/cybernoir/` under the
engine's person ids (`glue/cn/faces.ts`); Contact cards carry the tall crop,
and `cn.css` draws it as a camera grab with filters and a scanline mask on the
image itself. Cards gained `stamp` (BLOWN) and `backLabel` (NO SIGNAL), and
the Hacker's side has the informants facing them. Camera numbers and match
boxes are left off for now: they are flavour, and the card faces (item 5) are
the place to decide them. Item 5, the cards: the card primitive has two
layouts, `portrait` (a Contact) and `sign` (a Location), with `costStyle:
'pips'`, `emblemUrl`, `code`, `meter`, `faces` and `note`; the faction marks
and the Witness eye are SVG files in `apps/web/public/art/cybernoir/logos/`,
taken from the contact cards on the canvas. Hand sizes are the boards'
(118 × 196 and 196 × 134). Every Location in the Detective's hand is stamped
NOT IT, because the engine counts every card they hold as ruled out. The
camera numbers stay off. The red top edge on a Hacker's Contact is left off:
the Hacker's view says how many informants are face down but not who, so it
cannot single out a Contact. The full-size cards (240 × 360, 460 × 290) are
not drawn anywhere on the table yet. Item 6, the tables: `cn.css` places the
page's own parts on one grid (map and clue row, then the hand, then the
lesson and verbs on the left; a 404 px column on the right), the caption
moves to the side column (`captionInSide`, a new glue flag), and the glue
puts the jail, both seats' counts and the deck in the side column, the case
first. The Location deck count is in the top bar as the case clock. Who you
can reach is a list of rows; a tap still offers Arrest and Recruit as the
engine lists them, rather than buttons on each row. On a 900 px tall window
with the lesson note open, the clue row scrolls just out of view. Item 7,
motion: `data-flip-from` may now name several origins separated by "|" (the
first that was on the table wins), and a part marked `data-flip-ghost` flies
as a copy over the table, as cards do. Hand card ids carry their place, so
each card names every place it could have held: cards slide along the hand
when one leaves, and the played station's diamond (`MapNode.markFrom`) flies
from the card to the station. Discards and the case file fly from the hand, a
recruited informant from the reach list, a revealed one (Hacker's side) from
where a face-down one was. Tokens and diamonds are moved by the motion system
only, so nothing animates on page load. A revealed informant's camera grab
flickers once; the card itself does not fade. The case file shows each face
and the line "at <home>" (54 × 80 slots), since where Evidence lives is how
the Detective narrows the city down.

Items 1 to 7 are built. Item 8, the phone, was added on 2026-10-02 and is not built.

## Before anything else

1. **Render every board.** Open each `.dc.html` in
   `docs/design/cybernoir-rain-neon/` at its own size, screenshot it, and fix
   overlaps in the working files before copying anything into the app.
   Done 2026-10-02; the README lists what was fixed. Not yet republished
   with the `design` skill.
2. **Confirm two portraits with the owner.** `Deckard Voss.png` and
   `Gus_the_noodle_guy.png` were used as named; check that is intended.
3. **Run the security playbook in documentation mode** for this hand-off, and
   change mode once code lands.

## What to build, in order

### 1. The theme hook

The Cybernoir table picks up its look through the glue's `themeFor`, the same
way Fractured Fist (arcade) and Neither Guts nor Gears do. Tokens, from
`Main.dc.html`:

| Use | Value |
|---|---|
| Ground (wet asphalt) | `#0A0D13` |
| Panel | `#121722` |
| Rule | `#242B3A` |
| Text | `#E8ECF2` |
| Muted text | `#8A93A6` |
| Detective accent (stamp red) | `#E23B45` |
| Hacker accent (glacier ice) | `#5FE3FF` |
| Detective panel (dark manila) | `#1F1B15` / border `#3A3226` |

Faction colours, which are also the subway line colours, keyed by the engine's
affiliation ids:

| Faction | Colour | Line code |
|---|---|---|
| OmniSuperUltra Corp | `#4D7CFF` | OSU |
| Shizuoka Inc | `#1ED19A` | SHZ |
| Iceden Collective | `#5FE3FF` | ICE |
| None (citizens) | `#A7ADB8` | CIV |
| Crimson Clan | `#FF3B5C` | CRM |
| Chimera | `#B26BFF` | CHM |

Type: **Chakra Petch** (new: signage, names, headers), Special Elite
(Detective titles and stamps), Share Tech Mono (Hacker titles and prompt), IBM
Plex Sans and Mono (body and figures). All are OFL 1.1, self-hosted in
`apps/web/public/fonts` and credited in `ATTRIBUTIONS.md`.

### 2. The subway map (the map primitive)

Source: `Metro-Map.dc.html` (full size) and the fitted map inside both table
boards (988 × 440). Station positions are in the 1440-wide frame of
`Metro-Map.dc.html`; the tables scale them into the box and use short names
("Platinum 1337x", "Resident Block").

- Three zones, one per borough, with the borough name and tagline.
- Six polylines drawn with 45° bends, one per faction, through that faction's
  locations. They are decoration that encodes affiliation. **They are not
  routes** and must never be clickable or animated as travel.
- Each station: a ring in its line colour, the name above or below, and a 0–3
  population bar.
- States, all driven by the seat's view:
  - **Played (public):** red diamond, red name. Was "on the board".
  - **Crossed off (Detective only):** dashed grey ring, struck-through name.
  - **Ruled out by a clue (public):** the whole station at 30% opacity.
  - **Still possible:** ring glows in its line colour, name bold.
  - **Safehouse (Hacker only):** glacier-ice diamond around the station, name
    in ice. Driven by the name the engine now puts in the Hacker's view; never
    inferred in the glue.
- A "NOT Chimera" clue dims the whole purple line's stations. This falls out of
  "ruled out" with no extra code.

### 3. Clue tokens as fare tokens

Three truthful slots (Borough, Population, Affiliation), empty as a dashed
circle with "?", filled as a solid circle with the value. NOT tokens are dashed
circles with a red diagonal NOT sash; an affiliation NOT uses that faction's
colour.

### 4. Portraits

- Copy the 50 crops from `docs/design/cybernoir-rain-neon/assets/faces/` into
  the app's public assets, keyed by person (map file names to the engine's
  person ids). `crops.json` holds the box for each, so they can be remade from
  the 512 × 512 originals in `docs/games/cybernoir-2127/`.
- The camera-grab look is applied when drawn, not baked in:
  `filter: blur(4px) grayscale(0.75) contrast(1.25) brightness(0.9)`, the image
  scaled to about 1.1 so the blurred edge is hidden, an overlay of
  `rgba(40,140,80,0.22)` with `mix-blend-mode: color`, and scanlines
  (`repeating-linear-gradient` of a 1 px dark line every 3 px). Small faces
  (24–40 px) use a lighter blur, about 1.2–1.6 px.
- Camera numbers, timestamps, face-match boxes and match percentages are
  **flavour only**. They carry no game information, must not vary with game
  state, and must not look like they do. If they risk reading as a hint, drop
  the percentage first.
- A face-down informant, as the Hacker sees it, is static reading "NO SIGNAL".
  A revealed informant shows its portrait with a red "BLOWN" stamp.

### 5. Cards

- **Contact / POI, tall.** Full size 240 × 360 (`All-Contacts.dc.html`); in the
  Hacker's hand 118 × 196 (`Table-Hacker.dc.html`). Portrait on top; cost as
  ice diamonds, or "FREE"; the faction's A logo top right (Witnesses: the eye);
  name over the portrait's foot; affiliation; the ability text; home location
  with that location's line bullet. Witnesses carry a WITNESS tag with the eye.
- **Location, wide.** Full size 460 × 290 (`Card-Shapes.dc.html`); in the
  Detective's hand 196 × 134. A white platform sign with the line bullet and
  name, borough, population bar, affiliation, and the faces of the people who
  live there. A Location the Detective has seen in hand gets a red "NOT IT"
  stamp in their own hand only.
- The red top edge on a Hacker's Contact ("someone you could be blocked on")
  must come from public information only: the Hacker knows how many informants
  are face down, not who. If the engine cannot say it from the Hacker's view,
  leave the edge off.

### 6. The two tables

`Table-Detective.dc.html` and `Table-Hacker.dc.html` keep the layout already
decided: top bar, the map with the clue row under it, the hand and the verb bar
along the bottom, and the 404 px side column (the "bench") on the right.

- Detective bench: the Hacker's case (13 slots, portraits in the filled ones),
  who you can reach (portrait, name, Arrest 1 and Recruit 3), the holding cells,
  the log.
- Hacker bench: their case, the informants facing them (static for face-down,
  portrait for revealed), the holding cells, a summary of the Detective.

### 7. Motion

The motion language still holds: nothing appears in place. Cards fly, tokens
drop into their slot, a played station's diamond lands as the card reaches the
board. The camera grab may flicker briefly when a card is revealed; that is
not a fade-in of the card itself.

### 8. The phone (added 2026-10-02, built 2026-10-04)

The owner brought the phone forward for Cybernoir, as was done for Fractured
Fist; the brief's later phone pass still holds for the other games. Use the
shared phone frame (`table/phone.ts`, the glue's `phone: true`, narrower than
640 px): the side column goes and sheets slide up from the bottom. The boards
are the four `Phone-*` files in `docs/design/cybernoir-rain-neon/`, at
390 × 844. Render them first, as was done for the desktop boards.

- **The map becomes a small overview plus a list.** A thumbnail of the whole
  subway map, stations only, no names, in the same states as the desktop map.
  Under it, three borough tabs (Downtown 6, The Hive 6, Boonies 7); each opens
  a list of that borough's stations, one row each (at least 44 px): the state
  mark, the short name, the population bar, a state word ("Still possible",
  "Canvassed", "Seen in hand", "Ruled out", and for the Hacker "Your
  hideout"), the residents' faces and the line bullet. Crossed off and ruled
  out are struck through as well as dimmed, as `cybernoir-2127.md` suggests
  for a phone. Which tab opens first is open; the board shows Boonies, where
  the still-possible stations are.
- **Clues and holding cells share a strip**, small fare tokens (40 px) and the
  three cells with one face and name each.
- **Your hand is a row you swipe.** The Detective's wide Locations
  (196 × 134) and the Hacker's tall Contacts (118 × 196), the next card
  peeking at the edge so the row reads as one you can swipe.
- **Informants:** the Detective sees four small camera grabs; the Hacker sees
  one strip: a static back per face-down informant, a face per revealed one.
- **The case** is the 1 + 3 + 3 × 3 grid of small slots (30 × 40). The
  desktop's "at <home>" line does not fit at this size; where it goes on a
  phone (the card up close, or a long press) is open.
- **Verbs** are a grid above the bottom of the screen: 3 × 2 for the
  Detective, 4 × 2 for the Hacker, every button at least 48 px tall.
- **A tap on a card opens it up close** in a sheet: the full-size card
  (240 × 360), one line on what playing it does, and its actions with costs,
  as the engine lists them. This matches the Fractured Fist phone's card
  sheet.
- **Opponent:** counts only (hand, deck, discard), plus the public rows.

Where the phone boards disagree with what the desktop build decided (camera
numbers, the Hacker's red edge, per-row Arrest and Recruit buttons, NOT IT),
follow the desktop build; the canvas README lists them.

Built (2026-10-04). The glue says `phone: true`, and the table now passes
`phone` in the glue's input, so on a phone the plan puts every zone in one
column (`phoneColumn`): the city, the clue strip (clues, NOT tokens, holding
cells), then your informants or the ones facing you, your hand, who you can
reach, the case, the discards, and both seats' counts; the deck piles go and
the top bar's short status says how many Locations are left. The map
primitive draws the list with `MapData.listView` (an overview without names,
a tab per borough, a row per station with `note`, `code` and `faces`). For a
game drawn from its plan, the table opens a tapped card up close on a phone
(`CardUpClose`, beside the card's moves as the engine lists them); a second
tap does it. Decisions where this item was open: one scrolling column, no
bottom tab bar (the menu sheet holds the log and the last move); the list
opens on the borough with the most stations still possible; an Evidence
card's "at <home>" is on the card up close.

## Check against the house rules

- **Player agency:** no step is auto-resolved by this pass. Every verb, the
  upkeep and the block keep their existing prompts.
- **Hidden information:** the Detective's crossed-off marks and hand, the
  Hacker's safehouse and hand, and face-down informant identities appear only
  in their owner's view. Test both seats.
- **Primitives:** the map, card zones, track (holding cells), pools (clues) and
  tableaux (benches) take the engine library's data fields; the theme supplies
  colours and art keyed by id.

## Rights

The portraits were generated by the owner with DreamShaper 8 (CreativeML Open
RAIL-M) in ComfyUI; see the canvas README and `ATTRIBUTIONS.md`. The originals
in `docs/games/cybernoir-2127/` and the crops were committed on 2026-10-02 with
the `ATTRIBUTIONS.md` entry. Do not add images made with any other model or add-on
(a LoRA, an upscaler) without recording its license the same way.
