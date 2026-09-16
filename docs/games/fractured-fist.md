# Fractured Fist — table reference for the designer

Status 2026-09-15. Written for a designer who has never seen the game. The rules
engine in `zekel` is the source of truth for every number here. The printed
rulebook is older and disagrees in a few places; each disagreement is called out
and the engine wins.

## What it is

Fractured Fist is a two-player card fight. Each player starts with a small,
weak deck and buys better cards during the game to make it stronger (a "deck
builder"). Each round both players take one turn, then the punches land at the
same time. Winning means knocking the other player's stamina (their health) from
7 down to 0. A game runs about 10 to 20 rounds and 10 to 20 minutes. The setting
is a near-future world of martial artists who channel "spirit" energy, told with
comic-book energy: a fist in a starburst is the game's mark. A longer campaign
mode with a world map exists in the original app; this document covers only the
one-on-one duel.

## Everything on the table

The engine gives each player their **own** supply. Nothing is shared between the
two players except the round counter.

Per player:

- **Starting deck: 10 cards.** 7 Focus and 3 Misstep, shuffled.
- **Resource supply: 60 cards.** 20 Focus, 20 Momentum, 20 Mastery.
- **Technique supply: 35 cards.** 5 copies of each of the 7 techniques chosen
  at setup (the "loadout").
- **Misstep cards.** A player can never hold more than 10 Missteps across deck,
  hand and discard combined. They start with 3, so up to 7 more can be pushed
  on them by the opponent. Budget 10 per player.
- **Stamina.** Starts at 7, maximum 7. (The rulebook says 10, and the engine's
  option description also advertises 10, but the engine actually applies 7 when
  nothing is passed. Prefer 7.)
- **Six small counters** that reset every round: actions, channels, spirit,
  damage queued, defense queued, refines pending.
- **Hand size: 5.** The player redraws to 5 at end of turn.

For the whole table: one round counter, one "whose turn" marker, and the two
player areas.

Total physical cards if you built it: 2 × (10 + 60 + 35) + 14 extra Missteps
= 224 cards. The rulebook instead describes one shared pool of 10 copies per
card. Prefer the engine's per-player supply.

## Anatomy of a card

Every card has these printed fields:

- **Name.** The card's title, e.g. "Devastating Blow".
- **Type.** One of three words: RESOURCE, TECHNIQUE, MISSTEP.
- **Cost.** How much spirit it takes to buy it from the supply. Range 0 to 10.
  Focus and Misstep cost 0.
- **Effects text.** A short line of "+N Thing" fragments, e.g. "+1 Draw, +3
  Damage." The things that can appear:
  - **Damage** (1–5): hits the opponent at the end of the round.
  - **Defense** (1–3): cancels that much incoming damage this round.
  - **Tech** (1–3): more technique cards you may play this turn. Every player
    starts a turn with 1.
  - **Draw** (1–3): draw cards from your deck right now.
  - **Spirit** (2): extra buying power this turn.
  - **Channel** (1): one more purchase allowed this turn. Everyone starts with 1.
  - **Refine** (1–2): permanently remove that many cards from your hand.
  - **Missteps** (1–3): push that many Misstep cards into the opponent's discard.
  - **Heal** (2–3): recover stamina, never above 7.
- **Spirit value** (resources only): 1, 2 or 3. What the card is worth when
  played as money.
- **Supply count.** How many copies remain in your supply (starts at 5 for
  techniques, 20 for resources). This is a live number, not fixed print.
- **Faction** (some techniques): one of four schools. It has no rules effect;
  it is flavor and a colour cue.

**card-anatomy.png** (231 × 187 px, dark background) shows one card outline with
five labels and arrows. Top-left inside the card: the name "Center" in bold,
under it "TECHNIQUE" in small grey caps, under that the effects line "+2 Spirit,
+1 Channel." Top-right corner: a small dark-blue square holding the cost "4".
Bottom-right corner: a small box reading "x5", the supply count. The arrow
labels read Name, Cost, Type, Effects, Supply. Note the image is out of date:
in the engine Center costs 2 and gives only "+2 Spirit" (the stats shown belong
to Energy Channeling). Use the layout, not the numbers.

## The card list

"Copies" is per player. "—" means the card is not in the default supply; it can
be chosen in the loadout at setup.

**Resources** (played in the Channel step for spirit)

| Name | Cost | Spirit value | Effect | Copies |
|---|---|---|---|---|
| Focus | 0 | 1 | If your stamina is below the opponent's, you may discard every Focus in hand and draw that many (max 3 times per turn). | 20 in supply + 7 in starting deck |
| Momentum | 3 | 2 | 2 spirit. | 20 |
| Mastery | 6 | 3 | 3 spirit. | 20 |

**Misstep** (dead weight)

| Name | Cost | Effect | Copies |
|---|---|---|---|
| Misstep | 0 | Cannot be played. Refine to remove. | 3 in starting deck; cap 10 per player |

**Techniques, default loadout** (5 copies each per player)

| Name | Cost | Effect | Faction |
|---|---|---|---|
| Attack | 4 | +1 Damage | none |
| Block | 3 | +1 Defense | none |
| React | 3 | +2 Tech | none |
| Quicken | 2 | +2 Draw | none |
| Center | 2 | +2 Spirit | none |
| Distract | 3 | +2 Missteps to opponent | none |
| Assess | 2 | +2 Refine | none |

**Techniques, optional** (0 copies unless chosen at setup; then 5 each)

| Name | Cost | Effect | Faction |
|---|---|---|---|
| Defensive Kata | 4 | +2 Refine, +2 Defense | Masters' Circle |
| Perfect Form | 5 | +1 Refine, +2 Draw, +1 Tech | Masters' Circle |
| Master's Riposte | 5 | +1 Defense, +1 Damage | Masters' Circle |
| Flowing Counter | 5 | +2 Tech, +3 Defense | Masters' Circle |
| Impose Pressure | 4 | +1 Draw, +2 Spirit, +1 Channel | Uncounted |
| Leg Sweep | 5 | +2 Missteps, +1 Damage | Uncounted |
| Overwhelming Assault | 8 | +2 Tech, +2 Damage | Uncounted |
| Ruthless Barrage | 5 | +1 Draw, +2 Tech, +3 Missteps | Uncounted |
| Showstopper | 5 | +2 Spirit, +1 Damage | Titan Entertainment |
| Targeted Strike | 5 | +1 Refine, +1 Damage | Titan Entertainment |
| Grand Finale | 10 | +5 Damage | Titan Entertainment |
| Devastating Blow | 8 | +1 Draw, +3 Damage | Titan Entertainment |
| Energy Channeling | 4 | +2 Spirit, +1 Channel | The Awakened |
| Enlightened Flow | 5 | +3 Tech, +2 Spirit | The Awakened |
| Inner Harmony | 6 | +2 Heal, +2 Refine | The Awakened |
| Transcendent Strike | 8 | +1 Draw, +3 Heal, +2 Damage | The Awakened |
| Read Opponent | 4 | +1 Draw, +2 Tech | none |
| Deflecting Block | 3 | +1 Tech, +1 Defense | none |
| Smoke Bomb | 3 | +2 Tech, +1 Misstep | none |
| Combination Rush | 3 | +2 Tech, +1 Channel | none |
| Thoughtful Composure | 4 | +2 Tech, +2 Refine | none |
| Mental Clarity | 3 | +3 Draw | none |
| Flying Kick | 6 | +2 Damage | none |

34 card definitions in total: 3 resources, 1 Misstep, 30 techniques. The
rulebook's prices differ for several cards (e.g. Mental Clarity 4, Devastating
Blow 8 with different effects); use the table above.

