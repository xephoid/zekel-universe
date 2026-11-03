# Warble Way Galaxy — the hologram logbook theme, what to build

Started 2026-11-02. Written for whoever implements the theme on the Warble Way
table. The design is in
[`docs/design/warble-way-galaxy/`](../design/warble-way-galaxy/README.md); read
its README first. Rules, cards and counts come only from
[`warble-way-galaxy.md`](warble-way-galaxy.md) and the engine. The Warble Way
glue from milestone M4 is already built and plays through in
`e2e/warble-way.spec.ts`. This pass changes how the table looks, adds the
screens for player decisions that have none yet, and adds flavour names. It
moves no rule. Where a board and the engine disagree, the engine wins; note it
here and tell the owner.

Items 0, 1 and 2 are done (2026-11-02 and 2026-11-03; item 0's fixes are in
the design README under "Rendered and fixed"). Nothing from item 3 on has
been built yet.

## 0. Render and check the boards first

None of the boards in the design folder has been opened in a headless browser.
Before building from them, render each at its own size (1440 × 900, the phone
at 390 × 844, the larger reference boards at their `canvas.json` size), screenshot
it, and fix text that overlaps or is cut off in the working files, as was done
for the Cybernoir canvas. Known risks:

- `Habitat.dc.html` measured about 40 px taller than its 900 px frame before
  the row spacing was tightened. The overlays and new buttons may push it again.
- `Table-Space.dc.html` measured 956 px tall on the canvas.
- Long names may wrap: "WinchesterZhang Plinker", "Bounty on Krazz's Crew", the
  ruin blurb for Providence Zero, job blurbs on the 200 × 290 cards.
- Masked icons with a drop-shadow filter lose the glow: the mask clips it.

Record what was fixed in the design README under "Rendered and fixed".

**Done 2026-11-02.** The habitat fits its 900 px frame (the 938 was the
canvas entry). The space table's 956 was also the canvas entry, but its right
column did run 6 px past the board. "WinchesterZhang Plinker" broke in the
Equip gear slot; the other long names fit. The dread flag's glow was clipped.
All fixed; the list is in the README.

## 1. The theme hook and tokens

The theme is the Warble Way table's only, wired the same way as the other game
themes. Tokens (see `Main.dc.html`):

| Token | Value | Use |
|---|---|---|
| void | `#0d1124` | page ground, with a faint 24 px dot grid of starlight at 16% |
| hull | `#1a2042` | side panels |
| hull navy | `#1f2650` | cards, the main panel |
| starlight | `#ece8dc` | text |
| pencil blue | `#a9c4ff` | crew names on the ruin map |
| line | `#3d4880` | rules and dividers |
| gold | `#FFD700` | signal, selection, primary buttons (dark text on it) |
| recruit / pirate / ruin / hazard / job | `#4cc9b0` / `#f07070` / `#f2b544` / `#ad90f7` / `#6eaaff` | card kinds |
| red shirts / dread | `#f07070` / `#e070d0` | the two counters |

Fonts: Chakra Petch and IBM Plex Sans and Mono are already self-hosted. **Kalam**
(OFL 1.1, Indian Type Foundry) is new: self-host it and add it to
`ATTRIBUTIONS.md`, or drop it for Chakra Petch.

## 2. Icons

Every drawing except the portraits is a game-icons.net shape used as a CSS
mask, so it takes its colour from `currentColor`. The files are in
`docs/design/warble-way-galaxy/assets/icons/`; the class each board uses maps
to them like this:

alien → alien-skull · armor → metal-scales · being → being-icon · chest →
locked-chest · convince → convince · crack → cracked-glass · credits →
credits-currency · disintegrate → disintegrate · drink → drink-me · gun →
bolter-gun · idcard → id-card · meteor → burning-meteor · pirate → pirate-flag ·
ringed → ringed-planet · rocket → rocket-flight · satcom →
satellite-communication · ship → spaceship · silo → round-silo · skills → skills ·
skull → skull-crossed-bones · swirl → star-swirl · tag → price-tag · talk →
discussion · world → world. Card art: asteroid, beam-satellite, black-hole-bolas,
bubble-field, alien-bug, planet-conquest, mars-curiosity, defense-satellite,
distress-signal, eclipse, alien-egg, evil-moon, exploding-planet, hypersonic-bolt,
interceptor-ship, lunar-module, meteor-impact, night-sky, observatory,
orbital-rays, radar-dish, rocket, scout-ship, space-shuttle, space-suit,
spiky-field, star-cycle, starfighter, strafe, transportation-rings, ufo, vortex,
explosion-rays, astronaut-helmet, solar-system.

