# Warble Way Galaxy — designer reference

This document is for a visual and interaction designer who has never seen the game. It describes the physical table exactly, then maps it to the digital table and to a voice-only ("listen mode") version. Counts and rules come from the game engine; intent and flavor come from the printed rulebook. Sources are listed at the end.

A note on words. The game calls a character's twelve numbers "ability scores" and shortens each to three letters (SWA, HAK, PIL and so on). This document spells them out the first time and then uses the three-letter form, because that is what is printed on every page and what the player will say out loud.

## What it is

Warble Way Galaxy is a solo science-fiction role-playing board game. You are one captain with a small ship, 200 credits and a few skills. You take jobs from three space stations called habitats, fly between them, and survive what your own deck of playing cards throws at you: drifting recruits, pirates, hazards, more jobs, and ancient ruins. The tone is light pulp space opera: a bird-people empire, telepathic octopus pods with hexadecimal names, snake-like Grull who fly rocks, and humans living on four giant refugee ships. You lose if your character dies, your ship is destroyed, you owe more than 300 credits, or you are stranded with nothing left to do. You win Season 1 in any of five ways: clear the deepest ruin past the third habitat (Conquest), bank 6,000 credits at a habitat (Fortune), reach character level 5 (Legend), open 6 ruin caches (Plunder), or beat 8 foes face to face (Bounty).

## Everything on the table

The printed kit is a 29-page PDF. The designer's own note says to print pages 18 to 28 (10 pages). On the physical table you would find:

| Component | Count | Notes |
|---|---|---|
| Character / Ship / Crew sheet | 1 page | Character block, 12 ability scores, skills, inventory, ship line, 8 crew boxes (the rules text counts 7 usable crew slots). |
| Standard playing-card deck, jokers removed | 52 cards | This is the "travel deck". It is the only random element besides dice. Confirmed: 13 ranks × 4 suits = 52, no jokers. |
| Six-sided dice | 5 | The game never needs more than 5 at once (4 for combat plus 1 rider die). Written "d6". |
| Space Travel Tables | 4 pages | One per suit: ♥ Recruits, ♦ Pirates and Ruins, ♠ Hazards, ♣ Missions. |
| Habitat pages | 3 pages | Habitat #1 Xaxalon 4, Habitat #2 Kookookachaa, Habitat #3 FFD700 Base. Each has a Missions table, a Shop table, a Cantina (recruits) table, and a "To next habitat" line. |
| Ruin maps | 3 pages | R1, R2, R3. Each is a 9 × 9 grid with walls, pits, a start spot, a goal, item spots, being spots and attacker spots, plus three lists: attackers by threat level, items (d6), beings (d6). |
| Tokens or standees | about 10 | Pieces for you, your crew and three attackers on a ruin map. Also small counters for anger tokens. |
| Pen or pencil | 1 | Everything else is written on the sheet. |
| Level table | printed on the rules page | Four rows; see the character sheet section. |

Not in the box: there is no galaxy map. Travel is a count of cards, not a route.

## The character sheet

The printed sheet (image 01) is one letter page, black text on white, in this order from top to bottom.

**Header line.** Name, Race, Level, XP, Credits.

- Race: Human, Kralkin, Hexapod or Grull. No effect on rules. Each race "idealizes" one stat, which matters when you recruit them (see the crew section).
- Level: starts at 1. Reaching level 5 wins the game (Legend).
- XP: starts at 0. It is a single pool. Level-up thresholds (below) are subtracted when you level.
- Credits: start 200. May go negative. Owing more than 300 (i.e. −301 or worse) ends the game. 6,000 banked while at a habitat wins the game (Fortune).

**Stats / Ability Scores.** A four-column box. Each column is one stat and holds three abilities.

| Stat | Abilities (three-letter code = full name) | Race that idealizes it | What a failed hazard of this stat costs you |
|---|---|---|---|
| Brawn | SWA Swashbuckling, ARM Armor, DEM Demolitions | Humans | A death check |
| Smarts | HAK Hacking, RES Research, MEC Mechanics | Hexapods | Lose 100 credits |
| Finesse | PIL Piloting, GUN Gunslinging, SNE Sneaking | Grull | Ship damage, one level |
| Moxie | LEA Leadership, DIP Diplomacy, ACT Acting | Kralkin | Crew unrest: +1 anger token on every crew member |

