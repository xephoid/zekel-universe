# Warble Way Galaxy: the hologram logbook theme — the design canvas

Start here. This folder is the source of truth for how the Warble Way Galaxy
table looks once it has its own theme: a captain's logbook read off a ship's
console in deep space. Hull-navy panels on a starfield, FFD700 gold as the
signal colour, hand-drawn portraits shown as flickering gold holograms, and
attackers in red. The rest of Universe keeps the brief's look; only the
Warble Way table changes, the same way the other game themes work.

What to build is in
[`docs/games/warble-way-galaxy-theme-build.md`](../../games/warble-way-galaxy-theme-build.md).
Every rule, card, cost and turn step still comes from
[`docs/games/warble-way-galaxy.md`](../../games/warble-way-galaxy.md), with the
engine as the source of truth. Nothing in this folder is a rule. The numbers on
the boards are one sample position (Ressa Vane, a Grull Privateer, level 2,
1,240c, ship Damaged, crew 7EE700 and Slate), not a fixture.

## Read in this order

1. This file.
2. `docs/games/warble-way-galaxy-theme-build.md`.
3. Open `Main.dc.html` (palette, type, icons, card kinds, counters), then
   `Table-Space.dc.html`. It is the whole table in space at 1440 × 900 and shows
   how the other boards fit together.

Each `.dc.html` file is a design-canvas page. Images point at `assets/` in this
folder. The canvas runtime (`support.js`) is not in this folder, as with the
other canvases. Every board was rendered and checked in a headless browser on
2026-11-02; see "Rendered and fixed" below.

## What is here

| File | What it is | Status |
|---|---|---|
| `Main.dc.html` | Look and feel: palette, type, races, the five travel-card kinds, icons, tracks and counters (damage plates, red shirts, dread). | Chosen |
| `Table-Space.dc.html` | The table in space: a hazard drawn, the choice of option, the roll with a consumable toggle and the red-shirt save, journey stack, character sheet, ship. | Chosen |
| `Habitat.dc.html` | Docked at a habitat. Tweak `habitat` switches between all three; tweak `overlay` opens Equip gear, Release crew, Tinker and fabricate (locked), and the departure peek. | Proposed |
| `Encounter.dc.html` | Space cards other than hazards and pirates. Tweak `card`: ♥ recruit adrift, ♣ job offer (with the journey-stack preview), ♣ ruin expedition, ♦ ruin found (depth picker). | Proposed |
| `Pirate.dc.html` | A pirate fight. Tweak `phase`: Approach (run silent or engage), Round result (Flying Ace reroll), Exchange (six actions), Board or leave (who leads the boarding), Capture (keep or take the ship). | Proposed |
| `Setup.dc.html` | Character creation (archetype, recommended 3·2·1, distribute 6) and level up. Tweak `screen`. | Proposed |
| `RuinSetup.dc.html` | Ruin setup on the real R1 map: who goes in, threat 1–3, start spot, which three attacker spots. Tweaks `threat`, `terrain`. | Proposed |
| `Ruin.dc.html` | A ruin round on R1: party, attackers, cache and being tables, reachable squares, the actions. Tweak `terrain`. | Chosen |
| `Ruin-Terrains.dc.html` | The four ruin looks: starry derelict, rocky cavern, alien hive, metal hulk. Rolled at random in play. | Chosen |
| `Cards.dc.html` | All 52 travel cards with names. Tweak `stock` (hull navy chosen). | Chosen |
| `Phone.dc.html` | Phone (390 × 844) in space: a hazard and the roll. | Proposed |
| `Holograms.dc.html` | Five hologram treatments tried on the portraits; gold archive won. | Reference |
| `Holo-Icons.dc.html` | Seven icon treatments; glitch, keeping each icon's colour, won. | Reference |
| `assets/portraits/*.jpg` | 17 clean-line tokens: the four races, the red shirt, twelve ruin attackers. 256 × 256. | Chosen |
| `assets/sketches/*.jpg` | The four race portraits at full size, pencil and ink (on `Main`). | Chosen |
| `assets/holograms/*.jpg` | Four generated hologram images. Reference only, not used on the tables. | Reference |
| `assets/icons/*` | The game-icons.net shapes the boards use, as alpha masks. | Chosen |
| `canvas.json` | The canvas layout. | — |

## Decisions the owner made (2026-10-14 to 2026-10-19)