Fixed meanings: habitat = ringed planet; ruin = round silo; recruit and being =
being icon; pirates and attacker spots = skull; hazard = meteor impact; job =
satellite; goal = star swirl; cache = locked chest; death check = disintegrate;
damage = cracked glass; dread = pirate flag.

**Glitch on icons.** Each icon is two stacked copies: a ghost in `#ff4f7b` at
55% opacity, 2 px to the right, and the icon in its own colour. Both jump 2 px
now and then on `steps(1)` timing (keyframes `gxjit`, 2.3–3.4 s, staggered).
The exact CSS is in any board's `.gx` rules.

## 3. Portraits as holograms

Two filters turn the clean-line tokens into holograms. Copy them from
`Ruin.dc.html`:

- **Gold** (`.ga`, crew and recruits): grayscale, invert, contrast 1.45, sepia,
  saturate 3, hue-rotate 8°, brightness 1.08, on `#170d02`, with a scanline
  mask (2 px solid, 1 px at 55%).
- **Red** (`.ga-red`, attackers and pirates): the same with saturate 5,
  hue-rotate −38°, on `#1a0405`.
- **Glitch** (`.gxi`): a ghost copy hue-rotated to magenta (gold) or cyan (red)
  at 60%, 3 px to the right, under the main image in `mix-blend-mode: screen`,
  both jumping like the icons. The wrapper must be sized when the image is
  sized by percentage, or the image grows to 256 px (this broke the ruin map
  once).

Honour `prefers-reduced-motion`: stop the jumps and hide the ghosts.

Portrait files are in `assets/portraits/` (256 × 256): `human`, `kralkin`,
`hexapod`, `grull`, `redshirt`, and the attackers by terrain: rocky
`gravel-crab`, `rock-mite`, `burrow-beetle`; alien `leviathan`, `hive-brute`,
`spore-titan`; metal `sentry-drone`, `loader-mech`, `spider-bot`; starry
`pirate-captain`, `pirate-boarder`, `pirate-gunner`. Recruits use their race's
portrait for now. The large pencil-and-ink race pictures in `assets/sketches/`
are for the setup screen and race panels. The images must be confirmed for
licence before commit (see `ATTRIBUTIONS.md`).

## 4. Travel cards

The card primitive, 200 × 290 on the table. A coloured band with the kind's
icon and the card code; an art ring (icon, or a portrait for recruits); the
title and a short line; then the kind's own bottom block (`Cards.dc.html`):

- ♥ recruit: name, "race role · idealizes stat", need N, ability chips.
- ♦ pirates: "Pirates", the big space attack, then ground, crew, speed, handling,
  hack.
- ♦ ruin: the ruin's name and hook, depth with 1–3 pips.
- ♠ hazard: name, "Pick a way through · 1 XP", two rows of ability + minimum +
  what a failure costs (with its icon).
- ♣ job: title and blurb, two rows of ability + minimum + distance, pay, XP. ♣J–A
  are ruin expeditions with one row.

The names, roles and blurbs are flavour, not rules, but they are per-card
content. **Decide where they live** before building: the engine's reference
data or its lore repository (preferred, so voice and web say the same thing),
or a Universe glue table keyed by card. They are listed in appendix A.

## 5. The tables

Build each from its board. The engine lists every choice; the boards only show
how to draw them.

1. **In space** (`Table-Space.dc.html`; phone `Phone.dc.html`). Character sheet
   on the left, the drawn card and its choice in the middle, journey stack and
   ship on the right. The roll panel: the needed number, who carries it, the
   eligible consumables as a toggle beside Roll, and, on a hazard, the offer to
   spend a red shirt if it fails.
2. **Space encounters** (`Encounter.dc.html`): recruit adrift, job offer with a
   preview of the legs it adds to the journey stack, ruin expedition, ruin found
   with a depth picker that stops at the card's depth.
