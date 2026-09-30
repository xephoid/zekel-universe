// Adventurer Olympics glue: the hex map of 7-hex tiles, the four decks and
// the tile stack, the rune supply and the quests, each seat's tableau, and
// this seat's companions, monsters and runes along the bench. The view is
// the engine's (zekel src/games/adventurer-olympics/views.ts); every rule
// comes from it: legal steps and slots from the legal moves, a tile's hexes
// and where its icons land from the view's placement options, stats from the
// view. Nothing here works out a rule. Plan: docs/implementation-plan.md §18;
// look: docs/design/adventurer-olympics/.
//
// Hex keys are the engine's axial "q,r" (its N is (1,-1)); the map primitive
// draws flat-topped axial hexes, so each key is redrawn at (q + r, -q).
// That is a change of drawing axes, not a rule.
//
// Exploring is put together on screen before it is sent: tap a glowing slot,
// turn the tile, press Place. Those taps change GlueInput.ui only; Place
// sends the one listed move for that slot and turn.

import type { CardData, CardZoneData, MapNode, TableauData } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import type {
  FormField, GlueInput, GlueModule, LegalMove, MoveForm, PlanPrompt, PromptAction, SelectEvent,
  SetupAnswers, SetupField, SetupSeat, TablePlan, Zone,
} from '../types';
import { asArr, asNum, asStr, isObj, shapeHas } from '../types';
import { answerText } from '../forms';
import { iconUrl } from './icons';
import './ao.css';

const GAME = 'adventurer-olympics';

// ---- the look (docs/design/adventurer-olympics/README.md, "The look") -------

const PLAYER_COLOUR: Record<string, string> = { red: '#e8483d', blue: '#3d8bfd', yellow: '#ffc83d', purple: '#9b5de5' };
const LAND = ['#c8e6a0', '#bfe39a', '#d2eaa8', '#c3e0a4', '#cfe6b0', '#d8e8a0', '#c6e3ac', '#bddf9c', '#d0e4a4', '#c9e8b0'];
const PALETTE: Record<string, string> = {
  ...PLAYER_COLOUR,
  ...Object.fromEntries(LAND.map((c, i) => [`land${i + 1}`, c])),
  companion: '#5aa9e6', little: '#8fd14f', big: '#ff7a59', dungeon: '#9d8fc2', rune: '#6b5f93',
  tile: '#f3e6c8', quest: '#ffd95e', parchment: '#fbf3e0',
};

/** The four adventurers (the standees); any can take any colour. */
const ADVENTURERS = ['Fighter', 'Ranger', 'Wizard', 'Rogue'] as const;
const COLOURS = ['Red', 'Blue', 'Yellow', 'Purple'] as const;

/** Each companion looks like what it gives (README, "What each card shows"). */
const COMPANION_ART: Record<number, [string, string]> = {
  1: ['cat', 'Cat'], 2: ['imp', 'Imp'], 3: ['pseudodragon', 'Pseudodragon'], 4: ['squire', 'Squire'],
  5: ['unicorn', 'Unicorn'], 6: ['horse', 'Horse'], 7: ['goat', 'Goat'], 8: ['pegasus', 'Pegasus'],
  9: ['fairy', 'Fairy'], 10: ['broom', 'Magic Broom'], 11: ['owl', 'Owl'], 12: ['parrot', 'Parrot'],
  13: ['orc', 'Orc'], 14: ['wolf', 'Wolf'], 15: ['golem', 'Stone Golem'], 16: ['bard', 'Bard'],
};
/** One creature per monster number. */
const MONSTER_ART: Record<number, [string, string]> = {
  2: ['slime', 'Slime'], 3: ['goblin', 'Goblin'], 4: ['skeleton', 'Skeleton'],
  5: ['ogre', 'Ogre'], 6: ['spider', 'Giant Spider'], 7: ['dragon', 'Dragon'],
};
/** The engine's icon kinds, as the canvas draws and names them. */
const ICON: Record<string, { art: string; name: string }> = {
  city: { art: 'city', name: 'City' },
  dungeon: { art: 'dungeon', name: 'Dungeon' },
  little_monster: { art: 'little', name: 'Little Monster' },
  big_monster: { art: 'big', name: 'Big Monster' },
  hearts: { art: 'hearts', name: 'Heart rune' },
  spades: { art: 'spades', name: 'Spade rune' },
  diamonds: { art: 'diamonds', name: 'Diamond rune' },
  clubs: { art: 'clubs', name: 'Club rune' },
  star: { art: 'star', name: 'Star rune' },
};
const DUNGEON_CARD: Record<string, string> = {
  little_monster: 'Little Monster', big_monster: 'Big Monster', double_little_monsters: '2 Little Monsters',
  companion: 'Companion', any_artifact: 'Any rune', map: 'Map',
};
const DECKS = [
  { key: 'companion', label: 'Companions', art: 'cha' },
  { key: 'dungeon', label: 'Dungeon', art: 'dungeon' },
  { key: 'little', label: 'Little Monsters', art: 'little' },
  { key: 'big', label: 'Big Monsters', art: 'big' },
] as const;

