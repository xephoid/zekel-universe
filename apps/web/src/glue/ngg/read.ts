// Reads a Neither Guts nor Gears seat view into typed data, once, so no
// screen touches raw JSON. Everything here is what the engine sent; nothing
// is worked out. Two rules hold throughout:
//   - map pieces come from each player's own structured lists (units, heroes,
//     committed collectors), joined to the map by coord, never from the
//     "Name (owner)" strings on a tile;
//   - no prose is parsed, with one stated exception: an older engine's
//     `active_action` sentence (see activeActionOf).

import { asArr, asBool, asNum, asStr, isObj } from '../types';

export type Species = 'wizard' | 'robot';
export type CardKind = 'build' | 'research' | 'move_battle';

export interface NggPiece {
  kind: 'unit' | 'hero' | 'collector';
  owner: string;
  /** the printed name: "Dragon", "Archmage Elara", or a collector id */
  name: string;
  /** the engine's id for the piece, when it publishes one */
  id: string | null;
  leader: boolean;
  /** robot units: whether a Core powers it */
  core: 'allocated' | 'CORELESS' | null;
  /** collectors: the resource it collects */
  resource: string | null;
  /** heroes: the printed stat line */
  stats: string | null;
}

export interface NggTile {
  coord: string;
  c: number;
  r: number;
  label: string;
  printedResource: string | null;
  resource: string | null;
  start: number | null;
  baseOwner: string | null;
  pieces: NggPiece[];
}

export interface NggPlayer {
  id: string;
  kind: string;
  faction: string | null;
  species: Species | null;
  culture: number;
  nextMilestones: number[];
  manaCurrent: number;
  manaMax: number;
  buildings: string[];
  buildingCounts: Record<string, number>;
  research: string[];
  tech: { acquiredTypes: string[]; bonusLive: number; total: number; target: number | null };
  leaderKills: number;
  militaryKillsNeeded: number;
  leaderAlive: boolean;
  subjects: number;
  coresReserve: number;
  coresSupply: number;
  actionCards: Record<string, number>;
  actionCardsPlayed: string[];
  handCount: number;
  spyRecruitments: number;
  units: Array<{ id: string; type: string; coord: string; core: 'allocated' | 'CORELESS' | null }>;
  heroes: Array<{ name: string; coord: string | null; leader: boolean; dead: boolean; stats: string | null }>;
  bases: string[];
  collectors: Array<{ id: string; coord: string; resource: string | null }>;
}

export interface NggOption {
  id: string;
  label: string;
  move: Record<string, unknown> | null;
  blockedReason: string | null;
  section: string | null;
  detail: Record<string, unknown>;
}

export interface NggPending {
  kind: string;
  for: string;
  question: string;
  /** absent when the engine publishes no bounded option set */
  options: NggOption[] | null;
  repeatable: boolean;
  context: Record<string, unknown>;
}

export interface NggBattleUnit {
  label: string;
  /** the id battle moves name this unit by; null from an engine that does not publish it */
  ref: string | null;
  owner: string;
  side: string;
  init: number;
  dmg: number;
  def: number;
  activated: boolean;
}

export type NggCommitments =
  | { revealed: false; bySeat: Record<string, 'pending' | 'committed'> }
  | { revealed: true; cards: Array<{ card: string; by: string; resolved: boolean; countered: boolean }> };

export interface NggBattle {
  coord: string;
  origin: string | null;
  phase: string;
  pass: number;
  units: NggBattleUnit[];
  commitments: NggCommitments;
}

export interface NggStackEntry { position: number; owner: string; cardKind: string | null }

export interface NggTreaty { name: string; partners: [string, string]; cultureIncome: number }

export interface NggCard { card: string; effect: string }