3. **Pirate fight** (`Pirate.dc.html`): the pirate's card stays on the left with
   round chips (open fire, redline, disabled, captured); the step tracker in the
   top bar; the 4d6 pairing shown as four dice, two brackets and both totals;
   unavailable actions greyed out with the reason ("needs SNE", "needs DEM",
   "red shirts full"). The board's default phase is Approach, as the owner set it.
4. **Habitat** (`Habitat.dc.html`): named rows for missions, shop and cantina
   with stamps (PASSED, FAILED, SOLD, MARKED, ABOARD); the visit actions; the
   overlays for equip, release, tinker and fabricate, and the departure peek.
5. **Ruin setup and ruin rounds** (`RuinSetup.dc.html`, `Ruin.dc.html`,
   `Ruin-Terrains.dc.html`): a 9 × 9 scan in one of four terrains, rolled at
   random per visit (a display choice, not a rule). Reachable squares have a
   gold edge; the planned path is dotted gold; an attack is a red dashed line.
6. **Setup and level up** (`Setup.dc.html`): the creation form with the three
   score methods and a live sheet preview; level up shows which abilities can
   take the +1 at this level and what a 3 unlocks.

## 6. Player decisions, and where each is drawn

Every choice the rules give the player has a board. None may be defaulted.

| Decision | Board |
|---|---|
| Name, race, ship name, score method and scores, disposition | Setup · Create |
| Which ability takes the +1 at level up | Setup · Level up |
| Buy, recruit, take a mission, repair roll, pay repair, ease unrest, work the docks, depart | Habitat |
| Equip gear on anyone; release a crew member (also when over capacity); tinker; fabricate | Habitat overlays |
| The RES/DIP peek on departure: discard one or leave them | Habitat · Departure peek |
| Whether to use a consumable before any 3d6 roll | every roll panel |
| ♠ which option, and whose score carries it | In space |
| Spend a red shirt to survive a failed hazard | In space |
| ♥ attempt recruit or decline | Encounter |
| ♣ accept option 1, option 2, or decline; ruin expeditions accept or decline | Encounter |
| ♦ ruin: enter and choose depth, or skip | Encounter |
| ♦ pirate: run silent or engage; each round fight, escape, hack, open fire, redline, intimidate | Pirate |
| Use the Flying Ace reroll after a lost exchange | Pirate · Round result |
| Board or leave; who leads the boarding; talk survivors aboard | Pirate · Board or leave |
| Take the captured ship or keep yours | Pirate · Capture |
| Ruin: who goes in, start spot, threat level, which three attacker spots | Ruin setup |
| Ruin: where each being moves, and its action (attack, open a cache, approach a being, talk one over, step off) | Ruin |

## 7. Motion

Nothing appears in place. The moments: the drawn card flies from the deck and
flips; a lost damage plate cracks and drops; a recruit's card slides into the
crew row; stamps thump onto habitat rows; the journey stack slides two new legs
on top when a job is accepted; dice settle, sort and bracket into pairs; tokens
step square by square on the ruin map; a captured ship swaps in with a flicker.

## 8. Build order (planned 2026-11-02)