// ---- reading the view -------------------------------------------------------

interface Player {
  id: string; name: string; standee: string; colour: string; hex: string; stepsLeft: number; initiative: number;
  companions: string[]; little: string[]; big: string[]; artifacts: string[]; questPoints: number;
  claimedQuests: string[]; exploredTiles: number[]; dungeonsCompleted: number; tokensSpent: number;
  stats: { charisma: number; strength: number; movement: number } | null;
}

/** A seat's name; an AI seat the engine names only by its seat id is called by its colour. */
function nameOrColour(p: Record<string, unknown>): string {
  const id = asStr(p['player_id']), name = asStr(p['name']), colour = asStr(p['colour']);
  return name && name !== id ? name : colour || id;
}

function players(view: Record<string, unknown>): Player[] {
  return asArr(view['players']).filter(isObj).map((p) => {
    const st = isObj(p['stats']) ? p['stats'] : null;
    return {
      // An AI seat has no name of its own; the table calls it by its colour.
      id: asStr(p['player_id']), name: nameOrColour(p), standee: asStr(p['standee']), colour: asStr(p['colour']),
      hex: asStr(p['hex']), stepsLeft: asNum(p['stepsLeft']), initiative: asNum(p['initiative']),
      companions: asArr(p['companions']).map((x) => asStr(x)), little: asArr(p['littleMonsters']).map((x) => asStr(x)),
      big: asArr(p['bigMonsters']).map((x) => asStr(x)), artifacts: asArr(p['artifacts']).map((x) => asStr(x)),
      questPoints: asNum(p['questPoints']), claimedQuests: asArr(p['claimedQuests']).map((x) => asStr(x)),
      exploredTiles: asArr(p['exploredTiles']).map((x) => asNum(x)), dungeonsCompleted: asNum(p['dungeonsCompleted']),
      tokensSpent: asNum(p['tokensSpent']),
      stats: st ? { charisma: asNum(st['charisma']), strength: asNum(st['strength']), movement: asNum(st['movement']) } : null,
    };
  });
}

const colourKey = (colour: string) => (colour.toLowerCase() in PLAYER_COLOUR ? colour.toLowerCase() : 'parchment');
const tint = (colour: string) => PLAYER_COLOUR[colour.toLowerCase()] ?? '#2b2233';

/** The figure a seat stands as: its chosen adventurer, or for a seat whose
 *  standee is unnamed (an AI's "Standee 2"), the first adventurer nobody
 *  took, in seat order. Only the picture; the engine keeps the name. */
function adventurerOf(all: Player[], id: string): string {
  const named = new Set(all.map((p) => ADVENTURERS.find((a) => a.toLowerCase() === p.standee.toLowerCase())).filter(Boolean));
  const free = ADVENTURERS.filter((a) => !named.has(a));
  let k = 0;
  for (const p of all) {
    const own = ADVENTURERS.find((a) => a.toLowerCase() === p.standee.toLowerCase());
    const pick = own ?? free[k++ % Math.max(1, free.length)] ?? 'Fighter';
    if (p.id === id) return pick;
  }
  return 'Fighter';
}

interface RefCard { id: string; number: number; bonus: Record<string, number> }
function refCards(view: Record<string, unknown>, key: string): RefCard[] {
  const rd = isObj(view['referenceData']) ? view['referenceData'] : {};
  return asArr(rd[key]).filter(isObj).map((c) => ({
    id: asStr(c['id']), number: asNum(c['number']),
    bonus: isObj(c['bonus']) ? Object.fromEntries(Object.entries(c['bonus']).map(([k, v]) => [k, asNum(v)])) : {},
  }));
}
function questNames(view: Record<string, unknown>): Record<string, { name: string; endGame: boolean }> {
  const rd = isObj(view['referenceData']) ? view['referenceData'] : {};
  return Object.fromEntries(asArr(rd['quests']).filter(isObj).map((q) => [asStr(q['kind']), { name: asStr(q['name']), endGame: q['endGame'] === true }]));
}