export interface NggView {
  phase: string;
  round: number;
  activePlayerId: string | null;
  firstPlayerId: string | null;
  layout: string;
  tiles: NggTile[];
  players: NggPlayer[];
  stack: NggStackEntry[];
  activeAction: { cardKind: CardKind; owner: string } | null;
  treaties: NggTreaty[];
  battle: NggBattle | null;
  deckCount: number;
  discard: string[];
  pending: NggPending | null;
  victory: Record<string, { culture: number; tech: number; leaderKills: number; leaderAlive: boolean }>;
  result: unknown;
  heroPoolCount: number;
  /** the seat's own private keys; empty for a watcher */
  hand: NggCard[];
  sharedHands: Record<string, NggCard[]>;
  spies: Array<{ source: string; hero: string; active: boolean }>;
  knowledge: unknown[];
  reservedHeroes: string[];
}

const CARD_KINDS: CardKind[] = ['build', 'research', 'move_battle'];

/**
 * The resolving action card. The engine publishes it structured as
 * `resolving_action: { card_kind, owner }`; an engine from before that field
 * sends only the sentence "build by p2", and this is the one place that
 * sentence is read.
 */
export function activeActionOf(raw: unknown): { cardKind: CardKind; owner: string } | null {
  if (isObj(raw)) {
    const kind = asStr(raw['card_kind']);
    const owner = asStr(raw['owner']);
    return CARD_KINDS.includes(kind as CardKind) && owner ? { cardKind: kind as CardKind, owner } : null;
  }
  if (typeof raw !== 'string') return null;
  const m = /^(build|research|move_battle) by (\S+)$/.exec(raw);
  return m ? { cardKind: m[1] as CardKind, owner: m[2]! } : null;
}

function coordParts(coord: string): { c: number; r: number } {
  const [c, r] = coord.split(',').map((v) => parseInt(v, 10));
  return { c: Number.isFinite(c) ? c! : 0, r: Number.isFinite(r) ? r! : 0 };
}

function strOrNull(x: unknown): string | null {
  return typeof x === 'string' && x !== '' ? x : null;
}

function readPlayer(p: Record<string, unknown>): NggPlayer {
  const tech = isObj(p['tech_progress']) ? p['tech_progress'] : {};
  const species = asStr(p['species']);
  return {
    id: asStr(p['player_id']),
    kind: asStr(p['kind']),
    faction: strOrNull(p['faction']),
    species: species === 'wizard' || species === 'robot' ? species : null,
    culture: asNum(p['culture']),
    nextMilestones: asArr(p['next_milestones']).map((m) => asNum(m)),
    manaCurrent: asNum(p['mana_current']),
    manaMax: asNum(p['mana_max']),
    buildings: asArr(p['buildings']).map((b) => asStr(b)),
    buildingCounts: isObj(p['building_counts'])
      ? Object.fromEntries(Object.entries(p['building_counts']).map(([k, v]) => [k, asNum(v)]))
      : {},
    research: asArr(p['research']).map((r) => asStr(r)),
    tech: {
      acquiredTypes: asArr(tech['acquired_types']).map((t) => asStr(t)),
      bonusLive: asNum(tech['bonus_points_live']),
      total: asNum(tech['total']),
      target: typeof tech['target'] === 'number' ? tech['target'] : null,
    },
    leaderKills: asNum(p['leader_kills']),
    militaryKillsNeeded: asNum(p['military_kills_needed']),
    leaderAlive: asBool(p['leader_alive']),
    subjects: asNum(p['subjects']),
    coresReserve: asNum(p['cores_reserve']),
    coresSupply: asNum(p['cores_supply']),
    actionCards: isObj(p['action_cards'])
      ? Object.fromEntries(Object.entries(p['action_cards']).map(([k, v]) => [k, asNum(v)]))
      : {},
    actionCardsPlayed: asArr(p['action_cards_played_this_round']).map((c) => asStr(c)),
    handCount: asNum(p['battle_hand_count']),
    spyRecruitments: asNum(p['spy_recruitments']),
    units: asArr(p['units']).filter(isObj).map((u) => ({
      id: asStr(u['id']),
      type: asStr(u['type']),
      coord: asStr(u['coord']),
      core: u['core'] === 'allocated' || u['core'] === 'CORELESS' ? u['core'] : null,
    })),
    heroes: asArr(p['heroes']).filter(isObj).map((h) => ({
      name: asStr(h['hero']),
      // A reserved hero is owned but not on the board yet.
      coord: typeof h['coord'] === 'string' && h['coord'] !== 'reserved' ? h['coord'] : null,
      leader: asBool(h['is_leader']),
      dead: asBool(h['dead']),
      stats: strOrNull(h['stats']),
    })),
    bases: asArr(p['bases']).map((b) => asStr(b)),
    collectors: asArr(p['committed_collectors']).filter(isObj).map((c) => ({
      id: asStr(c['collector']),
      coord: asStr(c['coord']),
      resource: strOrNull(c['resource']),
    })),
  };
}