Each step is one commit on a branch, checked in the browser against its board,
with `pnpm --filter @universe/web test` and `e2e/warble-way.spec.ts` green. The
spec's selectors stay (`.turn-pill`, `.log li`, `.toast`, `.move-menu ol
button`, `.zk-tableau`, `.zk-die`, `.chooser button`, the dialog's Close).
Before each application commit, run the change-mode checks in
`security-check-playbook.md`.

| Step | Item | Files | Done when |
|---|---|---|---|
| 1 | 1 · hook and tokens | `apps/web/src/glue/ww/ww.css` (every rule under `.table-shell.ww-theme`, the tokens above, then Universe's `--bg`, `--fg`, `--accent`, `--lit`, `--border`, `--card-back`, `--font-display` redefined, dark in both site modes like `cn.css`); `themeFor` in `apps/web/src/glue/warble-way-galaxy.ts` returning `ww-theme` for a Warble Way view; Kalam 400 and 700 self-hosted in `apps/web/public/fonts/` and declared in `apps/web/src/fonts.css`; a bullet in `ATTRIBUTIONS.md` (count goes to twelve); a `themeFor` case in `apps/web/src/tests/glue.test.ts`. | The existing table turns hull navy on starlight and nothing else in Universe changes. |
| 2 | 2 · icons | The 59 game-icons files copied to `apps/web/public/art/warble-way/icons/`; `apps/web/src/glue/ww/icons.tsx` with the class-to-file map from item 2 and an `<Icon name>` that draws the two stacked mask copies; the `.gx` glitch rules and `gxjit` keyframes in `ww.css`, stopped under `[data-motion='reduced']` and the media query as `cn.css` does. | Every fixed meaning in item 2 renders from one component. |
| 3 | 3 · holograms | `.ga`, `.ga-red` and `.gxi` rules in `ww.css` on `.zk-card-art` and the sheet's tokens, copied from `Ruin.dc.html`; `apps/web/src/glue/ww/faces.ts` mapping race and attacker names to `/art/warble-way/portraits/<id>.jpg` like `cn/faces.ts`. **Blocked on the portrait licence** (see below): until new tokens exist the map returns no image and the ring shows the race's initial. | Gold crew, red attackers, both glitching; nothing committed under the wrong licence. |
| 4 | 4 · travel cards | `apps/web/src/glue/ww/TravelCard.tsx`, the 200 × 290 face with the five bottom blocks from `Cards.dc.html`, fed by card code; the names and blurbs from the engine's reference data (decided below). | The whole deck draws from codes alone, matching `Cards.dc.html`. |
| 5 | 5 · the tables | `apps/web/src/glue/ww/WwScreen.tsx`, a game-drawn screen like `sl/SlScreen.tsx` and `ngg/`, with one part per board: sheet, space, encounter, pirate, habitat and its overlays, ruin setup, ruin, setup and level up; `phone` from `Phone.dc.html`. Built in that order, each against its board. | Every screen in item 5 plays from the engine's own moves. |
| 6 | 6 · decisions | Walk the item 6 table against `get_legal_moves` on a live game. Any choice the engine does not expose becomes an engine PR (branch, test) and Universe reads it; nothing is defaulted on the Universe side. | Every row names the move it sends. |
| 7 | 7 · motion | `data-flip-id` and `arriveFrom` on every piece so `FlipRoot` flies cards and slides tokens; `apps/web/src/glue/ww/motion.ts` hops a token square by square like `sl/motion.ts`; `momentFor` for the cracked plate, the stamp thump and the ship swap; reduced motion fades. | Nothing appears in place, on the table and in `Watch`. |

**Step 1 done 2026-11-03** on the `ww-theme` branch: `ww.css`, `themeFor`,
Kalam self-hosted and credited, the glue test; checked on the live table
(hull navy on starlight, the wordmark's meeple still orange, the home page
untouched) and `e2e/warble-way.spec.ts` green.

**Step 2 done 2026-11-03** on the same branch: the 59 shapes served from
`apps/web/public/art/warble-way/icons/` (the SVGs with their embedded
metadata blocks stripped, 437 KB in all), `icons.tsx` with the class-to-file
map, the fixed meanings and `<Icon>` / `<MeaningIcon>`, the glitch rules in
`ww.css` as `.ww-gx` / `.ww-ic` / `.ww-gh` and keyframes `ww-gxjit` (prefixed
like the other themes' rules; not scoped to the table shell, so the icons go
wherever the game is drawn), still under reduced motion with the ghost
hidden. A dev-only page, `/dev/ww`, draws every meaning and every shape in
the theme for comparing with `Main`. Checked there: all 59 masks load, the
ghost is `#ff4f7b` at 55% on `steps(1)`, 2.7 s, the icon 3.4 s reversed.
The skills icon was found to be a solid square (its file had no alpha) and
was fixed in the working folder too; see the design README.

**Blocked: the portraits.** Every image in `assets/portraits/` and
`assets/sketches/` was made with Qwen Image 2.1, whose licence is research
only. They cannot be committed, which also keeps the whole design folder out
of git today. The owner's own drawings in `docs/games/warble-way-galaxy/races/`
are his to use; the way through is to regenerate the 17 tokens and 4 sketches
from them with Qwen Image Edit 2511 (Apache 2.0, installed), using the same
instruction as before, then commit the folder.