const STAT_WORD: Record<string, string> = { strength: 'Strength', charisma: 'Charisma', movement: 'Movement' };
function bonusText(bonus: Record<string, number>): string {
  return Object.entries(bonus).filter(([, v]) => v).map(([k, v]) => `+${v} ${STAT_WORD[k] ?? k}`).join(', ');
}

function cardFor(view: Record<string, unknown>, cardId: string): CardData {
  const comp = refCards(view, 'companions').find((c) => c.id === cardId);
  if (comp) {
    const n = Number(cardId.replace(/\D+/g, ''));
    const [art, name] = COMPANION_ART[n] ?? ['cat', cardId];
    return { id: `ao:card:${cardId}`, label: name, subtitle: bonusText(comp.bonus), cost: comp.number, artUrl: iconUrl(art, { wobble: false }), colorKey: 'companion' };
  }
  for (const [key, deck, word] of [['littleMonsters', 'little', 'Little Monster'], ['bigMonsters', 'big', 'Big Monster']] as const) {
    const m = refCards(view, key).find((c) => c.id === cardId);
    if (m) {
      const [art, name] = MONSTER_ART[m.number] ?? ['goblin', cardId];
      return { id: `ao:card:${cardId}`, label: name, subtitle: word, cost: m.number, artUrl: iconUrl(art, { wobble: false }), colorKey: deck };
    }
  }
  return { id: `ao:card:${cardId}`, label: cardId };
}

function runeCard(a: string, holder?: string): CardData {
  const icon = ICON[a];
  return { id: `ao:rune:${a}`, label: icon?.name ?? a, subtitle: holder, artUrl: iconUrl(icon?.art ?? a, { wobble: false }), colorKey: 'rune' };
}

/** Engine key "q,r" to the map primitive's flat-topped axial coordinate. */
function hexOf(key: string): { q: number; r: number } | null {
  const m = /^(-?\d+),(-?\d+)$/.exec(key);
  if (!m) return null;
  const q = Number(m[1]), r = Number(m[2]);
  return { q: q + r, r: -q };
}

function pendingOf(view: Record<string, unknown>): { kind: string; seat: string; payload: Record<string, unknown> } | null {
  const p = view['pending'];
  if (!isObj(p)) return null;
  return { kind: asStr(p['kind']), seat: asStr(p['seat']), payload: isObj(p['payload']) ? p['payload'] : {} };
}

// ---- moves -----------------------------------------------------------------

const typeOf = (m: LegalMove) => asStr(m.move['type']);
const find = (input: GlueInput, pred: (m: LegalMove) => boolean) => input.legalMoves.find(pred) ?? null;

/** The hex a step or walk-away move goes to. */
function targetOf(m: LegalMove): string | null {
  if (typeOf(m) === 'step') return asStr(m.move['to']) || null;
  if (typeOf(m) === 'move_away') {
    const path = asArr(m.move['path']);
    return path.length === 1 ? asStr(path[0]) || null : null;
  }
  return null;
}

interface PlacementSlot {
  slot: string; label: string; hexes: string[];
  rotations: Array<{ rotation: number; label: string; icons: Array<{ hex: string; kind: string }>; move: Record<string, unknown> }>;
}
function placementOf(view: Record<string, unknown>): { tileId: number; context: string; slots: PlacementSlot[] } | null {
  const po = view['placementOptions'];
  if (!isObj(po)) return null;
  return {
    tileId: asNum(po['tileId']), context: asStr(po['context']),
    slots: asArr(po['slots']).filter(isObj).map((s) => ({
      slot: asStr(s['slot']), label: asStr(s['label']), hexes: asArr(s['hexes']).map((h) => asStr(h)),
      rotations: asArr(s['rotations']).filter(isObj).map((r) => ({
        rotation: asNum(r['rotation']), label: asStr(r['label']),
        icons: asArr(r['icons']).filter(isObj).map((i) => ({ hex: asStr(i['hex']), kind: asStr(i['kind']) })),
        move: isObj(r['move']) ? r['move'] : {},
      })),
    })),
  };
}

/** The slot and turn being put together, if any (GlueInput.ui). */
function composing(input: GlueInput): { slot: string; rotation: number } | null {
  const ui = input.ui ?? {};
  const slot = asStr(ui['slot']);
  return slot ? { slot, rotation: ((asNum(ui['rotation']) % 6) + 6) % 6 } : null;
}

