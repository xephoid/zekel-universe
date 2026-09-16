# Cybernoir 2127 — table reference for the designer

This describes the digital table for the board game Cybernoir 2127 so it can be drawn precisely. The game engine is the source of truth for every count and rule below. The printed rulebook is used for intent and flavor. Where the two disagree, the engine's number is given and the disagreement is noted.

A note on words. "AP" means action points: a small budget each player spends on their turn. A "clue" is a small round token that states one fact about the Hacker's hideout. A "Location card" is one of the 19 places in the city. A "Contact card" is a person, held by the Hacker. A "POI card" (Person of Interest) is the Detective's copy of that same person.

## What it is

Cybernoir 2127 is a two-player deduction game set in a rainy future city called Dark City. One player is the Detective, who actually committed the crime and has framed the other player, the Hacker. The Hacker is hiding in one secret location out of 19 and never moves unless they "burn" their safehouse once per game, so the "hidden movement" is really one hidden position that the Detective narrows down by elimination and clues. The Detective wins by naming the Hacker's hideout: one paid guess in the middle of the game, plus one final guess when the game ends. The Hacker wins by putting 13 Evidence cards face up on the table (the Weapon, a set of 3 Witnesses, and 3 Motive sets of 3 people) and then surviving the Detective's final guess. The tone is noir police procedure on the Detective's side (manila folders, red rubber stamps, typewriter type) against a hacker's green-on-black terminal on the Hacker's side.

## Everything on the table