**Decided 2026-11-03: the names live in the engine.** Item 4's names and
blurbs, the habitat missions, shop items and cantina beings (appendix A) are
per-card content, and the owner chose the engine's reference data over a
Universe table: `reference_data.cards` and `habitats`, read through
`GET /api/games/:id/reference` like `rd.races` today, so voice and web say
the same thing and the lore stays with the game. Step 4 therefore starts with
an engine PR (a branch, the names from appendix A, a test that every travel
card code has a name) and Universe reads what it publishes; nothing in
`apps/web/src/glue/ww/` holds a name.

## Appendix A. Names

Recruit cards (♥): A C0FFEE, Hexapod pod pilot · 2 Flint, Grull of Shale's brood ·
3 Mica, Grull of Pyrite's brood · 4 Kakaaw, Kralkin duelist · 5 Pii, Kralkin court
envoy · 6 Gronk, Kralkin fleet gunner · 7 Aaliyah, Human, ex-TanakaRodriguez ·
8 FACADE, Hexapod pod, hard to spot · 9 Muhammad, Human, ex-UHM trooper ·
10 DEC0DE, Hexapod pod translator · J Tweet, Kralkin station mechanic ·
Q Obsidian, Grull of Pumice's brood · K Katie, Megaship stage star.

Jobs (♣): 2 Channel clash · 3 Gone quiet · 4 Inspection day · 5 Night shift ·
6 Trigger-happy · 7 Runaway rover · 8 Ring run · 9 Hot cargo · 10 Gala escort ·
J Digger's tip · Q Salvage rights · K The deep dig · A Kralkin-built?
(Blurbs are in `Cards.dc.html`.)

Ruins (♦): 10 The Picked Shell · J Hollow Aerie · Q Providence Zero · K The Hive
Engine · A The Quiet Spire.

Hazards (♠, proposed by the designer pass): A Meteor shower · 2 Asteroid field ·
3 Gravity snare · 4 Hull mites · 5 Mine field · 6 Wormhole · 7 Plasma bubbles ·
8 Dark eclipse · 9 Planet breakup · 10 Ion bolt · J Rogue moon · Q Solar flare ·
K Spore pods.

Habitat #1 Xaxalon 4. Missions: Hydroponics Mold (RES), Scrapyard Squabble (DIP),
The Leaky Recycler (MEC), Dustbowl Ruin (R1), Cantina Bouncer (SWA), Scrap Convoy
Escort (ARM), The Fake Inspector (ACT). Shop: Sustenance Cube, WinchesterZhang
Plinker, Salvaged Riot Plate, Patched Thruster, Bolt-on Bunk Pod. Cantina: Wang
(Human), Chirp (Kralkin), 7EE700 (Hexapod), Slate (Grull), Michael (Human).

Habitat #2 Kookookachaa. Missions: The Belt Run (PIL), Bounty on Krazz's Crew
(GUN), Into the Royal Aviary (SNE), Crack the Court Ledger (HAK), Lead the Wing
Drill (LEA), The Feathered Vault (R2). Shop: Roost Module, Talon-grip
Stabilizers, Imperial Targeting Array, Updraft Engine, Raptor Rifle,
Quiet-Feather Cloak. Cantina: Arrak, Basalt, Zhang, Trill, Kraa.

Habitat #3 FFD700 Base. Missions: Spore Census (RES), Six Minds, One Deal (DIP),
Walker Overhaul (MEC), The FFFFFF Leak (SNE), Hold the Airlock (ARM), The Gold
Run (PIL). Shop: Aarak Adrenal Spray, Aarak Focus Tabs, Ruin-forged Plate, Ruin
Lance, Hex-weave Hull Plating, Pod Habitat Ring. Cantina: Galena, Coo, ACCE55,
Diego, 5EA1ED, Priya.

Ruin attackers: rocky Gravel crab, Rock mite, Burrow beetle; alien Leviathan,
Hive brute, Spore titan; metal Sentry drone, Loader mech, Spider-bot; starry
Pirate captain, Pirate boarder, Pirate gunner. Ruin terrains: Derelict in open
space, Asteroid cavern, Xeno hive, Station hulk.