/** The listed move for a slot and turn, when the engine lists it. */
function placeMove(input: GlueInput, slot: string, rotation: number): LegalMove | null {
  return find(input, (m) => typeOf(m) === 'explore' && asStr(m.move['slot']) === slot && asNum(m.move['rotation'], -1) === rotation);
}

// ---- the map ---------------------------------------------------------------

function mapNodes(view: Record<string, unknown>, input: GlueInput, all: Player[]): MapNode[] {
  const map = isObj(view['map']) ? view['map'] : {};
  const tiles = asArr(map['tiles']).filter(isObj);
  const icons = asArr(map['icons']).filter(isObj);
  const tileOfHex = new Map<string, number>();
  for (const t of tiles) {
    const hexes = asArr(t['hexes']).map((h) => asStr(h));
    for (const h of hexes.length ? hexes : [asStr(t['center'])]) tileOfHex.set(h, asNum(t['tileId']));
  }
  const iconAt = new Map(icons.map((i) => [asStr(i['key']), i] as const));
  const colourOf = new Map(all.map((p) => [p.id, p.colour] as const));
  const nameOf = new Map(all.map((p) => [p.id, p.name] as const));
  const explored = new Map(tiles.filter((t) => t['exploredBy']).map((t) => [asStr(t['center']), asStr(t['exploredBy'])] as const));
  const newest = tiles.length > 0 ? asStr(tiles[tiles.length - 1]!['center']) : '';
  const prevTiles = isObj(input.previous) && isObj(input.previous['map']) ? asArr(input.previous['map']['tiles']).length : tiles.length;

  const nodes: MapNode[] = [];
  for (const key of asArr(map['hexes']).map((h) => asStr(h))) {
    const hex = hexOf(key);
    if (!hex) continue;
    const icon = iconAt.get(key);
    const tileId = tileOfHex.get(key) ?? 0;
    const pieces: NonNullable<MapNode['pieces']> = [];
    const done = icon && icon['completed'] === true;
    const by = done ? asStr(icon['completedBy']) : explored.get(key) ?? '';
    if (by) pieces.push({ label: `coin:${key}`, colorKey: colourKey(colourOf.get(by) ?? '') });
    for (const p of all.filter((pl) => pl.hex === key)) {
      pieces.push({ label: `standee:${p.id}`, artUrl: iconUrl(adventurerOf(all, p.id).toLowerCase(), { tint: tint(p.colour), wobble: false }) });
    }
    const kind = icon ? asStr(icon['kind']) : '';
    const name = ICON[kind]?.name ?? '';
    const where = icon ? asStr(icon['hexLabel']) : '';
    nodes.push({
      id: `ao:hex:${key}`,
      label: name ? `${name}${done ? `, done by ${nameOf.get(by) ?? by}` : ''}` : 'Empty hex',
      describedAs: [name || 'Empty hex', where, done ? `done by ${nameOf.get(by) ?? by}` : ''].filter(Boolean).join(', '),
      x: 0, y: 0, hex,
      colorKey: tileId ? `land${tileId}` : 'land1',
      artUrl: icon ? iconUrl(ICON[kind]?.art ?? kind, { wobble: false }) : undefined,
      dim: !!done,
      pieces,
      // A tile placed by the event on screen flies in from the stack.
      arriveFrom: tiles.length > prevTiles && tileOfHex.get(key) === tileOfHex.get(newest) ? 'ao:deck:tile' : undefined,
    });
  }

  // While a revealed tile waits: every slot it may go in, as ghost hexes; the
  // slot being turned shows the tile's icons where this turn puts them.
  const place = pendingOf(view)?.kind === 'explore_place' && pendingOf(view)?.seat === input.playerId ? placementOf(view) : null;
  if (place) {
    const pick = composing(input);
    const taken = new Set(nodes.map((n) => n.id));
    for (const s of place.slots) {
      const chosen = pick?.slot === s.slot;
      const turn = chosen ? s.rotations.find((r) => r.rotation === pick!.rotation) : undefined;
      for (const key of s.hexes) {
        const hex = hexOf(key);
        const id = `ao:slot:${s.slot}:${key}`;
        if (!hex || taken.has(id)) continue;
        const icon = turn?.icons.find((i) => i.hex === key);
        nodes.push({
          id, label: `Place Tile ${place.tileId} against ${s.label}`, x: 0, y: 0, hex,
          ghost: true, selected: chosen, colorKey: `land${place.tileId}`,
          artUrl: icon ? iconUrl(ICON[icon.kind]?.art ?? icon.kind, { wobble: false }) : undefined,
        });
      }
    }
  }
  return nodes;
}

