# Cybernoir 2127: rain and neon theme — the design canvas

Start here. This folder is the source of truth for how the Cybernoir 2127 table
looks once it has its own theme: a dark, rainy city at night, the six factions as
subway lines, and the people shown as blurry street-camera grabs of generated
portraits. The rest of Universe keeps the brief's look; only the Cybernoir table
changes, the same way the Fractured Fist arcade theme works.

What to build is in
[`docs/games/cybernoir-2127-theme-build.md`](../../games/cybernoir-2127-theme-build.md).
Every rule, card, cost and turn step still comes from
[`docs/games/cybernoir-2127.md`](../../games/cybernoir-2127.md), with the engine
as the source of truth. Nothing in this folder is a rule. The numbers on the
boards are a sample turn-7 position, not a fixture.

## Read in this order

1. This file.
2. `docs/games/cybernoir-2127-theme-build.md`.
3. Open `Table-Detective.dc.html` and `Table-Hacker.dc.html`. They are the whole
   table for each seat at 1440 × 900 and show how every other board fits together.

Each `.dc.html` file is a standalone page and renders in a browser. Every board
was rendered and checked on 2026-10-02 (see "Rendered and fixed" below).

## What is here

| File | What it is | Status |
|---|---|---|
| `Table-Detective.dc.html` | The Detective's whole table, turn 7. | Proposed |
| `Table-Hacker.dc.html` | The Hacker's whole table, the same turn 7. | Proposed |
| `All-Contacts.dc.html` | All 25 Contact / POI cards, tall, with portraits and faction logos. | Chosen |
| `Card-Shapes.dc.html` | Contacts tall, Locations wide, as in the owner's prototypes. | Chosen |
| `Metro-Map.dc.html` | The 19 locations as a subway map; the legend for every map state. | Chosen |
| `Logos.dc.html` | Three marks per faction. Column A is chosen for every faction. | Chosen (A) |
| `Main.dc.html` | Palette, type, motifs, the two seats' looks. | Chosen |
| `Location-Cards.dc.html` | Three dressings for a Location card. The tables use A (platform sign). | Open |
| `Mugshots.dc.html` | The same six portraits at three blur levels. B (camera grab) is chosen. Reference only. | Reference |
| `Phone-Detective-Map.dc.html` | Phone (390 × 844): the Detective's map as a small overview plus borough tabs with a station list. | Proposed |
| `Phone-Detective-Hand.dc.html` | Phone: holding cells, the Location hand, informants, who you can reach, the verbs. | Proposed |
| `Phone-Hacker-Hand.dc.html` | Phone: informants facing you, the Contact hand, the case, clues, holding cells, the verbs. | Proposed |
| `Phone-Hacker-Card.dc.html` | Phone: a Contact opened up close in a sheet from the bottom. | Proposed |
| `assets/faces/*.jpg` | Face crops of the 25 generated portraits: `<name>.jpg` square, `<name>-tall.jpg` 3:4. | Chosen |
| `assets/faces/crops.json` | The crop box for every image, so the crops can be remade from the originals. | — |
| `canvas.json` | The canvas layout. | — |

## Decisions the owner made in this pass (2026-09-29 to 2026-10-02)

- **The theme is Cybernoir's own.** Dark wet-asphalt ground; the six faction
  colours are the only strong colours; stamp red for the Detective, glacier ice
  for the Hacker. The Detective keeps the typewriter and rubber stamps (a case
  file after dark); the Hacker keeps the terminal (scanlines, prompt).
- **The city is a subway map.** Each faction is a line. Every faction happens to
  own exactly one location in each borough, so each line crosses all three
  boroughs; "No affiliation" is the grey line with a fourth stop in Boonies. The
  boroughs are the map's three zones. Population is a 0–3 bar under each name.
  The lines say who owns a place; nobody travels on them, and the legend says so.
- **People are shown as street-camera grabs** of the owner's generated portraits:
  cropped to the face, blurred, colour drained, a green cast, scanlines. Rejected
  on the way, in order: anime-style mugshots, code-drawn silhouettes, pixel-art
  avatars, fingerprints. Do not bring any of them back.