- **Palette.** Void `#0d1124` behind everything; hull panels `#1a2042`; cards
  and the main panel in **Hull navy `#1f2650`** (the owner rejected white and
  cream); text Starlight `#ece8dc`; lines `#3d4880`; signal gold `#FFD700`.
  Card kinds: recruit `#4cc9b0`, pirate `#f07070`, ruin `#f2b544`, hazard
  `#ad90f7`, job `#6eaaff`. Red shirts `#f07070`, dread `#e070d0`. Dark text
  sits on gold, never light.
- **Type.** Chakra Petch for names and labels, IBM Plex Sans for body, IBM Plex
  Mono for numbers, Kalam for the ship's name and crew names on the ruin map.
- **Portraits are the owner's own race drawings**, restyled as pencil and ink,
  then redrawn as clean bold line art for small sizes (the sketches were too
  busy at token size). Keep the owner's designs: the human pilot is a Black
  woman, the Grull has four arms, the Hexapods ride a walker in a glass dome.
  An earlier generated set changed all three and was rejected; do not bring it
  back.
- **Every portrait is a gold hologram** (the "gold archive" treatment), and
  **attackers are red**. Both glitch: a magenta (gold) or cyan (red) ghost slips
  sideways every few seconds.
- **Icons keep their own colours** and glitch with a pink ghost.
- **Travel cards use icons, not suits** for their kind: recruit = being icon,
  pirates = skull (the attacker icon), ruin = round silo, hazard = meteor impact,
  job = satellite. The habitat icon is the ringed planet. Death checks use the
  disintegrate icon.
- **The ship's damage track is four chevron plates** that go dark and cracked as
  they are lost, with a "ship lost" ring at the end.
- **The ruin map looks like a space scan**, in one of four terrains rolled at
  random. Tokens are 70% of a square, all the same size, with a 3 px ring.
- **Two counters were added to the sheet**: red shirts (unnamed crew, cap = best
  natural DIP) and dread (0–3).
- **Names.** Every recruit card, job, ruin, habitat mission, shop item and
  cantina being has a lore name; the list is in the build document, appendix A.
  The Grull crew member on the boards is **Slate** (the Xaxalon 4 cantina
  Grull); **Flint** is the ♥2 recruit card.

## Rendered and fixed (2026-11-02)

Every board, in every tweak setting (55 renders), was opened in headless
Chromium at its own frame size with a stand-in for the canvas runtime, served
over a local HTTP port (the masked icons do not load from `file://`), and
checked for text that overlaps, wraps badly or is cut off. Fixed in the working
files:

- **Table in space.** "GUN 0 +1" wrapped in the Finesse column; it now reads
  "GUN 0+1" on one line. The right column was 26 px taller than the frame
  (the crew panel pushed the whole grid 6 px past the board), so the column
  gap, the crew panel's gap and the two counter captions were tightened.
- **Habitat.** Cantina rows with two abilities ("+1 SWA +1 DIP") made the
  line under the name wrap; the abilities now stack. In Equip gear,
  "WinchesterZhang Plinker · +1 GUN" broke with "GUN" alone on the second
  line; the name and the bonus are now two lines by design. In the departure
  peek, the mini card's "DIP 10 · crew unrest" and "DEM 15 · death check"
  broke mid-phrase; each row is now ability left, cost right.
- **Pirate fight.** The pirates' dice line ("… − your armor 0 = 10") wrapped
  its total onto its own line; it now says "− armor 0". "Talk survivors
  aboard" broke into three lines beside its "red shirts full" tag; the option
  is "Talk survivors" and a tag that does not fit drops under the title
  (the same rule now applies to the encounter options).
- **Setup.** "Recommended 3 · 2 · 1" wrapped inside the fixed-width score
  method control; the control now sizes to its tabs. "LAUNCH FROM XAXALON 4"
  wrapped with the "4" alone; the button no longer wraps.
- **Ruin setup.** "4 · PLACE ATTACKERS" and "3 of 3 placed" fought for one
  line; the header is "4 · ATTACKERS". The red shirt's stats wrapped next to
  the checkbox; "one hit" is "1 hit" (on the ruin board too).