// ---- the prompt --------------------------------------------------------------

function prompt(view: Record<string, unknown>, input: GlueInput, me: Player | undefined): PlanPrompt | undefined {
  const p = pendingOf(view);
  if (!p || p.seat !== input.playerId || !me) return undefined;
  const pay = p.payload;
  const actions: PromptAction[] = [];
  const add = (id: string, label: string, m: LegalMove | null, primary = false) => { if (m) actions.push({ id, label, move: m, primary }); };
  switch (p.kind) {
    case 'setup_standee_colour': {
      const moves = input.legalMoves.filter((m) => typeOf(m) === 'setup_standee');
      if (moves.length) actions.push({ id: 'setup', label: 'Choose', moves, primary: true });
      return { title: 'Pick your adventurer and colour', sub: 'Any adventurer can take any colour. Your coins are your colour.', actions };
    }
    case 'roll':
      if (pay['rollKind'] === 'turn_order') {
        return { title: 'Roll for turn order', sub: 'Everyone rolls 2 dice. Highest goes first; a tie rolls again.', actions };
      }
      return {
        title: `Beat ${asNum(pay['number'])}`,
        sub: `Roll ${asNum(pay['diceCount'])} ${asNum(pay['diceCount']) === 1 ? 'die' : 'dice'}, one for each point of your ${pay['test'] === 'recruit' ? 'Charisma' : 'Strength'}. Equal or higher wins.`,
        actions,
      };
    case 'draw': {
      const deck = asStr(pay['deck']);
      if (deck === 'tile') {
        return pay['context'] === 'forced'
          ? { title: 'Every icon is done: explore first', sub: 'Turn over the top tile, then place it in any empty slot touching the map. Then take your turn.', actions }
          : { title: 'Map card: explore anywhere', sub: 'Turn over the top tile and place it in any empty slot touching the map.', actions };
      }
      const titles: Record<string, string> = { companion: 'City · make a friend', little: 'Little Monster · fight!', big: 'Big Monster · fight!', dungeon: 'Dungeon' };
      const subs: Record<string, string> = {
        companion: 'Draw the top Companion card, then roll your Charisma in dice.',
        little: 'Draw the top Little Monster card, then roll your Strength in dice.',
        big: 'Draw the top Big Monster card, then roll your Strength in dice.',
        dungeon: 'Draw a Dungeon card and do what it says.',
      };
      return { title: pay['dungeon'] ? 'Dungeon · the card asks for a test' : titles[deck] ?? 'Draw', sub: subs[deck], actions };
    }
    case 'move': {
      add('explore', 'Explore · turn over a tile', find(input, (m) => typeOf(m) === 'explore' && m.move['slot'] === undefined));
      add('stop', 'End turn', find(input, (m) => typeOf(m) === 'stop'), true);
      return {
        title: `Your turn · ${me.stepsLeft} step${me.stepsLeft === 1 ? '' : 's'} left`,
        sub: 'Tap a glowing hex to step. An icon starts the moment you step on it, and ends your turn.',
        actions,
      };
    }
    case 'try_again': {
      add('stay', 'Stay and try again', find(input, (m) => typeOf(m) === 'try_again'), true);
      add('explore', 'Explore instead', find(input, (m) => typeOf(m) === 'explore' && m.move['slot'] === undefined));
      add('stop', 'Do nothing this turn', find(input, (m) => typeOf(m) === 'stop'));
      return { title: 'You failed here last turn', sub: 'Stay and try again with a fresh card, walk away (tap a glowing hex), or explore.', actions };
    }
    case 'explore_place': {
      const place = placementOf(view);
      const pick = composing(input);
      if (!pick) {
        return {
          title: `Place Tile ${place?.tileId ?? asNum(pay['tileId'])}`,
          sub: pay['context'] === 'ordinary' ? 'Tap a glowing slot next to you.' : 'Tap any glowing slot touching the map.',
          actions,
        };
      }
      actions.push({ id: 'left', label: 'Turn left', ui: { rotation: (pick.rotation + 1) % 6 } });
      actions.push({ id: 'right', label: 'Turn right', ui: { rotation: (pick.rotation + 5) % 6 } });
      add('place', 'Place tile', placeMove(input, pick.slot, pick.rotation), true);
      return { title: `Turn Tile ${place?.tileId ?? asNum(pay['tileId'])}, then place it`, sub: 'Turn it any of 6 ways, or tap another slot. Your coin goes on its centre.', actions };
    }
    case 'take_artifact': {
      for (const m of input.legalMoves) {
        if (typeOf(m) === 'take_artifact') {
          const a = asStr(m.move['artifact']);
          const from = asStr(m.move['from']);
          const holder = players(view).find((pl) => pl.id === from);
          actions.push({ id: `take:${a}:${from}`, label: `${ICON[a]?.name ?? a} · ${from === 'supply' ? 'supply' : `from ${holder?.name || from}`}`, move: m });
        }
      }
      add('decline', 'No thanks, draw again', find(input, (m) => typeOf(m) === 'decline_artifact'));
      return { title: 'Any rune', sub: 'Take one suit rune from the supply or another player, or say no and draw another Dungeon card.', actions };
    }
    default:
      return undefined;
  }
}