function readOption(o: Record<string, unknown>): NggOption {
  return {
    id: asStr(o['option_id']),
    label: asStr(o['label']),
    move: isObj(o['move']) ? o['move'] : null,
    blockedReason: strOrNull(o['blocked_reason']),
    section: strOrNull(o['rules_section']),
    detail: isObj(o['detail']) ? o['detail'] : {},
  };
}

function readPending(p: unknown): NggPending | null {
  if (!isObj(p)) return null;
  return {
    kind: asStr(p['kind']),
    for: asStr(p['for']),
    question: asStr(p['question']),
    options: Array.isArray(p['options']) ? p['options'].filter(isObj).map(readOption) : null,
    repeatable: asBool(p['repeatable']),
    context: isObj(p['context']) ? p['context'] : {},
  };
}

function readBattle(b: unknown): NggBattle | null {
  if (!isObj(b)) return null;
  const raw = b['commitments'];
  const commitments: NggCommitments = Array.isArray(raw)
    ? {
        revealed: true,
        cards: raw.filter(isObj).map((c) => ({
          card: asStr(c['card']), by: asStr(c['by']), resolved: asBool(c['resolved']), countered: asBool(c['countered']),
        })),
      }
    : {
        revealed: false,
        bySeat: isObj(raw)
          ? Object.fromEntries(Object.entries(raw).map(([pid, v]) => [pid, v === 'pending' ? 'pending' : 'committed'] as const))
          : {},
      };
  return {
    coord: asStr(b['coord']),
    origin: strOrNull(b['origin']),
    phase: asStr(b['phase']),
    pass: asNum(b['pass']),
    units: asArr(b['units']).filter(isObj).map((u) => ({
      label: asStr(u['unit']),
      ref: strOrNull(u['ref']),
      owner: asStr(u['owner']),
      side: asStr(u['side']),
      init: asNum(u['init']),
      dmg: asNum(u['dmg']),
      def: asNum(u['def']),
      activated: asBool(u['activated']),
    })),
    commitments,
  };
}

function readCards(x: unknown): NggCard[] {
  return asArr(x).filter(isObj).map((c) => ({ card: asStr(c['card']), effect: asStr(c['effect']) }));
}