- **Dread counter.** The lit pirate flag had a `drop-shadow` on the masked
  icon, which the mask clipped (the build document's known risk); the glow
  moved to the icon's wrapper on the sheet, the habitat and `Main`.
- **Main.** The type sample "PIL · HAK · DIP" wrapped beside its note.
- **Travel cards.** The footnote ended in a stray semicolon.
- **Skills icon (2026-11-03, found while building item 2).** `assets/icons/skills.png`
  was fully opaque, the light shape on its dark square, so as a mask it
  drew a solid square; the square is now transparent and the shape the
  mask. It showed on `Main` (the skills counter) and the phone.
- **Frames.** `canvas.json` heights now match the rendered boards: the space
  table and the habitat are 900, not 956 and 938; the cards board is 2900,
  holograms 2600, hologram icons 1830, ruin terrains 1900, `Main` 2720. The
  `$preview` sizes of the reference boards follow.

Checked and left alone: "Bounty on Krazz's Crew", the Providence Zero blurb
and every job blurb fit their cards; "Broker a deal" and "Slip into their
code" take two lines in the 3-up encounter options; on the Distribute 6
screen "Talk attackers over, hire red shirts" takes two lines next to its
stepper; the phone's "Meteor shower" title takes two lines in its small card.
The canvas runtime (`support.js`) is not in this folder.

## Not decided, or my guesses (please confirm)

- The habitat blurbs for Kookookachaa (a Kralkin sky-platform) and FFD700 Base
  (a Hexapod pod-base under Kralkin guard) were invented; the docs give none.
- Whether a consumable can be used on the 4-dice fight roll. The pirate board
  leaves the toggle off.
- The captain cannot be released; released crew leave at the habitat; one
  being leads a boarding and makes the death check if it is lost.
- What a ruin found in space pays (the encounter board says caches, beings and
  XP, not credits).
- Short descriptions of the basic skills and of Expert Combat Tactics on the
  setup board were written for the board, not taken from the rules.
- The ♣8 job ("Ring run") uses the ringed planet as its art, which is now also
  the habitat icon. It may want different art.

## The portraits and their rights

Every image in `assets/portraits/`, `assets/sketches/` and `assets/holograms/`
was made with Apache 2.0 models, as described below, and recorded in
`ATTRIBUTIONS.md`. The first versions were made with Qwen Image 2.1, whose
licence is research only, and none of them was used as input for the new ones.
Nothing from `docs/games/warble-way-galaxy/inspiration-x/` was used.

The first clean-line tokens were made with this instruction on each sketch: "Redraw
this exact character as a clean bold ink line drawing for a small game token.
Head and shoulders close-up, face large and centered, filling the frame. Thick,
smooth, confident outlines of even weight… No cross-hatching, no sketchy
strokes, no texture, no shading… Black ink on plain flat off-white paper. Keep
the same character design." Each was cropped to the face (or the whole creature
for attackers), its lines thickened by a 3 px minimum filter, and saved at
256 × 256.

**The four race tokens were replaced on 2026-11-03** (`assets/portraits/human.jpg`,
`kralkin.jpg`, `grull.jpg`, `hexapod.jpg`). The new ones were made with the
Apache 2.0 models **Qwen-Image-2512** and **Qwen-Image-Edit-2511**, the same
models as the game cover art, and never used a Qwen Image 2.1 image as input:

1. The human and the Kralkin were painted on a plain background from the Warble
   Way cover (the captain and the eagle-headed officer). The Grull was painted
   the same way from a text-only Grull render written from the owner's pencil
   sketches. The Hexapod was painted from a text prompt alone.
2. Each painting was redrawn as line art with the instruction above, then
   cropped, thickened by a 3 px minimum filter and saved at 256 × 256.

The Grull's lower pair of arms should end in a single mantis-like claw each; the
model only roughly gets this.

**The red shirt and the twelve attackers were replaced the same day**, with the
same two models and no Qwen Image 2.1 image as input. Each was drawn by
Qwen-Image-2512 from a text prompt alone, then redrawn as thin line art by
Qwen-Image-Edit-2511, then cropped and thickened as above. The second step
matters: on the table the hologram inverts the image, so black shading turns
into a solid pale blob. The burrow beetle and the pirate boarder took a second
redraw to get simple enough. The hive brute is now a wasp-like soldier, because
the first tries looked too much like the creature from the Alien films.

**The sketches and holograms were replaced on 2026-11-04** (`assets/sketches/`
and `assets/holograms/`), so they show the same characters as the tokens.
Qwen-Image-Edit-2511 painted the human, Kralkin and Grull as full figures from
their new paintings; the Hexapod's painting already showed the whole pod. Each
figure was then redrawn twice with the same model, once as a pencil sketch and
once as a cyan projection over a brass emitter. The Grull's serpent tail follows
the owner's pencil sketch. The human sketch's head was lightened by hand (a
gamma curve), because the hologram inverts the image and her dark skin otherwise
turned into a blank pale head.

No Qwen Image 2.1 image remains in `assets/`.

The icons are from game-icons.net by Lorc, Delapouite and other contributors,
under CC BY 3.0.