// ---- the plan ----------------------------------------------------------------

function plan(input: GlueInput): TablePlan | null {
  const { view } = input;
  if (!shapeHas(view, 'map', 'players', 'decks') || !isObj(view['map'])) return null;
  const all = players(view);
  if (all.length === 0) return null;
  const me = all.find((p) => p.id === input.playerId);
  const decks = isObj(view['decks']) ? view['decks'] : {};
  const pend = pendingOf(view);
  const quests = questNames(view);

  const board: Zone[] = [
    { kind: 'map', id: 'ao:map', data: { hex: { orientation: 'flat' }, fill: { minHeight: 240 }, nodes: mapNodes(view, input, all) } },
  ];
  for (const d of DECKS) {
    board.push({ kind: 'card-zone', id: `ao:deck:${d.key}`, span: 'row', data: { label: d.label, mode: 'pile', size: 'small', countOnly: asNum(decks[d.key]) } });
  }
  board.push({ kind: 'card-zone', id: 'ao:deck:tile', span: 'row', data: { label: 'Map tiles', mode: 'pile', size: 'small', countOnly: asNum(decks['tileStack']) } });

  // The card being tested and the Dungeon card it came from, flown from their decks.
  const drawn: CardData[] = [];
  const res = isObj(view['dungeonResolving']) ? view['dungeonResolving'] : null;
  if (res) drawn.push({ id: `ao:dungeon-card:${asStr(res['kind'])}`, label: DUNGEON_CARD[asStr(res['kind'])] ?? asStr(res['kind']), subtitle: 'Dungeon card', colorKey: 'dungeon', artUrl: iconUrl('dungeon', { wobble: false }) });
  if (pend?.kind === 'roll' && pend.payload['rollKind'] === 'test' && pend.payload['cardId']) drawn.push(cardFor(view, asStr(pend.payload['cardId'])));
  const drawnFrom = pend?.payload['test'] === 'recruit' ? 'ao:deck:companion' : pend?.payload['test'] === 'big' ? 'ao:deck:big' : pend?.payload['test'] === 'little' ? 'ao:deck:little' : 'ao:deck:dungeon';
  board.push({ kind: 'card-zone', id: 'ao:drawn', span: 'row', arriveFrom: drawnFrom, data: { label: 'Drawn', mode: 'row', cards: drawn, empty: drawn.length ? 0 : 1 } });


  // ---- seats ----
  const active = asStr(view['activeSeat']);
  const tableau = (p: Player): TableauData => ({
    label: `${p.id === input.playerId ? 'You' : p.name} · ${adventurerOf(all, p.id)}`,
    owner: colourKey(p.colour), active: p.id === active, activeLabel: p.id === input.playerId ? 'your turn' : undefined,
    artUrl: iconUrl(adventurerOf(all, p.id).toLowerCase(), { tint: tint(p.colour), wobble: false }),
    stats: [
      ...(p.stats ? [
        { label: 'Charisma', value: p.stats.charisma },
        { label: 'Strength', value: p.stats.strength },
        { label: 'Movement', value: p.stats.movement },
      ] : []),
      { label: 'Quest points', value: p.questPoints },
      ...(p.id === input.playerId ? [] : [
        { label: 'Companions', value: p.companions.length },
        { label: 'Monsters', value: `${p.little.length} little, ${p.big.length} big` },
        { label: 'Runes', value: p.artifacts.map((a) => ICON[a]?.name ?? a).join(', ') || 'none' },
      ]),
      { label: 'Tiles explored', value: p.exploredTiles.length },
      { label: 'Dungeons done', value: p.dungeonsCompleted },
    ],
  });
  const side: Zone[] = [];
  const bench: Zone[] = [];
  const order = [...all].sort((a, b) => (a.initiative || 99) - (b.initiative || 99));
  for (const p of order) {
    if (p.id === input.playerId) continue;
    side.push({ kind: 'tableau', id: `ao:seat:${p.id}`, data: tableau(p) });
  }
  // The runes still in the supply (the rest are on the seats' tableaux).
  const supply = asArr(view['artifactSupply']).map((x) => asStr(x));
  side.push({ kind: 'card-zone', id: 'ao:supply', data: { label: 'Rune supply', mode: 'row', size: 'small', cards: supply.map((a) => runeCard(a)), empty: supply.length ? 0 : 1 } });
  // The quests in play: who claimed each, or the counts for an end-of-game one.
  const inPlay = isObj(view['inPlayQuests']) ? view['inPlayQuests'] : {};
  const count: Record<string, (p: Player) => number> = {
    most_little_monsters: (p) => p.little.length, most_big_monsters: (p) => p.big.length, most_artifacts: (p) => p.artifacts.length,
  };
  side.push({
    kind: 'card-zone', id: 'ao:quests',
    data: {
      label: 'Quests in play', mode: 'list',
      cards: Object.entries(inPlay).map(([kind, who]) => {
        const q = quests[kind];
        const holder = all.find((p) => p.id === who);
        const counts = count[kind];
        return {
          id: `ao:quest:${kind}`, label: q?.name ?? kind, colorKey: 'quest', artUrl: iconUrl('quest', { wobble: false }),
          subtitle: holder ? `Claimed by ${holder.name || holder.id}` : q?.endGame ? 'End of game · a tie scores nothing' : 'First to do it',
          ...(counts ? { counts: all.map((p) => ({ label: p.name || p.id, value: counts(p), own: p.id === input.playerId })) } : {}),
        };
      }),
    },
  });

  if (me) {
    bench.push({ kind: 'tableau', id: `ao:seat:${me.id}`, data: tableau(me) });
    bench.push({ kind: 'card-zone', id: 'ao:mine:companions', arriveFrom: 'ao:drawn', data: { label: 'Companions', mode: 'row', cards: me.companions.map((c) => cardFor(view, c)), empty: me.companions.length ? 0 : 1 } });
    bench.push({ kind: 'card-zone', id: 'ao:mine:monsters', arriveFrom: 'ao:drawn', data: { label: 'Monsters beaten', mode: 'row', cards: [...me.little, ...me.big].map((c) => cardFor(view, c)), empty: me.little.length + me.big.length ? 0 : 1 } });
    bench.push({ kind: 'card-zone', id: 'ao:mine:runes', arriveFrom: 'ao:supply', data: { label: 'Runes', mode: 'row', size: 'small', cards: me.artifacts.map((a) => runeCard(a)), empty: me.artifacts.length ? 0 : 1 } });
  }

  // Quest points, one space per quest in play.
  const top = Object.keys(inPlay).length;
  const points: Zone = {
    kind: 'track', id: 'ao:points',
    data: {
      label: 'Quest points',
      spaces: Array.from({ length: top + 1 }, (_, i) => ({
        index: i, label: String(i),
        pieces: all.filter((p) => p.questPoints === i).map((p) => ({ label: `qp:${p.id}`, colorKey: colourKey(p.colour) })),
      })),
    },
  };

  const ending = asNum(view['endingPhase']);
  const status = `Round ${asNum(view['round'], 1)}${ending === 1 ? ' · the last tile is placed' : ending === 2 ? ' · the final round' : ''}`;
  return { board, bench, side, points, palette: PALETTE, title: 'Adventurer Olympics', status, prompt: prompt(view, input, me) };
}