Value ranges: each ability is a whole number, 0 at the start unless chosen. At creation no ability may exceed 3. Each level-up adds +1 to one ability, so a long game can reach 4, 5 or higher; there is no printed cap. The engine tracks two numbers per ability: the natural score (written on the sheet) and the effective score (natural plus any equipped weapon or armor bonus, minus 1 on everything while the character is Wounded).

**Basic Skills.** Any ability at 1 or more grants a basic skill. The sheet has blank lines plus two special boxes, Move and Range, which only matter on ruin maps (Move = 3 + SNE; Range = GUN + 2, or DEM, or 1 if neither).

| Ability | Basic skill (score 1+) |
|---|---|
| SWA | Ground combat advantage (take the higher pair). |
| ARM | Add ARM when defending in ground combat. |
| DEM | Your ground range equals your DEM score. |
| HAK | May hack a pirate ship: 3d6 + HAK vs its minimum hacking number. |
| RES | At the start of a journey, look at the top RES cards of the travel deck and discard one (optional). Also keyed on DIP, whichever is higher. |
| MEC | On landing at a habitat, may roll to repair: 3d6 + MEC, 10+ raises ship damage one level. |
| PIL | Space combat advantage; add PIL when escaping. |
| GUN | Ground range = 2 + GUN. |
| SNE | Move = 3 + SNE on ruin maps. Also lets you try to slip past pirates: 3d6 + SNE vs 10 + pirate speed. |
| LEA | On landing, may roll to calm crew: 3d6 + LEA, 12+ removes one anger token from each crew member. +1 XP per successful recruit. |
| DIP | In ground combat, may talk one attacker into joining you. Can also hire "unnamed crew" (see crew). |
| ACT | +1 die on any Moxie or Smarts roll, including recruiting Hexapods and Kralkin. |

**Advanced Skills.** A natural score of 3 or more (item bonuses do not count) grants a second, stronger skill: Expert Combat Tactics (SWA), Reinforced Armor (ARM), Splash Damage (DEM), Hackers Delight (HAK, +200 credits per successful hack), Personal Teleporter (RES), Ms/Mr Fix-it (MEC, ship auto-repairs to Pristine on arrival), Flying Ace (PIL, one space-combat reroll per fight), Sniper (GUN), Personal Cloaking (SNE), Inspirational (LEA, +3 to rolls carried by a crew member), Silver Tongue (DIP, mission credits doubled), Je ne sais quoi (ACT, +100 × ACT credits per mission). Natural 3 in ARM also gives the ship +1 armor and one free "the ship survives at Hobbled" save per game; natural 3 in MEC unlocks paid tinkering and fabrication at habitats; natural 3 in DEM makes intimidated pirates pay tribute.

**Inventory.** A five-cell strip: Weapon, Armor, and three blank cells for consumables and spare gear. Rule: every being wears at most one weapon and one armor. Consumables are one-use and must be declared before the roll they boost.

**Level table.**

| Level you are on | XP needed to go up |
|---|---|
| 1 | 6 |
| 2 | 12 |
| 3 | 24 |
| 4 | 48 |
| 5 and beyond | keeps doubling (96, 192, ...) — but reaching level 5 already wins |

On level-up the player picks one ability to raise by 1. On odd levels it must be an ability already at 1 or more; when the new level is even, they may instead open a brand-new ability at 1.

**Two hidden fields the printed sheet does not have** but the digital sheet needs: Wounded (a flag; the first failed death check wounds instead of kills, heals on the next habitat arrival) and Dread (0 to 3; earned by scaring or boarding pirates, adds +1 per point to intimidation rolls).

## The crew

The bottom half of the sheet is a 2 × 4 grid of crew boxes. Each box has Name, Race, Stats (two blank lines), Weapon, Armor. Crew never level; their scores are fixed when they join.

- **Where they come from:** habitat cantinas (5 or 6 rows per habitat), ♥ cards drawn in space (13 possible), and being spots in ruins (6 per map, one is a decoy).
- **Recruit roll:** 3d6 + the highest score you or anyone aboard has under the recruit's idealized stat, vs the recruit's minimum roll (11 to 14). ACT adds a die when recruiting Hexapods or Kralkin. Failing at a cantina marks that recruit as never available again. Failing in space just means they drift on.
- **Names:** the engine labels a recruit by race and scores, for example "Kralkin (DIP+2 ARM+1)", adding "#2" if there is a duplicate. The narrator may give them a real name.
- **Anger tokens:** 0 to 3 per crew member. A failed Moxie hazard puts one on every crew member. At 3 they walk out immediately and take their equipped weapon and armor with them. A leadership roll at a habitat removes one from each.
- **Equipment slots:** one weapon, one armor each. Gear leaves with a crew member who dies or leaves.
- **Capacity:** the ship's capacity counts you plus your crew. It starts at 3 (you plus two). Over capacity, the player must release someone. Ship parts raise it: +2 (Habitat #1, 700c), +3 (Habitat #2, 1,200c), +3 (Habitat #3, 1,500c), +2 (a ruin find). A captured pirate ship brings its own capacity (3 to 7).
- **Unnamed crew ("red shirts"):** a plain counter, not crew records. They have no scores, gear, anger or capacity slot. They only act on ruin maps (move 3, attack +0, die to one hit) and one may be spent to survive a failed hazard. Cap = the best natural DIP aboard.