/** The seat view as typed data, or null when it is not an NGnG view. */
export function readView(view: unknown): NggView | null {
  if (!isObj(view) || view['game_id'] !== 'neither-guts-nor-gears') return null;
  const players = asArr(view['players']).filter(isObj).map(readPlayer);
  const map = isObj(view['map']) ? view['map'] : {};

  // Every piece, by coord, from the owners' own lists.
  const byCoord = new Map<string, NggPiece[]>();
  const put = (coord: string | null, piece: NggPiece) => {
    if (!coord) return;
    const list = byCoord.get(coord) ?? [];
    list.push(piece);
    byCoord.set(coord, list);
  };
  for (const p of players) {
    for (const h of p.heroes) {
      if (h.dead) continue;
      put(h.coord, { kind: 'hero', owner: p.id, name: h.name, id: null, leader: h.leader, core: null, resource: null, stats: h.stats });
    }
    for (const u of p.units) {
      put(u.coord, { kind: 'unit', owner: p.id, name: u.type, id: u.id, leader: false, core: u.core, resource: null, stats: null });
    }
    for (const c of p.collectors) {
      put(c.coord, { kind: 'collector', owner: p.id, name: c.id, id: c.id, leader: false, core: null, resource: c.resource, stats: null });
    }
  }

  const tiles: NggTile[] = asArr(map['tiles']).filter(isObj).map((t) => {
    const coord = asStr(t['coord']);
    const { c, r } = coordParts(coord);
    return {
      coord, c, r,
      label: asStr(t['label']),
      printedResource: strOrNull(t['printed_resource']),
      resource: strOrNull(t['current_resource']),
      start: typeof t['start'] === 'number' ? t['start'] : null,
      baseOwner: strOrNull(t['base_owner']),
      pieces: byCoord.get(coord) ?? [],
    };
  });

  const victory: NggView['victory'] = {};
  if (isObj(view['victory_status'])) {
    for (const [pid, v] of Object.entries(view['victory_status'])) {
      if (!isObj(v)) continue;
      victory[pid] = { culture: asNum(v['culture']), tech: asNum(v['tech']), leaderKills: asNum(v['leader_kills']), leaderAlive: asBool(v['leader_alive']) };
    }
  }

  return {
    phase: asStr(view['phase']),
    round: asNum(view['round']),
    activePlayerId: strOrNull(view['active_player_id']),
    firstPlayerId: strOrNull(view['first_player_id']),
    layout: asStr(view['layout']),
    tiles,
    players,
    stack: asArr(view['action_stack']).filter(isObj).map((a) => ({
      position: asNum(a['position']),
      owner: asStr(a['owner']),
      cardKind: strOrNull(a['card_kind']),
    })),
    activeAction: activeActionOf(view['resolving_action'] ?? view['active_action']),
    treaties: asArr(view['treaties']).filter(isObj).map((t) => {
      const partners = asArr(t['partners']).map((x) => asStr(x));
      return { name: asStr(t['treaty']), partners: [partners[0] ?? '', partners[1] ?? ''] as [string, string], cultureIncome: asNum(t['culture_income']) };
    }),
    battle: readBattle(view['battle']),
    deckCount: asNum(view['battle_deck_count']),
    discard: asArr(view['battle_discard']).map((c) => asStr(c)),
    pending: readPending(view['pending']),
    victory,
    result: view['result'] ?? null,
    heroPoolCount: asNum(view['hero_pool_count']),
    hand: readCards(view['your_battle_hand']),
    sharedHands: isObj(view['shared_tactics_hands'])
      ? Object.fromEntries(Object.entries(view['shared_tactics_hands']).map(([pid, cards]) => [pid, readCards(cards)]))
      : {},
    spies: asArr(view['your_spy_assignments']).filter(isObj).map((s) => ({ source: asStr(s['source']), hero: asStr(s['hero']), active: asBool(s['active']) })),
    knowledge: asArr(view['your_knowledge']),
    reservedHeroes: asArr(view['your_reserved_heroes']).map((h) => asStr(h)),
  };
}

export function playerOf(v: NggView, id: string | null): NggPlayer | null {
  return id ? v.players.find((p) => p.id === id) ?? null : null;
}

export function tileAt(v: NggView, coord: string | null): NggTile | null {
  return coord ? v.tiles.find((t) => t.coord === coord) ?? null : null;
}

/** "D4" for an engine coord; the coord itself only if the map lacks it. */
export function labelOf(v: NggView, coord: string | null): string {
  return tileAt(v, coord)?.label ?? coord ?? '';
}

/** The move's `type`, for filtering legal moves. */
export function moveType(move: Record<string, unknown>): string {
  return asStr(move['type']);
}
