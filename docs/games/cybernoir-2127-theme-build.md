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

Nothing here is built yet.

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
Plex Sans and Mono (body and figures). Chakra Petch is OFL 1.1; when it is
bundled into `apps/web/public/fonts`, add it to the fonts section of
`ATTRIBUTIONS.md`.

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
in `docs/games/cybernoir-2127/` are not committed yet; the owner recorded the
model and license so they can be. Commit them and the crops only with the
`ATTRIBUTIONS.md` entry. Do not add images made with any other model or add-on
(a LoRA, an upscaler) without recording its license the same way.