## The ship

One printed line: Name, Capacity, Speed, Handling, Damage "P | U* | D | H", then a Parts line.

| Ship stat | Start | Range and meaning |
|---|---|---|
| Damage | Used | A four-step ladder: Pristine → Used → Damaged → Hobbled. One more hit below Hobbled destroys the ship (game over). The asterisk on U marks the starting step. Repairs move it up one step. |
| Speed | 0 | Subtracts from the cards drawn per leg. Parts: +1 (400c), +2 (800c), +2 (ruin find); shipwright +1. Realistic max about 5. |
| Capacity | 3 | Beings aboard including you. Up to 13 with every part. |
| Handling | 0 | Added to escape rolls. Parts: +2 (600c), +4 (ruin find). |
| Armor | 0 | Subtracted from the pirate's total in every exchange. Part: +2 (1,000c); +1 more with a natural ARM 3 aboard. |
| Parts | none | A list of installed ship parts. Lost if you switch to a captured ship. A ship part called Space Combat Advantage (600c) is also listed here. |

## Habitats and the galaxy

There are exactly three habitats, visited in order, no backtracking. Each habitat page has four blocks.

| # | Name | Missions | Shop | Cantina | To next habitat |
|---|---|---|---|---|---|
| 1 | Xaxalon 4 (a salvage-built human outpost with a lively cantina) | 7 | 5 items | 5 recruits, min roll 11 | Complete 4 missions (win or lose), then fly distance 6 one way |
| 2 | Kookookachaa | 6 | 6 items | 5 recruits, min 11–12 | Fly distance 12 one way |
| 3 | FFD700 Base ("FFD700" is the hex code for gold) | 6 | 6 items | 6 recruits, min 13–14 | Enter the depth-3 ruin; clearing it wins |

At a habitat the player may, in any order and as often as the rules allow: recruit from the cantina; buy shop items (each row once); equip gear on anyone; take a mission (each row once, win or lose); roll to repair (once per arrival, needs MEC, 10+); pay 150 credits per damage step to repair (repeatable, may go into debt but never to −300); roll to ease unrest (once per arrival, needs LEA, 12+); work the docks for an unnamed crew hand (once per habitat, 3d6 + DIP vs 12); tinker (natural MEC 3: 200c makes a weapon or armor MK-II, +1); fabricate a +1 speed, handling or armor part (natural MEC 3: 400c, once per visit); release a crew member; or depart.

Missions per habitat (distance / ability / minimum roll / credits / XP):

- Habitat #1: 3 RES 10 300c 1 · 3 DIP 10 300c 1 · 3 MEC 10 300c 1 · 4 R1 ruin 600c 1 · 4 SWA 10 300c 1 · 4 ARM 10 300c 1 · 6 ACT 12 400c 1.
- Habitat #2: 5 PIL 11 400c 2 · 5 GUN 12 500c 2 · 5 SNE 11 400c 2 · 6 HAK 12 500c 2 · 6 LEA 12 500c 2 · 7 R2 ruin 1,000c 4.
- Habitat #3: 7 RES 13 600c 3 · 7 DIP 14 700c 4 · 8 MEC 14 700c 4 · 8 SNE 14 700c 4 · 8 ARM 15 750c 4 · 9 PIL 18 1,500c 5.

Shops: Habitat #1 sells Consumable +1 Any (200c), Weapon +1 GUN (300c), Armor Combat Advantage (400c), Ship part +1 Speed (400c), Ship part +2 Capacity (700c). Habitat #2 sells Ship part +3 Capacity (1,200c), +2 Handling (600c), Space Combat Advantage (600c), +2 Speed (800c), Weapon +2 GUN (600c), Armor +2 SNE (400c). Habitat #3 sells Consumable +3 SWA (600c), Consumable +3 RES (600c), Armor +3 ARM (800c), Weapon +3 GUN (800c), Ship part Armor +2 (1,000c), Ship part Capacity +3 (1,500c).