## Each player's area

- **Deck.** Face down. Only the count is public. The owner knows what cards
  are in it (it is their own shuffled cards) but not the order.
- **Hand.** Hidden from the opponent. Only the count is public. Usually 5.
- **Discard pile.** Face up, top card visible, count shown. Contents are public
  (ruling from the game's owner, 2026-08-05). Bought cards and Missteps pushed
  by the opponent land here, not in hand.
- **Played row.** Face up, public. Every card played this turn, resources
  included, stays here until the end-of-round strike. The rulebook says
  non-combat cards go straight to discard; the engine keeps them all on the
  table. Prefer the engine: it lets both players see what was played.
- **Stamina.** Public. Current out of 7.
- **Damage queued** and **defense queued.** Public. What this player's played
  cards will do at the strike.
- **Actions** (called "Tech" on cards), **channels**, **spirit**, **refines
  pending.** Public. Small counters that matter only during this turn.
- **Misstep count.** Public. How many Missteps are anywhere in this player's
  cards, out of 10.
- **Supply.** Public. Ten stacks: 3 resources and 7 techniques, each with a
  count. This belongs to the player, not the middle of the table.
- **Focus reloads used this turn.** 0 to 3.

Refined cards leave the game entirely; there is no removed pile to draw.

## The shared area

Very little. The round number and whose turn it is. The engine has no shared
market; both supplies sit with their owners. A designer may still want to draw
the two supplies near the centre so both are readable, but each is owned.

## A turn, step by step

Player 1 always takes the first turn of every round. The engine has two phases
per turn plus an end-of-turn cleanup; the strike happens once per round after
both turns.

**1. Technique phase.** The player decides which technique cards to play, one
at a time, spending 1 action each (start: 1 action). Each card's effects happen
immediately: counters go up, cards are drawn, damage or defense is queued, heal
lands, Missteps are pushed into the opponent's discard. Automatic: the card
moves to the played row. If a card grants Refine, the game stops everything
until the player either picks cards from hand to remove (one at a time) or
skips the rest. If the player's stamina is lower than the opponent's, they may
also **Focus reload** (discard every Focus in hand, draw the same number), up to
3 times a turn. When done, the player chooses **Advance to Channel** or **End
turn** (skipping the channel phase).

Moves available: Play card, Refine a card, Skip refine, Focus reload, Advance
phase, End turn.

**2. Channel phase.** The player decides which resource cards to play; each
adds its spirit value (1, 2 or 3) to their spirit counter and moves to the played
row. Then they may **Buy** a card from their own supply if they have enough
spirit and a channel left (start: 1 channel). Automatic: spirit drops by the
card's cost, the supply count drops by 1, the card slides into the discard pile.
Leftover spirit stays for a second buy if a card gave +1 Channel; anything left
at the end of the round is lost. Focus reload is also allowed here.

Moves available: Play resource, Buy card, Focus reload, End turn.

**3. End of turn (cleanup).** All automatic: the hand goes to the discard pile
and the player draws 5. If the deck runs out mid-draw, the remaining cards are
drawn first, then the discard pile is shuffled into a new deck and the draw
continues. Played cards stay on the table. Then the other player takes their
turn.

**4. Strike (once per round, after both turns).** Automatic. Each player's
queued damage minus the other's queued defense (never below 0) is taken off the
other's stamina, at the same time. Both played rows sweep into their discard
piles. Actions reset to 1, channels to 1, spirit to 0. Round counter +1. If a
player is at 0 or less, the game ends; if both are, it is a tie. Otherwise
Player 1 starts the next round.

Rulebook differences: it puts Refine at the end of the turn (engine: right
when the card is played) and says the Focus card also "gains 1 action" (engine:
it does not).

## Randomness and hidden information

- **Shuffles.** Once at setup for each starting deck, and whenever a discard
  pile becomes a new deck.
- **Draws** happen at: setup (5 each), end of every turn (back up to 5), any
  card with "+N Draw" the moment it is played, and each Focus reload. Each is
  a Draw moment in the digital table.
- **Hidden.** Each hand is private to its owner. Deck order is hidden from
  everyone. Everything else, including discard contents and the played row, is
  public.
- The AI opponent's hand is hidden from the human exactly as a human's would be.

There are no dice and no bag.

## Setup choices

- **Loadout** (the big one): the 7 techniques that fill each player's supply,
  picked from the 30 techniques. Both players get the same 7. The default is
  Attack, Block, Assess, Center, Distract, Quicken, React. The engine's guidance
  says to ask the player rather than silently defaulting.
- **Starting stamina**: any whole number from 1; engine default 7.
- **Hand size**: any whole number from 1; default 5.
- **Random seed**: for repeatable games; players will not see this.
- **Difficulty** for the AI seat: easy, medium, hard, or search-based.
- **Fighting style** for the AI (optional flavour): burst (Titan), sustain
  (Awakened), defense (Masters), disruption (Uncounted).

The 7-card pick is worth a real screen: 30 cards, grouped by faction, 7 slots.

## Mapping to the eight primitives

- **Card:** every card. Face shows name, type, cost badge, effects text; back is
  a shared pattern. States: playable (enough actions/phase), disabled, selected,
  refine-target.
- **Card zone, pile:** deck (hidden, count only), discard (top card visible,
  count, public).
- **Card zone, fan:** the hand. Own hand face up; opponent's hand as face-down
  backs with a count.
- **Card zone, row:** the played row (face up, grows during the turn, sweeps
  away at the strike); each supply as a row of 10 stacks, each stack a pile with
  a count badge and a cost badge.
- **Tableau:** one per player, holding stamina as a meter (7 max), the six
  small counters as stat rows, and slots for hand, deck, discard, played row and
  supply.
- **Track:** the round counter. Optionally stamina drawn as a 7-space track.
- **Pool:** spirit during the channel phase reads well as a pool of chips that
  fills as resources are played and empties on a buy. Damage and defense queued
  are also small pools.
- **Bag, Grid, Map:** not used in the duel. (Map exists only in campaign mode.)

## Moments to animate

- **Card played (technique).** Lifts from the fan, travels to the end of the
  played row, lands. Action counter ticks down by 1, then any "+N Tech" ticks it
  up. Its effect fragments light up one by one.
- **Damage queued.** A red "+N" lifts off the card and drops onto this player's
  damage counter. Same for defense in the opponent-facing direction, but it does
  not hit anyone yet.
- **Draw.** N cards slide off the top of the deck into the fan, one after the
  other; deck count ticks down. If the deck empties mid-draw, the discard pile
  visibly flips and shuffles into the deck spot before the draw continues.
- **Refine.** The chosen card lifts out of the hand and burns away / fades to
  nothing (it leaves the game). Refines-pending counter ticks down. Misstep
  count ticks down if it was a Misstep.
- **Missteps pushed.** N Misstep cards fly from off-table into the opponent's
  discard pile; their Misstep count ticks up.
- **Heal.** Stamina meter fills up, never past 7.
- **Focus reload.** All Focus cards in the fan leave together to the discard,
  then the same number slide in from the deck.
- **Resource played.** Card travels to the played row; spirit pool gains 1, 2
  or 3 chips.
- **Buy.** Spirit chips drain by the cost; the supply stack's count ticks down;
  a copy slides from the stack into the discard pile. Channels ticks down.
- **End of turn.** Whole fan sweeps into the discard, 5 new cards draw in, the
  turn marker moves to the other player.
- **Strike.** Both players' damage totals travel toward the opponent; the
  defence total blocks part of it (shrink the incoming number by the defence,
  show the absorb); the remainder hits and the stamina meter drops. Then both
  played rows sweep into discards and the small counters reset. Round counter
  advances.
- **Game end.** Stamina hits 0: the losing meter empties, result banner names
  the winner (or "Tie") with both final stamina numbers.

Only the strike and reshuffle need more than a few hundred milliseconds; they
are the two beats of the round.

## Colors and names

From the original app and its intro page (dark theme):

- Title orange **#ff6b35**, lighter accent **#ff8c61**; gold used for a closing
  call-out. Page background **#0a0a0a** / app background **#121212**, surface
  **#1e1e1e**, text **#e0e0e0**, dim text **#a0a0a0**.
- Faction colours: Masters' Circle **#d63031** (red in the stylesheet; the data
  file says #aaa grey), Uncounted **#0984e3** (blue), Titan Entertainment
  **#fdcb6e** (gold), The Awakened **#00b894** (green).
- Card cost badge in the anatomy image is a dark blue square.
- The logo is a black clenched fist inside a white jagged comic-book burst.

Vocabulary to print on the table: **Stamina** (health), **Spirit** (money),
**Tech** (plays left), **Channel** (buys left), **Refine** (remove for good),
**Misstep** (dead card), **Strike** (end-of-round hit). Factions: The Masters'
Circle, The Uncounted, Titan Entertainment, The Awakened. The three species in
the flavour text (Grankiki, Bouaux, Unmoored) do not appear in the duel.

## Phone

- Two supplies of 10 stacks each is 20 count-badged stacks. On a phone, show
  only the active player's supply and only in the channel phase, as a scrollable
  row or a two-row grid.
- The played row can hold 6 or more cards in a big turn. It needs to compress
  into overlapping cards or a count with a peek.
- Six small counters plus stamina per player is a lot of numbers. Show actions
  and channels only during their phase; show spirit only in the channel phase;
  keep stamina, damage and defense always visible.
- The strike moment needs both players' damage, defense and stamina in view at
  once; it should take over the screen briefly.
- The 7-of-30 loadout pick is a full-screen flow on its own.

## Reference images

All in `docs/games/fractured-fist/`:

- **card-anatomy.png** — labelled card layout: name, type, effects, cost badge
  top-right, supply count bottom-right (numbers on it are stale).
- **punch-blast.png** — the game's mark: black fist in a white starburst on
  black, 512 × 512.
- **punch-blast.svg** — the same mark as vector, used as the app favicon.
- **campaign-map1.png** — a campaign-mode world map (green landmass on cyan
  sea); not used in the duel, included so the designer knows the wider setting.

## Sources

- C:\Users\zekes\Code\antigravity-fist-and-form\FRACTURED-FIST-RULES.md
- C:\Users\zekes\Code\antigravity-fist-and-form\docs\card-anatomy.png
- C:\Users\zekes\Code\antigravity-fist-and-form\docs\punch-blast.png
- C:\Users\zekes\Code\antigravity-fist-and-form\docs\punch-blast.svg
- C:\Users\zekes\Code\antigravity-fist-and-form\docs\intro.html (setting, colours)
- C:\Users\zekes\Code\antigravity-fist-and-form\docs\maps\map1.png
- C:\Users\zekes\Code\antigravity-fist-and-form\src\data\factions.js (faction colours)
- C:\Users\zekes\Code\antigravity-fist-and-form\src\styles\main.css (theme colours)
- C:\Users\zekes\Code\zekel\src\games\fractured-fist\types.ts
- C:\Users\zekes\Code\zekel\src\games\fractured-fist\cards.ts
- C:\Users\zekes\Code\zekel\src\games\fractured-fist\views.ts
- C:\Users\zekes\Code\zekel\src\games\fractured-fist\engine.ts
- C:\Users\zekes\Code\zekel\src\games\fractured-fist\legalMoves.ts
- C:\Users\zekes\Code\zekel\src\games\fractured-fist\choices.ts
- C:\Users\zekes\Code\zekel\src\games\fractured-fist\index.ts
- C:\Users\zekes\Code\zekel\src\games\fractured-fist\AI-NOTES.md
- C:\Users\zekes\Code\zekel-universe\docs\design-brief.md (the eight primitives)