- **Contacts are tall cards, Locations are wide cards.**
- **Logos: column A for every faction.** OmniSuperUltra the three broken rings,
  Shizuoka the mountain seal, Iceden the circuit snowflake, Crimson Clan the
  fanged lips, Chimera the three heads in spray paint (the owner asked for a
  messier Chimera; that column now holds three messy versions and A is the spray
  paint one). **Witnesses are an eye.**
- **Clue tokens look like fare tokens**: truthful ones solid, NOT ones dashed with
  a red NOT sash.

## Not decided

- **Location card dressing.** The tables use option A (platform sign). B
  (security-camera still) and C (neon sign) were never ruled out.
- **Message-board avatars** for an online profile. The last proposal was the
  faction logo, roughed up; the owner did not respond to it. Not needed for the
  table.

## Rendered and fixed (2026-10-02)

At the owner's request every board was opened in a headless browser at its own
size, screenshotted, and checked for text that overlaps other text or is cut
off. Fixed in the working files:

- **Both tables.** Clue tokens: the labels read "POPULAT" and "AFFILIA"; now
  "POP" and "AFFIL", as on the map board. NOT tokens: the value ran under the
  sash and past the circle; the sash moved up and the value sits on the
  widest part. Holding cell 3 now reads "3 RELEASING" (it wrapped). Verb
  buttons size to their own text, so "+1 AP · they draw 2" and "free · a
  full set" are no longer cut.
- **Detective table.** Informant names wrap instead of "DECKARD V..."; the
  line under them says "face down" or "face up".
- **Hacker table.** Little Ghana's label moved below the safehouse diamond,
  which sat on its population bar. The clue caption no longer wraps under
  the tokens.
- **Metro map.** OSU Corporate's label sat on the DOWNTOWN header; it is now
  under the station. The NOT CHIMERA token got the same fix as the tables.
- **Contact cards** (`Card-Shapes`, `All-Contacts`). The camera number ran
  into long names; it now sits under the faction mark.
- **Location card** (`Card-Shapes`). Three regulars pushed the line strip out
  of the card; the regulars' faces are 32 px now.
- **Logos.** OSU-B's "ULTRA" ran off the right edge.

Checked and left alone: Junktown's label clears the map edge; the blur and
grain on `Logos.dc.html` render as intended. The canvas runtime
(`support.js`) is not in this folder; the boards render without it.

## The phone boards (added 2026-10-02, rendered and built 2026-10-04)

Four phone screens, same turn-7 position as the tables. The owner asked for
them after the desktop theme was built; what to build is item 8 of the build
document. They were drawn before the desktop build settled a few things, so
where a phone board and the built desktop table disagree, the built table
wins: no camera numbers or match boxes, no red edge on a Hacker's Contact, NOT
IT on every Location in the Detective's hand, and who you can reach as rows
that open the engine's own Arrest and Recruit choices rather than buttons on
each row. The bottom tab bar (Map, Hand, Case, Log) is a proposal; the shared
phone frame from the Fractured Fist work (menu button and sheets) may be the
better home for Case and Log.

Rendered at 390 × 844 on 2026-10-04 and checked for overlaps. Fixed in the
working files, as on the desktop boards: the NOT tokens' values ran under the
sash (`Phone-Detective-Map`, `Phone-Hacker-Hand`), and the Detective's
informant names were cut to "DECKARD V..." (`Phone-Detective-Hand`; they wrap
now, over "face down" or "face up"). The hand rows running past the right
edge are the swipe, on purpose.

Decided in the build where the boards left it open: the phone is one
scrolling column under the shared phone frame's top bar and menu (the log and
the last move are in the menu sheet), not a bottom tab bar; the station list
opens on the borough with the most stations still possible; where an
Evidence card's person lives is on the card up close, a tap away.

## The portraits and their rights

The 25 portraits in `docs/games/cybernoir-2127/` were generated locally by the
owner in ComfyUI with the **DreamShaper 8** model, which is released under the
**CreativeML Open RAIL-M** license. That license claims no rights in the images
it produces and lets them be used and shared, subject to its use restrictions
(its Attachment A). Purely machine-generated images are probably not protected
by copyright at all (US Copyright Office, 2025), so the project can publish them
but cannot stop anyone copying them. They are credited in `ATTRIBUTIONS.md`.

One thing to confirm with the owner: the image in `Deckard Voss.png` (purple
undercut) and the one in `Gus_the_noodle_guy.png` (sunglasses) were used exactly
as their file names say.