| Component | Count | Notes |
|---|---|---|
| Location cards | 19 | 6 in Downtown, 6 in The Hive, 7 in Boonies. The rulebook's overview still says 18; the engine and the card list say 19. |
| People (as two identical decks) | 25 people | 7 Witnesses (ordinary citizens), 6 Iceden Collective, 3 Crimson Clan, 3 Chimera, 3 OmniSuperUltra Corp, 3 Shizuoka Inc. |
| Contacts deck (Hacker's copy) | 26 cards | The 25 people plus the Weapon. |
| POI deck (Detective's copy) | 25 cards | The 25 people. No Weapon copy. Never shuffled. One old setup note says 24; the engine has 25. |
| The Weapon | 1 card | Only in the Contacts deck. |
| Clue tokens, truthful | 13 | 3 Borough, 4 Population (0, 1, 2, 3), 6 Affiliation. |
| Clue tokens, negative ("NOT") | 13 | Same 13 values, printed with a red NOT band. The print sheet makes them a separate pool. |
| Action point markers | 4 + 3 | Detective has 4 AP per turn, Hacker has 3. Shown on the sheets as ✕ pips. |
| Jail track | 1 | Three slots: 1 Booked, 2 Processing, 3 Release Pending. |
| Hacker's safehouse card | 1 | The Location card of the hideout, removed from the Location deck at setup and kept face down by the Hacker. |
| Detective's case board | 1 sheet | A printed write-on checklist of the 19 locations plus lines for clues. Optional in print; useful as a digital panel. |

## The map

There is no travel between locations. Nobody moves a pawn. The 19 locations are a fixed list grouped into 3 boroughs (districts). The sources give no positions or roads, so the layout is the designer's choice. A sensible default is three columns or three bands, one per borough, with the borough name and its tagline as a header. The printed case board lists them in exactly this order.

Each location has three printed facts: its borough, its population (how many people live there, 0 to 3), and its affiliation (which faction owns it). These three facts are what clues reveal. Two locations, Trailer Towers and Little Ghana, share all three facts on purpose; only seeing the card itself tells them apart.

| Borough (tagline) | Location | Pop. | Affiliation | Residents |
|---|---|---|---|---|
| Downtown (neon & concrete) | OmniSuperUltra Corporate Office #beebee | 3 | OmniSuperUltra Corp | Marisol the Janitor, Kenji Watanabe, Priya Nakamura-Smith |
| Downtown | Shizuoka Megamall | 3 | Shizuoka Inc | Sleet, Gus the Noodle Guy, Yumi Sato |
| Downtown | Dark City Central Station | 3 | None | Permafrost, Hoarfrost, Deckard Voss |
| Downtown | The Back Alley | 2 | Iceden Collective | Zero Kelvin, Frostbyte |
| Downtown | Xistential Club | 2 | Crimson Clan | Eddie the Doorman, Blackice |
| Downtown | Sewers | 0 | Chimera | — |
| The Hive (a billion beds) | Platinum Extraluxx Apartments Unit 1337x | 3 | OmniSuperUltra Corp | Felix the Concierge, Mother Carmine, Bradford Chase XVI |
| The Hive | Suburb Tower #2013 | 2 | Shizuoka Inc | Hana Mori, Rust |
| The Hive | Nature Reserve #42 | 2 | Crimson Clan | Dot the Birdwatcher, Little Garnet |
| The Hive | Resident Block #8008315 | 1 | Chimera | Basilisk |
| The Hive | Dirty Mel's | 1 | Iceden Collective | Manticore |
| The Hive | Garbage Dump | 0 | None | — |
| Boonies (off the grid) | Shipyard | 1 | OmniSuperUltra Corp | Wyrm |
| Boonies | Trailer Towers | 1 | None | Ma Kettle |
| Boonies | Little Ghana | 1 | None | Anansi the Spider |
| Boonies | Warehouse | 0 | Shizuoka Inc | — |
| Boonies | The Junction | 0 | Iceden Collective | — |
| Boonies | Tower Furnace | 0 | Crimson Clan | — |
| Boonies | Junktown | 0 | Chimera | — |

Things that mark a location on the digital table:

- Face up on the board: the Detective has played this card. Everyone knows it is not the hideout (in every seating except a human Detective against a computer Hacker, where the safehouse card could not be pulled from a physical deck).
- Crossed off: the Detective has seen the card in hand or in the discard pile. This is private to the Detective.
- Ruled out by a clue: a revealed clue token contradicts one of the location's three facts. Public.
- The safehouse: only the Hacker sees it. Never shown to the Detective until the final reveal.
- There is no jail location on the map. Jail is a separate track (see "The shared area").

## The cards

**Location card** (19). Printed: name, borough, population (0 to 3), affiliation, and the names of its residents (0 to 3 people). Held by the Detective in deck, hand, board, and discard. One is held face down by the Hacker as the safehouse.

**People cards** (25 people, printed twice). Printed: name, affiliation, home location, play cost in AP, whether they are a Witness, and their ability. The Hacker's copies are called Contacts; the Detective's identical copies are called POI cards and have a different back.

| Affiliation (kind) | People | Cost | Ability |
|---|---|---|---|
| None (citizens; all are Witnesses) | Eddie the Doorman, Marisol the Janitor, Gus the Noodle Guy, Dot the Birdwatcher, Felix the Concierge, Ma Kettle | 0 | Witness only. |
| None (Witness) | Anansi the Spider | 2 | Witness. When played as Evidence, removes one of the Detective's informants (a face-down one by position, or a revealed one by name). |
| Iceden Collective (gang) | Zero Kelvin, Permafrost | 1 | Draw 3 Contacts. |
| Iceden Collective (gang) | Blackice, Sleet, Frostbyte, Hoarfrost | 2 | The Detective discards one Location card from hand, pulled at random. |
| Crimson Clan (gang) | Mother Carmine, Rust, Little Garnet | 2 | Discard one face-up Location from the board. |
| Chimera (gang) | Manticore, Basilisk, Wyrm | 2 | Discard one face-up Location from the board. |
| OmniSuperUltra Corp (corp) | Deckard Voss, Priya Nakamura-Smith, Bradford Chase XVI | 2 | Flip one face-down informant face up. |
| Shizuoka Inc (corp) | Kenji Watanabe, Yumi Sato, Hana Mori | 1 | Take one card back from the Hacker's discard pile. |

Any Motive set that includes an Iceden Collective member also wins back one revealed informant for free.

**The Weapon** (1). A unique card in the Contacts deck. Has no POI copy, so it can never be blocked or arrested. Playing it is free.

**Clue tokens** (13 values). Round tokens, about 1.7 inches on the print sheet. Each shows a category label (Borough, Population, Affiliation), a value, and a small tagline (for example "Population 0 — nobody home", "Chimera — barely human"). The truthful version has a solid colored border and a color band at the top. The negative version has a dashed border and a red diagonal band reading NOT.

**Evidence** is not a separate card type. It is People cards and the Weapon placed face up in the Hacker's Evidence zone. Thirteen cards complete it: the Weapon, 3 Witnesses, and 3 Motive sets of 3.

**Informants** are POI cards placed face down in front of the Detective. A revealed informant is the same card turned face up.

## The Detective's area

In front of the Detective:

- Location deck, a face-down pile. Starts at 18 cards (19 minus the Hacker's safehouse). It never reshuffles except during a burn. Only its count is public.
- Location hand, a fan. Starts at 3. Draws 1 per turn and plays 1 per turn, so it normally sits around 3. Contents are private; the count is public.
- Location discard, a face-up pile. Public. Filled by buying clues and by Iceden attacks.
- POI deck, a face-down pile. Starts at 25. Never shuffled. Private. People go back into it when released from jail or from informant duty, so its exact contents are hidden from the Hacker.
- Informants, a row of POI cards. Face-down ones are private to the Detective (the Hacker sees only how many). Revealed ones are public.
- AP: 4 pips per turn. One used-up mid-game guess marker.
- The case board: a private checklist panel of the 19 locations where the Detective crosses off eliminated ones. This is the Detective's whole game and deserves a real panel.

Hidden from the Hacker: the hand's contents, the deck order, which people are face-down informants, which people are still in the POI deck, and any block the Detective chose not to make (a declined block is invisible; the Hacker is not even told a check happened).

## The Hacker's area

In front of the Hacker:

- Contacts deck, a face-down pile. Starts at 26 minus the starting hand. Reshuffles from the discard when empty. Count public.
- Hand, a fan. Starts at 3 (the hideout's residents plus random draws to make 3). No hand limit. Contents private; count public.
- Contacts discard, a face-up pile. Public. People played for their ability go here.
- The safehouse card, one face-down Location card. Private. Only the Hacker knows the hideout.
- Evidence zone (public): one slot for the Weapon, one row of 3 for Witnesses, and 3 rows of 3 for Motive sets. Nothing partial is ever placed; a set lands as three cards at once or not at all.
- AP: 3 pips per turn. An Overclock marker (once per turn). A "safehouse burned" marker (once per game).

Hidden from the Detective: the hand, the deck order, and the hideout.

## The shared area

- The board: a row of face-up Location cards the Detective has played, growing by one per Detective turn. Crimson Clan and Chimera abilities remove cards from it.
- The jail track: three slots in a line with arrows between them, labeled 1 Booked, 2 Processing, 3 Release Pending. Arrested POI cards sit face up in a slot; several can stack in one slot. Every card steps one slot right at the end of each Detective turn; stepping off slot 3 sends the card face down back into the POI deck.
- Clue tokens, truthful: up to 3 revealed at a time, one per category. Public. Shown as the actual value ("Downtown", "2", "Crimson Clan").
- Clue tokens, negative: any number, each reading "NOT X". Public.
- The Hacker's Evidence zone and discard pile are also public and sit on the Hacker's side.
- A turn counter and whose turn it is. There is no round limit; the Location deck running out is the timer (roughly 15 Detective turns at most, fewer as cards are discarded).

## A turn, step by step

The Detective always goes first. Turns alternate.

**Detective's turn (4 AP).**

1. Draw one Location card. Automatic. If the deck is empty, the endgame fires instead and the Detective must make the final guess this turn.
2. If the Hacker Overclocked last turn (and the option is not "immediate"), draw the 2 owed cards. Automatic.
3. Play one Location card face up to the board. Player decides which. Mandatory, free. Move: play a Location.
4. Pay upkeep. Player decides which informants to keep (1 AP each) and which to release. Released informants go face down back into the POI deck. Move: upkeep choice. Skipped if there are no informants.
5. Spend the rest of the AP in any order. Player decides:
   - Arrest (1 AP): a person living at any face-up location on the board. Their POI card goes to jail slot 1.
   - Recruit informant (3 AP): same reach as an arrest. Their POI card goes face down into the informant row.
   - Draw an extra Location (4 AP).
   - Guess the hideout (4 AP): once per game. Right means the Detective wins now. Wrong means play continues and the guess is spent.
   - Buy a clue (no AP; discard 3 Location cards from hand). The Hacker then chooses which category to reveal.
   - End turn (pass).
6. End of turn, automatic: every jailed card advances one slot; cards leaving slot 3 are released.

**Hacker's turn (3 AP).**

Spend AP in any order. Player decides:

- Draw a Contact (1 AP).
- Play a person (their printed cost): use the ability, then the card goes to discard. Some abilities ask a follow-up question (which board Location to discard, which face-down informant to flip, which discard card to take back).
- Play Evidence (free): the Weapon alone, or a complete Witness set of 3, or a complete Motive set of 3 people from 3 different affiliations with at most 2 gang members and no repeated affiliation trio.
- Win back a Contact (printed cost; Witnesses cost 1): play the Contact matching a revealed informant. The informant goes back into the POI deck; the Contact goes to discard. Cannot be blocked.
- Jailbreak (free): free one jailed person and hand the Detective one negative clue that is new information.
- Overclock (free, once per turn): gain 1 AP now; the Detective draws 2 Location cards (by default immediately).
- Burn the safehouse (3 AP, once per game): see "Randomness and hidden information".
- End turn (pass). Unspent AP is lost.

**The informant check** happens automatically whenever the Hacker plays a person or Evidence. If a face-down informant matches the card, the Detective is asked (privately) whether to block. Blocking flips the informant face up, cancels the play, returns the card to the Hacker's hand, keeps the AP spent, and gives the Detective a clue: the Hacker picks the category to reveal. For a 3-card set the check runs card by card in the order declared; one block bounces the whole set. Declining is silent.

**Endgame.** Two triggers: the Hacker's 13th Evidence card lands, or the Location deck is empty at the Detective's draw. Either way the Detective gets one final guess, even if the mid-game guess was spent. Right: Detective wins. Wrong: Hacker is cleared and wins.

## Randomness and hidden information

Draws (each one is a Draw button digitally):

- Detective draws 1 Location at turn start; 2 more after an Overclock; 1 more for the 4 AP action.
- Hacker draws 1 Contact for 1 AP; 3 Contacts from Zero Kelvin or Permafrost.
- Iceden discard attack: a random card leaves the Detective's hand. This is the only random pick that hits the other player.
- Setup shuffles: the Location deck (after the safehouse is removed) and the Contacts deck.
- Contacts reshuffle: when the deck runs out, the discard is shuffled into a new deck.
- Burn reshuffle: the gathered pile becomes the new Location deck.

Hidden zones and who sees them:

| Zone | Seen by |
|---|---|
| Hacker's hideout (safehouse card) | Hacker only |
| Hacker's hand and deck order | Hacker only |
| Detective's hand and deck order | Detective only |
| POI deck contents | Detective only |
| Face-down informants (identity) | Detective only; Hacker sees the count |
| Whether a block was declined | Detective only |
| Board, discards, jail, clues, Evidence, revealed informants, hand sizes, deck sizes, AP | Both |

Reveal mechanics:

- A clue reveal: after a block or a bought clue, the Hacker chooses Borough, Population, or Affiliation (not yet revealed) and its true token appears in the shared area.
- An informant flip: from a block, or from an OmniSuperUltra ability. The card turns face up and stays.
- The burn: the Hacker pays 3 AP, gathers the Location discard pile and the remaining deck into one pile with the old safehouse card, secretly takes a different card as the new safehouse, shuffles the rest as the new deck, and every clue token (truthful and negative) leaves the table. Cards in the Detective's hand and on the board stay put. A human Detective is asked to report the cards still in hand.
- The final reveal: after the final guess the safehouse card is turned over and compared to the guess.

## Setup choices

- Which player is the Detective and which is the Hacker. This is the human's choice, asked before the session starts.
- The Hacker chooses the hideout from the 19 locations. This is a choice the human makes, not a random draw. The chosen Location card leaves the Location deck and becomes the face-down safehouse card. A computer Hacker picks secretly.
- The Hacker takes the Contact cards of the hideout's residents (0 to 3), then draws from the shuffled Contacts deck until holding 3. Automatic once the hideout is named.
- The Detective's Location deck (18 cards) is shuffled and 3 are dealt. The POI deck (25) is placed face down, unshuffled. Automatic.
- Options: a seed, and when the Overclock draws happen (immediately, next turn, or optional). Default is immediately.

## Mapping to the eight primitives

| Zone | Primitive | Notes |
|---|---|---|
| The city (19 locations) | Map | Nodes: 19 named regions grouped in 3 borough areas, each with a population badge and an affiliation color chip. Pieces: a "played" state (face-up card on the node), a "crossed off" mark (Detective-private), a "ruled out by clue" dim state, and one hidden safehouse marker visible only to the Hacker. No edges or routes. |
| Board of played Locations | Card zone, row | Face-up. Can also be shown as the map's played state rather than a separate row. |
| Location deck | Card zone, pile | Hidden; count only. |
| Location hand | Card zone, fan | Detective-private. |
| Location discard | Card zone, pile | Face-up, top visible. |
| POI deck | Card zone, pile | Hidden; count only. |
| Informant row | Card zone, row | Mixed face-down and face-up cards. Face-down ones show only a back to the Hacker, and are numbered by position (abilities target "face-down informant #2"). |
| Jail track | Track | 3 spaces in a line, each holding a stack of face-up POI cards; arrows between spaces. |
| Truthful clues | Pool | 3 category slots, each empty or holding one token showing its value. |
| Negative clues | Pool | A growing row of NOT tokens. |
| Contacts deck | Card zone, pile | Hidden; count only. |
| Contacts hand | Card zone, fan | Hacker-private. |
| Contacts discard | Card zone, pile | Face-up. |
| Evidence zone | Tableau slots | 1 Weapon slot, one row of 3 Witness slots, 3 rows of 3 Motive slots. Empty slots are drawn as outlines. |
| Safehouse card | Card | Single face-down card; face visible only to the Hacker. |
| Each player's panel | Tableau | Title, AP pips (4 or 3) as a meter, markers for mid-game guess used, Overclock used, safehouse burned; nests the hand, decks, and rows above. |
| Case board (Detective) | Tableau | The 19-row checklist with checkboxes, plus 3 clue lines and 4 NOT lines. Could be folded into the map's crossed-off state on a phone. |

Not used: bag, grid.

## Moments to animate

- The mandatory draw and play: a card lifts from the Location deck into the fan, then one card slides from the fan to the board (and the matching map node lights up as "played" and is visibly ruled out).
- Canvassing: when a Location is played, its residents become arrestable and recruitable; a short highlight on those names invites the Detective's next action.
- An arrest: the POI card flies from the (hidden) POI deck to jail slot 1 and lands face up with a stamp. At turn end the whole jail shifts one slot right; a card leaving slot 3 flips face down and fades back into the POI deck.
- Recruiting: a POI card slides face down into the informant row. The Hacker sees only a new card back appear and the count go up.
- The informant check and block: the Hacker's card hovers over its destination. If blocked, the informant flips face up, the card snaps back to the Hacker's hand, the AP pip stays spent, and a clue token appears. If declined, the card simply lands; nothing else shows.
- A clue reveal: the Hacker's three-way choice, then the token drops into its category slot. On the map, every location that contradicts it dims.
- Evidence landing: three cards land together in a Motive or Witness row; the Weapon lands alone. When the 13th card lands, the table freezes and the final-guess prompt takes over immediately.
- Jailbreak: a card leaves the jail track and fades into the POI deck while a NOT token appears in the negative clue row.
- Overclock: one extra AP pip lights on the Hacker's side and two cards slide into the Detective's fan.
- The burn: the discard pile and the deck sweep together into one stack, the old safehouse card joins it, one card is pulled out face down as the new safehouse, the stack shuffles and returns as the deck, and every clue token slides off the table. The map's clue dimming clears; the Detective's crossed-off marks for cards still in hand remain.
- Mid-game guess: the Detective picks a map node; the safehouse card turns over. Match means arrest. Miss means the guess marker goes gray and play resumes.
- Endgame reveal: the same turn-over, held longer. The winner's stamp: "the frame job holds" for the Detective, "exonerated" for the Hacker.

## Colors and names

From the printed player aids and token sheets (hex codes are in the source CSS):

| Use | Hex | Name in source |
|---|---|---|
| Ink (text, rules, borough headers) | #16181c | ink |
| Paper (sheet background) | #fafaf7 | paper |
| Page background behind sheets | #e8e6e1 | — |
| Rule lines | #c9c7bf | rule |
| Muted text | #5c5f66 | muted |
| Detective accent | #b3222a | stamp red |
| Detective tint | #f0ead9 | manila |
| Hacker accent | #1f6e8c | glacier blue |
| Hacker tint | #e4eef2 | ice |
| Faction: None | #6b6f76 | |
| Faction: OmniSuperUltra Corp | #1c2a5e | |
| Faction: Shizuoka Inc | #0e7c6b | |
| Faction: Iceden Collective | #1f6e8c | same as the Hacker accent; the Hacker is an Iceden member |
| Faction: Crimson Clan | #7a1220 | |
| Faction: Chimera | #5a3d8a | |
| Borough tokens | #16181c | |
| Population tokens | #3d4046 | |

Type: IBM Plex Sans for body, IBM Plex Mono for labels and small caps headers, Special Elite (a typewriter face) for the Detective's titles and stamps, Share Tech Mono (a terminal face) for the Hacker's titles and prompt. The rulebook itself is plain Georgia on white with one red accent (#c0392b).

Visual language: the Detective's side is a police case file. Rotated red rubber stamps read "CASE #2127", "EVIDENCE HOLD", "VERIFIED", and "UNRELIABLE". Footers read "Dark City PD · Internal use only" and "Holding cells B-level". The jail slots are dashed manila wells with a faint diagonal ghost text "DARK CITY PD PROPERTY OF HOLDING". The Hacker's side is a terminal: a shell prompt "hacker@iceden:~$ clear_my_name", a footer "Iceden Collective · burn after reading". AP are shown as ✕ pips in the side's accent color. Truthful clue tokens have a solid colored top band; negative tokens have a dashed border and a red "NOT" sash. Borough taglines: Downtown "neon & concrete", The Hive "a billion beds", Boonies "off the grid". Faction taglines: None "ordinary citizens", OmniSuperUltra "they make everything", Shizuoka "they own everywhere", Iceden "anarchist hackers", Crimson Clan "sexy + scary", Chimera "barely human".

The theme implies neon-on-wet-concrete cyberpunk noir, but the print sheets are deliberately paper-toned and restrained; a dark theme should keep the red-stamp / glacier-blue pairing and use the faction hues as the only saturated colors.

## Phone

The hard parts on a phone are the 19-location map and the fact that each player has a private hand plus several piles. Suggested approach: the map collapses to three borough tabs or a scrollable list with the population badge and affiliation chip inline, and the "crossed off" and "ruled out" states become strike-throughs. The board row of played Locations does not need to exist separately on a phone; the map's played state carries it. The active player's fan sits at the bottom; the opponent's side shows only counts (deck, hand, discard) and the public rows (informants, Evidence, jail, clues). The jail track and the clue pool are small enough to share one strip. The Evidence zone (13 slots) should show as a compact 1 + 3 + 3×3 grid of outlines that fills in. Long location names such as "Platinum Extraluxx Apartments Unit 1337x" need a short form or two-line wrapping.

## Reference images

None available. The three HTML sources contain no images, SVG, or embedded pictures; they are text and CSS only. The playtest log is plain text. No image folder was created.

## Sources

- C:\Users\zekes\Code\zekel\port\cybernoir-2127\CYBERNOIR-2127-RULES.html (rules v2.3, components, card lists, flavor)
- C:\Users\zekes\Code\zekel\port\cybernoir-2127\cybernoir-2127-player-aids.html (Detective and Hacker aids, case board, colors and fonts)
- C:\Users\zekes\Code\zekel\port\cybernoir-2127\cybernoir-2127-jail-and-clues.html (jail track layout, clue token design, faction colors)
- C:\Users\zekes\Code\zekel\port\cybernoir-2127\Cybernoir_Playtest_08-19-2026.md (skimmed for feel)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\types.ts (zone table, state and move types)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\data\index.ts (all locations, people, factions, clue tokens, the Weapon)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\views.ts (what each seat sees)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\engine.ts (setup, turn start and end, jail advance, abilities, block, overclock, burn)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\legalMoves.ts (move descriptions)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\choices.ts (every player-owned decision)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\rulesSections.ts (rules as sections)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\index.ts (player count, options, setup checklist, guidance)
- C:\Users\zekes\Code\zekel\src\games\cybernoir-2127\STRATEGY-GUIDE.md and POST-PORT.md (zone table, turn structure)
- C:\Users\zekes\Code\zekel-universe\docs\design-brief.md (the eight primitives)