**How travel works.** There is no map. A mission has a distance. Cards per direction = distance − ship speed (never below 0). When a mission is taken, both the outbound and the return stacks are dealt face down at once. The player then draws one card at a time and resolves it. At the end of the outbound stack the mission check happens; the return stack is flown home whether the mission passed or failed. A successful mission also repairs the ship one step. A journey between habitats is one stack only, no return.

**The journey stack.** A ♣ mission card accepted in space is "sandwiched": its outbound and return stacks are placed on top of the remaining cards, resolved fully, then the original journey resumes. The engine keeps this as a stack of legs, each with a purpose (outbound for mission X, return for mission X, transfer to Habitat #N) and a count of cards remaining. The top leg is the live one.

## The travel deck and tables

The travel deck is the player's own 52-card deck with jokers removed. Every card maps to exactly one table row:

| Suit | Cards | Meaning |
|---|---|---|
| ♥ Hearts | A, 2–10, J, Q, K (13) | A recruit adrift. Try to recruit them (a roll) or fly on. Each rank is a specific being: e.g. Ace = Hexapod, min 13, +3 PIL; King = Human, min 12, +2 ACT +1 SWA. |
| ♦ Diamonds | 2–9 (8) | Pirates. A fight you cannot ignore (but may try to escape or slip past). Each rank is a ship: space attack +3 to +7, ground attack +1 to +5, capacity 3–7, speed 0–2, handling 0–4, minimum hacking 12–15. The ♦2 is the monster (+7). ♦4 has Space Combat Advantage; ♦8 gives you −2 on their bonus. |
| ♦ Diamonds | 10, J, Q, K, A (5) | Ruins discovered. Entering is optional. Depth: 10 = 1, J = 2, K = 2, Q = 3, A = 3. |
| ♠ Spades | A, 2–10, J, Q, K (13) | Hazards. Two options, each an ability and a minimum (one at 10, one at 15), e.g. Ace: PIL 10 (ship damage) or HAK 15 (−100c). Have both abilities aboard, pick one; have one, you must use it; have neither, pick which one you fail. Surviving any hazard is worth 1 XP. |
| ♣ Clubs | 2–10 (9) | Mission offers with two options, e.g. ♣2: 4 DIP 10 200c 1 XP, or 8 HAK 15 400c 2 XP. Accept one (if someone aboard has the ability) or decline. |
| ♣ Clubs | J, Q, K, A (4) | Single ruin missions, no ability needed: J = distance 8, depth 1, 1,400c, 2 XP · Q = 12, depth 2, 1,600c, 3 XP · K = 16, depth 3, 1,800c, 4 XP · A = 10, depth 3, 1,500c, 3 XP. |

Drawn cards go to a face-up discard pile. If the deck runs out, the discard is reshuffled into a new deck. The engine tracks which of the 52 are still in the draw pile so it can reject an impossible duplicate.

**Ruins.** Three 9 × 9 maps, R1 then R2 then R3; every visit starts at R1 and goes down one map per goal reached. At setup the player picks who goes in (the character may stay behind), which start spot, a threat level 1–3, and which 3 of the marked attacker spots the three attackers stand on. Each round the party moves and acts first, then each attacker moves toward and attacks the nearest party member. Actions: attack (4d6 pairing, range counted with diagonals, walls block, pits do not), open an item cache (roll a d6 on the map's list: 1 is always Empty), approach a being spot (roll a d6: 1 is always Decoy, otherwise a recruit roll follows), talk an attacker over with DIP, or step off through the start. Reaching the goal ends the level at once. Attackers are worth XP equal to their attack bonus (3, 5 or 7).

## A turn, step by step

**At a habitat.** Nothing is timed; the player takes actions one at a time until they leave.

1. *Automatic on arrival:* wounds heal; a Fix-it engineer repairs to Pristine; the once-per-arrival repair and unrest rolls become available.
2. *Player decides:* which of the habitat actions to take (Buy, Equip, Recruit, Repair roll, Pay repair, Ease unrest, Work the docks, Tinker, Fabricate, Release, Take mission, Depart).
3. *Automatic:* prices are checked and deducted; one-shot rows are crossed off; a roll is requested when an action needs one.
4. *Player decides:* whether to declare a consumable before rolling, then presses Roll.
5. *Automatic:* pass or fail is applied; XP is added; if XP reaches the threshold a Level Up prompt opens.
6. *Player decides:* which ability gets the +1.
7. *Player decides:* Take mission or Depart. Both leave the habitat and deal the journey stack. If the RES/DIP peek applies, the player may look at the top N cards and discard one, or skip.

**In space.** One card at a time.

1. *Player presses Draw.* (At the physical table they draw and name the card.)
2. *Automatic:* the card is looked up on its table and the choice or fight it implies is opened.
3. *Player decides,* by suit: ♥ Attempt recruit or Decline. ♠ Choose option 1 or 2, and whose score carries it. ♣ Accept option 1, Accept option 2, or Decline. ♦ ruin: Enter (choose depth) or Skip. ♦ pirate: if SNE is aboard, Run silent or Engage first; then each round choose Escape, Fight, Hack, Open fire (once), Redline (once), or Intimidate; after a win, Board or Leave; after a capture, Take ship or Keep yours; with DIP, Talk survivors aboard.
4. *Player presses Roll* for every check the choice needs; declares any consumable first.
5. *Automatic:* the outcome is applied (damage, credits, XP, anger, a new crew box, a death check if needed), the card goes to discard, the leg's counter drops by one.
6. *Automatic when a leg ends:* on an outbound leg, the mission check is requested (a Roll); on a return or transfer leg, arrival at the habitat.

Things the player never decides: which score a mission or space roll uses (always the highest aboard), who fights whom in a combat round, what attackers do, and what unnamed crew and captured ships are called.

## Dice and randomness

Every roll below is a Roll button in the digital version; every card draw is a Draw button. All dice are six-sided.

| Roll | Dice | Add | Beat | Used for |
|---|---|---|---|---|
| Ability check | 3d6 | the named ability's best effective score aboard | the printed minimum (10–18) | missions, hazards, recruiting, repair (10), unrest (12), hack, escape, evade, volley (12), redline (12), intimidate, docks (12) |
| Extra dice | +1d6 | added to the sum | same | ACT on any Moxie or Smarts roll (including recruiting Hexapods and Kralkin) |
| Death check | 3d6 | nothing | 9 or more survives | a failed Brawn hazard carried by the character, a lost boarding, a landed hit in a ruin. First failure = Wounded; second while Wounded = dead |
| Space combat exchange | 4d6 | see below | the pirate's total | one round of fighting |
| Ground combat | 4d6 | see below | the attacker's total | boarding a disabled ship; attacking or defending on a ruin map |
| Rider dice | +1d6 | added after the pairing is resolved | — | Expert Combat Tactics (after your attack), Reinforced Armor (after an enemy attack) |
| Item d6 | 1d6 | nothing | no threshold | opening a ruin cache: reads a row 1–6 |
| Being d6 | 1d6 | nothing | no threshold | approaching a ruin being spot: reads a row 1–6, then a recruit roll |

**The 4d6 pairing.** Roll four dice. Pair the highest with the lowest, and the two middle dice. If you have advantage (PIL skill or a Space Combat Advantage part in space; SWA, Sniper or the advantage armor on the ground) you take the higher pair sum and add your relevant score (best PIL in space; SWA, GUN or DEM on the ground). Without advantage you take the lower pair sum and add nothing. The enemy takes the other pair and adds its attack bonus; in space your ship armor is subtracted from their total. Higher total wins; a tie is rerolled. In space a loss costs one ship damage step, a win disables the pirate. Escape is a separate 3d6 + handling (+PIL) vs 10 + pirate space attack; a failed escape still gets away, after one damage step.

**Declaring a consumable.** A consumable must be declared while the roll is open and before the dice are reported. The Roll screen should show the eligible consumables (matching ability or "+1 Any") as a toggle beside the Roll button. It is consumed when the dice are reported, pass or fail.

**Cards.** The only other randomness. The player's deck order is never known to the engine; only the composition is mirrored, so it can say "that card is already in the discard".

## Setup choices

Character creation is a single form with these fields, all chosen by the player:

1. Character name (free text).
2. Race: Human, Kralkin, Hexapod, Grull. Flavor only.
3. Ship name (free text).
4. Ability scores, one of three methods: **Recommended** — one ability at 3, one at 2, one at 1. **Distribute** — 6 points anywhere, no ability above 3. **Archetype card** — pick a named pre-built 3/2/1 spread with a printed difficulty: Void Runner ★ (SNE 3 MEC 2 RES 1), Ghost Smuggler ★ (SNE 3 HAK 2 SWA 1), Privateer ★★ (PIL 3 SWA 2 MEC 1), Fleet Captain ★★ (LEA 3 MEC 2 RES 1), Ace Pilot ★★★ (PIL 3 MEC 2 RES 1), Netdiver ★★★ (HAK 3 MEC 2 RES 1), Field Scholar ★★★★ (RES 3 GUN 2 PIL 1), Grease Monkey ★★★★ (MEC 3 PIL 2 RES 1), Dread Corsair ★★★★ (DEM 3 PIL 2 DIP 1). One star is easy, four is brutal.
5. Disposition (optional): brash or risk-averse. A roleplay hint for the narrator, never a rule.

Everything else is fixed: 200 credits, level 1, 0 XP, a ship at capacity 3 / speed 0 / handling 0 / armor 0 / damage Used, no crew, no items, standing at Habitat #1, Xaxalon 4.

## Mapping to the eight primitives

| On the table | Primitive | Notes for the digital table |
|---|---|---|
| Character sheet (header, 12 abilities, skills, inventory) | tableau | The always-visible home panel. Abilities as a 4 × 3 grid inside it. |
| XP and level | track | A short track with pips at 6, 12, 24, 48; the level number sits at its end. Show "XP to next". |
| Credits | pool | A single number that can go negative; mark the −300 cliff and the 6,000 finish line. |
| Ship damage | track | Four steps P U D H, left to right, with the danger end at H. |
| Ship speed, capacity, handling, armor, parts | tableau | A second small tableau; parts are a short list of cards. |
| Crew | card zone (row) | Up to 8 face-up crew cards. Each card carries a small pool of anger tokens (0–3) and two gear slots. Capacity shown as "4 / 5" on the zone header. |
| Unnamed crew, Dread | pool | Two tiny counters near the crew row. |
| Owned items | card zone (fan) | Weapons, armor, consumables, ship parts; greyed when consumed or installed. |
| Travel deck | card zone (pile), face down | The draw pile. Show the count remaining. |
| Discard | card zone (pile), face up | Top card visible; count shown. |
| Journey stack | track | One row per leg, top leg highlighted, each with a countdown of cards left. Sandwiched legs stack above the paused one. |
| Habitat page (missions, shop, cantina) | tableau with three card zones (rows) | Each row is a set of cards that get a "done" stamp when used. |
| The galaxy (three habitats in a line) | track | Three stops with a "you are here" marker; there is no map. |
| Space travel tables | tableau (reference) | Reveal the matching row when a card is drawn; do not show all four tables at once. |
| Pirate encounter | card | The pirate's stats as one card; round-by-round buffs (volley −2, redline +2) as chips on it. |
| Ruin map | grid, 9 × 9 | Walls black, pits grey, five icon types; party and attacker tokens on cells. |
| Ruin item and being lists | tableau (reference) | Six rows each; row 1 is Empty / Decoy. |
| Dice | pool of dice | 3, 4 or 5 dice shown face-up after a roll, with the pairing drawn for 4d6. |

Nothing in this game is a bag or a map primitive. The word "map" in the rulebook always means the ruin grid.

## Moments to animate

- **The check.** Three dice tumble, settle, and the sum slides next to the ability bonus; the total lands on a threshold bar (pass zone above the minimum, fail below). Extra dice (ACT, riders) arrive a beat later and push the total.
- **The 4d6 pairing.** Four dice settle, then sort; a bracket joins highest and lowest, another joins the two middles; the chosen pair lights, the other pair slides to the pirate's side; armor is subtracted; totals compare.
- **The draw.** The top card lifts from the face-down pile, flips, and its suit picks the table: a red ♥ opens a recruit card, a red ♦ a pirate silhouette or a ruin entrance, a black ♠ a hazard with two doors, a black ♣ a job sheet.
- **Ship damage.** The damage track marker drops one step with a shudder; at Hobbled the ship outline flickers; a Bulkheads save freezes it at H instead of falling off.
- **XP and level up.** Pips fill along the track; when the threshold pip fills, the track empties, the level number ticks up, and the ability grid asks for the +1.
- **A recruit joins.** The ♥ card or cantina row turns into a crew card and slides into the crew row; the capacity header updates. Failing at a cantina stamps the row "marked".
- **Anger tokens.** A failed Moxie hazard drops one red token on every crew card at once; a card that reaches three tips over and leaves with its gear.
- **Credits.** The pool counts up on a payout, down on a purchase; going below 0 turns it red; −300 is a visible edge. Tribute from a scared pirate is a satisfying trickle in.
- **The journey stack.** A newly accepted ♣ mission slides two new legs onto the top of the stack; when they finish, the paused leg lights again.
- **Wounded.** A dimming band over the character block and −1 on every effective score until arrival.
- **Level cleared in a ruin.** The token that touches the goal glows; the grid folds away and the next map's setup form opens.

## Voice-only

This is the first listen-mode game. The narrator persona and the report contract are fixed by two files: the DM prompt and the voice contract.

**How the narrator talks.** The narrator is a game master, not a scorekeeper. The rule is "color is additive, mechanics are exact": every number, cost, credit, XP value, damage step, token and minimum roll in an engine result must be spoken completely, then one or two sentences of in-world color grounded in the lore may follow. Color never replaces, rounds or buries a fact and never invents a mechanic, a die result or a table entry. The narrator never rolls, draws or assumes for the player, never decides legality, and never chains steps from memory: one action, one result, then it asks what comes next. When the player's words do not map to a legal move, the narrator says so plainly and asks what they meant instead of papering over it with story. Setup choices (name, race, ship, scores, disposition) are always asked, never picked for the player.

**What must be spoken every time a roll is asked for.** The engine phrases it as: roll N d6 for the [reason], needs M or more, with [ability] +[bonus] ([their own / crew member's name]). So the spoken line always contains: the number of dice, what the roll is for, the threshold, and whose score with what bonus. If a consumable could apply, the narrator reminds the player to declare it before rolling. Example: "Roll three dice for the recruit — you need thirteen or more, adding your own Hacking plus two. Declare a consumable now if you want one."

**What must be spoken every time a card is asked for.** "Draw the next travel card from your deck and tell me which card it is." The player answers in any natural form: "seven of spades", "7S", "queen of hearts", "ten diamonds". The engine accepts all of these.

**How the player answers.** Dice: each die's value ("I rolled 4, 2, 6"). Cards: rank and suit. Choices: the printed name or number ("option two", "using the Kralkin's score", "buy the +1 GUN weapon", "board it", "put it in Piloting"). Ruin moves: a cell like "row 5 column 3", plus the being's name. The engine tolerates spelling and case; it does not tolerate a missing value.

**What must be spoken after every result.** The full state change: dice as rolled, total, pass or fail, and every consequence (credits, XP, damage step, anger tokens, a crew arrival or departure, a level-up prompt). Then the next step. The player should be able to update a paper sheet from the spoken line alone.

**Hard spots for voice.** Ruin maps: the engine gives the board as nine spoken rows with a legend and a key ("1 is Zara at row 7 column 2; a is attacker 1 at row 3 column 3"). This is long. Read the whole board only at setup and when asked; otherwise speak only what changed. The 4d6 pairing needs the narrator to state both pairs and which one is yours. Hazards need both options read with their abilities, minimums and consequences before the player chooses.

**What a screen must still show in listen mode.** Even when the game is driven by voice, keep a quiet companion screen with: credits and the −300 / 6,000 lines; the ship damage track; XP to next level; crew count over capacity with anger tokens; the open request (Roll N dice, need M, or Draw a card) with a Roll and a Draw button as a fallback for a noisy room; the last card drawn; and, inside a ruin, the 9 × 9 grid. Everything else can live behind a tap.

## Colors and names

The printed pages are plain. Black text on white, a standard sans-serif (Arial-like), thin black table rules, bold table headers, no fills. The only color is the suit glyph in the travel-table titles: ♥ and ♦ are printed red; ♠ and ♣ are black. Ability codes are always three capital letters. Damage is a compact "P | U* | D | H".

Icons come from game-icons.net (credited to Lorc and Delapouite) and are the only artwork. On the ruin maps: walls are solid black squares, pits are mid-grey squares, floor is white with dotted grid lines and a small row number in each row's first cell. Five icons sit in cells: a swirl (the goal), a crossed-bones skull (attacker spot), a treasure chest (item cache), a round space helmet (being spot), and a dark helmeted head or fist for the start spot. The pages label these as "goals", "attacker spots" and "starting location".

Names to keep: the four races Human, Kralkin, Hexapod, Grull; the three habitats Xaxalon 4, Kookookachaa, FFD700 Base; the ruins R1, R2, R3; the damage steps Pristine, Used, Damaged, Hobbled; the five endings Conquest, Fortune, Legend, Plunder, Bounty. Hexapods use hexadecimal names (F0C706, 7EE700), and FFD700 is web gold, which is a free visual hook. Merchants in the lore: Aarak Pharmaceuticals, WinchesterZhang (weapons and armor), TanakaRodriguez (demolitions), Alhambra (melee), 800800 (mobility and science gear).

The HTML rulebook built from the pages adds a restrained palette that fits the material and can seed the digital table: cream page shade #f3f0e8, near-black ink #1d1d20, rule grey #c9c4b8, navy accent #2b3a67, suit red #b3232a, and a muted gold #8a6b12 / #b3861d. The designer's own pencil sketches (image 10) show the Grull as horned, fanged serpents, Hexapods as many-eyed cephalopods in a round platform, and Kralkin as beaked, corvid-headed bipeds.

## Phone

The sheet is dense. On a phone, show first: the current request (Roll / Draw / a choice), credits, the ship damage track, and the journey leg counter. Second: XP to next level and level, crew as a compact row of avatars with anger dots and a "3 / 5" capacity badge. Third, behind a tap or a swipe: the 12 abilities (collapse to four stat headers with the non-zero abilities under each), skills, items, ship parts, habitat page, the discard pile, and the five ending trackers. Ruin maps need a full-screen mode; a 9 × 9 grid at phone width leaves about 40 px per cell, enough for a single icon and a number. Never make the player read a whole travel table on a phone; reveal only the row for the card drawn.

## Reference images

All in `C:\Users\zekes\Code\zekel-universe\docs\games\warble-way-galaxy\`.

| File | What it shows |
|---|---|
| `01-character-ship-crew-sheet.png` | The one-page Character / Ship / Crew sheet: header line, 4 × 3 ability box, skill lines, inventory strip, ship line with "P U* D H", eight crew boxes. |
| `02-habitat-1-xaxalon-4.png` | Habitat #1 page: 7 missions, 5 shop rows, 5 cantina rows, "To next habitat" text. Note the shop's +1 Speed is printed 600c; the engine prices it 400c. |
| `03-habitat-2-kookookachaa.png` | Habitat #2 page: 6 missions, 6 shop rows, 5 cantina rows (the "+! GUN" typo means +1). |
| `04-habitat-3-ffd700-base.png` | Habitat #3 page: 6 missions including the PIL 18 job, 6 shop rows, 6 cantina rows, "To Next Habitat: R3". |
| `05-travel-table-hearts-recruits.png` | ♥ Recruits table, red heart in the title, 13 rows. |
| `06-travel-table-diamonds-pirates-ruins.png` | ♦ Pirates table (8 ships, 7 stats) and ♦ Ruins depth table (5 cards). |
| `07-travel-table-spades-hazards.png` | ♠ Hazards table: 13 rows, two options each with the consequence in brackets. |
| `08-travel-table-clubs-missions.png` | ♣ Missions table: nine two-option rows, four single ruin rows with the second half greyed. |
| `09-ruin-map-r1.png` | The R1 map: 9 × 9 grid, black walls, icons for goal, attackers, items, beings and starts; attacker, item and being lists below. |
| `10-writers-notes-race-sketches.png` | The designer's notes and pencil sketches of Grull, Hexapod and Kralkin; the only art that sets the tone. |

## Sources

Rules and printed components

- `C:\Users\zekes\Code\zekel\port\warble-way-galaxy\WARBLE-RULES.md` (frozen rules, rulings and balance amendments A1–A21)
- `C:\Users\zekes\Code\zekel\port\warble-way-galaxy\season1-extract.txt`, `story-extract.txt`
- `C:\Users\zekes\Code\zekel\port\warble-way-galaxy\assets\Wrable-Way-Galaxy---Season-1-page{1,2,13,15,17,18,19,20,21,22,23,25,29}.png`
- `C:\Users\zekes\Code\zekel\port\warble-way-galaxy\pages\season1-p26.png`, `season1-p28.png`
- `C:\Users\zekes\Code\zekel\port\warble-way-galaxy\assets\Warble-Way-Galaxy-Story-page1.png`
- `C:\Users\zekes\Code\zekel\port\warble-way-galaxy\warblewaygalaxyrulebook.html` (palette)

Engine (source of truth for counts and rules)

- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\types.ts`
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\data\abilities.ts`, `archetypes.ts`, `cards.ts`, `habitats.ts`, `levels.ts`, `ruins.ts`, `travelTables.ts`
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\engine.ts` (repair 10+, unrest 12+, crew naming, peek count, marooned loss)
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\views.ts`
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\index.ts` (next-step text, rules text, reference data)
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\legalMoves.ts`
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\choices.ts`
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\voice.ts`
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\DM-PROMPT.md`
- `C:\Users\zekes\Code\zekel\src\games\warble-way-galaxy\lore\*.md`