// ---- the glue -------------------------------------------------------------------

export const adventurerOlympicsGlue: GlueModule = {
  gameId: GAME,
  title: 'Adventurer Olympics',

  plan,

  themeFor: () => 'ao-theme',

  litParts(input: GlueInput): string[] {
    const lit: string[] = [];
    for (const m of input.legalMoves) {
      const to = targetOf(m);
      if (to) lit.push(`ao:hex:${to}`);
    }
    const view = isObj(input.view) ? input.view : null;
    const place = view && pendingOf(view)?.kind === 'explore_place' ? placementOf(view) : null;
    if (place) for (const s of place.slots) for (const h of s.hexes) lit.push(`ao:slot:${s.slot}:${h}`);
    return [...new Set(lit)];
  },

  uiForSelect(sel: SelectEvent, input: GlueInput): Record<string, unknown> | null {
    const m = /^ao:slot:(.+):(-?\d+,-?\d+)$/.exec(sel.id);
    if (!m) return null;
    const slot = m[1]!;
    const view = isObj(input.view) ? input.view : null;
    const place = view ? placementOf(view) : null;
    if (!place?.slots.some((s) => s.slot === slot)) return null;
    // A new slot starts the tile the way it is printed; the player turns it.
    return composing(input)?.slot === slot ? null : { slot, rotation: 0 };
  },

  moveForSelect(sel: SelectEvent, input: GlueInput): LegalMove | null {
    const all = adventurerOlympicsGlue.movesForSelect!(sel, input);
    return all.length === 1 ? all[0]! : null;
  },

  movesForSelect(sel: SelectEvent, input: GlueInput): LegalMove[] {
    const hex = /^ao:hex:(-?\d+,-?\d+)$/.exec(sel.id);
    if (hex) return input.legalMoves.filter((m) => targetOf(m) === hex[1]);
    return [];
  },

  detailFor(sel: SelectEvent, input: GlueInput): { title: string; lines: string[] } | null {
    const view = isObj(input.view) ? input.view : null;
    if (!view) return null;
    const card = /^ao:card:(.+)$/.exec(sel.id);
    if (card) {
      const c = cardFor(view, card[1]!);
      return { title: c.label, lines: [c.subtitle ?? '', c.cost !== undefined ? `Number to beat: ${c.cost}` : ''].filter(Boolean) };
    }
    return null;
  },

  formFor(move: LegalMove, input: GlueInput): MoveForm | null {
    if (typeOf(move) !== 'setup_standee') return null;
    // The colours still free are the listed moves; the adventurer is the player's to name.
    const colours = input.legalMoves.filter((m) => typeOf(m) === 'setup_standee').map((m) => asStr(m.move['colour'])).filter(Boolean);
    const fields: FormField[] = [
      { kind: 'choice', key: 'standee', label: 'Your adventurer', options: ADVENTURERS.map((a) => ({ value: a, label: a })) },
      { kind: 'choice', key: 'colour', label: 'Your colour', options: colours.map((c) => ({ value: c, label: c })) },
    ];
    return {
      title: 'Pick your adventurer and colour',
      help: 'Any adventurer can take any colour. Your coins are your colour.',
      fields,
      template: move,
      editableKeys: ['standee', 'colour'],
      submitLabel: 'Take my seat',
      build(answers) {
        const standee = answerText(answers, 'standee');
        const colour = answerText(answers, 'colour');
        if (!standee || !colour) return null;
        return { ...move.move, standee, colour };
      },
    };
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => typeOf(m) === 'resolve_report') ?? null;
  },

  /**
   * Against the AI the host picks their adventurer and colour here; the AI
   * seats take colours nobody chose (the engine asks humans first). With a
   * friend at the table every person picks their own at the table.
   */
  setupFields(_reference: GameReferenceResponse, seats?: SetupSeat[]): SetupField[] {
    if (!seats || seats.some((s) => s.kind === 'human' && !s.host)) return [];
    return [
      { kind: 'choice', key: 'standee', label: 'Your adventurer', help: 'Fighter, Ranger, Wizard or Rogue. Only the picture differs.', options: ADVENTURERS.map((a) => ({ value: a, label: a })) },
      { kind: 'choice', key: 'colour', label: 'Your colour', help: 'Your coins and the base you stand on.', options: COLOURS.map((c) => ({ value: c, label: c })) },
    ];
  },

  setupMoves(answers: SetupAnswers): Array<Record<string, unknown>> {
    const standee = answers['standee'];
    const colour = answers['colour'];
    return typeof standee === 'string' && standee && typeof colour === 'string' && colour
      ? [{ type: 'setup_standee', standee, colour }]
      : [];
  },

  diceFor(event) {
    // An AI's roll carries its dice; the Roll button's dice are in the view.
    const m = event.engineMove;
    if (m && Array.isArray(m['dice'])) return m['dice'].map((d) => asNum(d)).filter((n) => n >= 1 && n <= 6);
    if (m && m['type'] === 'resolve_report' && /pressed Roll/.test(event.summary) && isObj(event.view)) {
      const last = event.view['lastRoll'];
      if (isObj(last) && Array.isArray(last['dice'])) return last['dice'].map((d) => asNum(d));
    }
    return null;
  },

  endStat(input: GlueInput) {
    if (!isObj(input.view)) return null;
    const all = players(input.view);
    return { label: 'Quest points', values: Object.fromEntries(all.map((p) => [p.id, String(p.questPoints)])) };
  },
};

export default adventurerOlympicsGlue;
