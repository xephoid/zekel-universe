// Sweetlands Imperium glue: the 80-space ring board with four junction
// roads, per-seat tableaux, the Intel deck and discard piles, the points
// track and the token pool. View shape per the engine (zekel
// src/games/sweetlands-imperium/views.ts): shared fields plus your_hand,
// your_secret_objectives and your_turn_step for the owning seat; players is
// an ARRAY. Board geometry comes from docs/games/sweetlands-imperium.md
// (sweetlands-board.ts); points to win comes from the engine's reference
// data when it publishes one.

import type { CardData, MapNode, TableauData } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import type { GlueModule, GlueInput, LegalMove, SelectEvent, SetupField, TablePlan, Zone } from './types';
import { asArr, asNum, asStr, isObj, shapeHas, words } from './types';
import { SPACES, REGION_FACTION, SPACE_COLORS, TREATS, BOARD } from './sweetlands-board';

const PALETTE: Record<string, string> = {
  ...SPACE_COLORS,
  milkshake: REGION_FACTION[1]!.color,
  fudge: REGION_FACTION[2]!.color,
  jellybean: REGION_FACTION[3]!.color,
  cheesecake: REGION_FACTION[4]!.color,
  nomads: '#2c2c2c',
  castle: '#f0d9b5',
  treat: '#f7c8d8',
  sugar: '#ffffff',
  influence: '#9013fe',
};

interface UnitLocation {
  zone: 'offboard' | 'start' | 'ring' | 'road' | 'castle' | 'treat';
  region?: number;
  ringIndex?: number;
  roadIndex?: number;
  slotKind?: 'regional' | 'random';
}

function locToSpaceId(loc: unknown): string | null {
  if (!isObj(loc)) return null;
  const l = loc as unknown as UnitLocation;
  if (l.zone === 'ring' && typeof l.ringIndex === 'number' && typeof l.region === 'number') return `r${l.region}-ring-${l.ringIndex}`;
  if (l.zone === 'road' && typeof l.roadIndex === 'number' && typeof l.region === 'number') return `r${l.region}-road-${l.roadIndex}`;
  if (l.zone === 'castle') return 'castle';
  if (l.zone === 'start' && typeof l.region === 'number') return `r${l.region}-start`;
  if (l.zone === 'treat' && typeof l.region === 'number') return `r${l.region}-treat-${l.slotKind ?? 'regional'}`;
  return null;
}

function factionColorKey(faction: unknown): string {
  const f = asStr(faction).toLowerCase();
  for (const k of ['milkshake', 'fudge', 'jellybean', 'cheesecake']) if (f.includes(k)) return k;
  return 'nomads';
}

function intelCard(c: unknown, fallbackId: string): CardData {
  if (!isObj(c)) return { id: fallbackId, label: 'card' };
  const id = asStr(c['card_id'], fallbackId);
  const kind = asStr(c['kind']);
  const color = asStr(c['color']);
  const treat = asStr(c['treat']);
  if (kind === 'treat') {
    const art = treat.toLowerCase().replace(/\s+/g, '-');
    return { id: `sl:card:${id}`, label: treat || 'Treat', subtitle: 'Treat', artUrl: `/art/sweetlands/treat-${art}-1.png`, colorKey: 'treat' };
  }
  return {
    id: `sl:card:${id}`,
    label: kind === 'double' ? `${words(color)} ×2` : words(color),
    subtitle: `${words(kind)} Intel`,
    colorKey: color || undefined,
  };
}

function pointsToWin(reference: GameReferenceResponse | null): number | undefined {
  const rd = reference?.referenceData;
  return isObj(rd) && typeof rd['points_to_win'] === 'number' ? rd['points_to_win'] : undefined;
}

const pct = (col: number, row: number) => ({
  x: (col / (BOARD.cols - 1)) * 92 + 4,
  y: ((row - 1) / (BOARD.rows - 1)) * 88 + 6,
});

export const sweetlandsGlue: GlueModule = {
  gameId: 'sweetlands-imperium',
  title: 'Sweetlands Imperium',

  plan(input: GlueInput): TablePlan | null {
    const { view } = input;
    if (!shapeHas(view, 'players', 'phase')) return null;
    if (asStr(view['game_id'], 'sweetlands-imperium') !== 'sweetlands-imperium' && !('taxes' in view)) return null;
    const players = asArr(view['players']);
    if (players.length === 0) return null;
    const me = input.playerId;
    const toWin = pointsToWin(input.reference);

    // --- the 80-region map; units as pieces on nodes ------------------------
    const pieces = new Map<string, MapNode['pieces']>();
    for (const p of players) {
      if (!isObj(p)) continue;
      const ck = factionColorKey(p['faction']);
      const locs = isObj(p['unit_locations']) ? p['unit_locations'] : {};
      for (const [unit, loc] of Object.entries(locs)) {
        const sid = locToSpaceId(loc);
        if (!sid) continue;
        const list = pieces.get(sid) ?? [];
        list!.push({ label: `${ck}:${unit}`, colorKey: ck });
        pieces.set(sid, list);
      }
    }
    const castleOcc = asStr(view['castle_occupant_id']);
    const placement = isObj(view['random_treat_placement']) ? view['random_treat_placement'] : {};

    const nodes: MapNode[] = SPACES.map((s) => {
      const node: MapNode = {
        id: s.id,
        label: s.zone === 'ring' ? '' : s.zone === 'road' ? '' : words(REGION_FACTION[s.region]!.colorKey),
        ...pct(s.col, s.row),
        colorKey: s.color ?? REGION_FACTION[s.region]!.colorKey,
        size: s.zone === 'treat' ? 1.1 : 0.7,
        pieces: pieces.get(s.id) ?? [],
        roadsTo: s.zone === 'ring' && s.index === 5 ? [`r${s.region}-road-0`] : s.zone === 'road' && s.index < 5 ? [`r${s.region}-road-${s.index + 1}`] : [],
      };
      if (s.zone === 'treat' && s.index === 1) {
        node.label = asStr(placement[String(s.region)], '?');
        node.colorKey = 'treat';
      }
      return node;
    });
    nodes.push({
      id: 'castle', label: 'Candy Castle', x: 50, y: 53, colorKey: 'castle', size: 1.6,
      pieces: castleOcc ? [{ label: castleOcc, colorKey: factionColorKey(players.find((p) => isObj(p) && p['player_id'] === castleOcc && p['faction'])) }] : [],
      roadsTo: ['r1-road-5', 'r2-road-5', 'r3-road-5', 'r4-road-5'],
    });
    for (const r of [1, 2, 3, 4] as const) {
      nodes.push({
        id: `r${r}-start`,
        label: `${words(REGION_FACTION[r]!.colorKey)} start`,
        ...pct(TREATS[r]!.start[1]!, TREATS[r]!.start[0]!),
        colorKey: REGION_FACTION[r]!.colorKey,
        pieces: pieces.get(`r${r}-start`) ?? [],
      });
    }

    const board: Zone[] = [
      { kind: 'map', id: 'sl:map', data: { label: 'Sweetlands', aspect: 80, nodes } },
      { kind: 'card-zone', id: 'sl:intel-deck', data: { label: 'Intel deck', mode: 'pile', countOnly: asNum(view['intel_deck_count']) } },
      { kind: 'card-zone', id: 'sl:intel-discard', arriveFrom: 'sl:intel-deck', data: { label: 'Intel discard', mode: 'pile', countOnly: asNum(view['intel_discard_count']) } },
    ];

    // --- per-seat tableaux; this seat's hand in the bench -------------------
    const side: Zone[] = [];
    const bench: Zone[] = [];
    const activePid = asStr(view['active_player_id']);
    const pointsSpaces: Array<{ index: number; pieces: { label: string; colorKey?: string }[] }> = [];
    const maxPoints = Math.max(toWin ?? 0, ...players.map((p) => (isObj(p) ? asNum(p['points']) : 0)));
    for (let i = 0; i <= maxPoints; i++) pointsSpaces.push({ index: i, pieces: [] });
    for (const p of players) {
      if (!isObj(p)) continue;
      const pid = asStr(p['player_id']);
      const ck = factionColorKey(p['faction']);
      const units = isObj(p['units']) ? p['units'] : {};
      const stats: NonNullable<TableauData['stats']> = [
        { label: 'Points', value: asNum(p['points']), max: toWin },
        { label: 'Influence', value: asNum(p['influence']) },
        { label: 'Sugar cubes', value: asNum(p['sugar_cubes']) },
        { label: 'Intel tokens', value: asArr(p['intel_tokens']).map((x) => words(asStr(x))).join(', ') || 'none' },
        { label: 'Hand', value: asNum(p['hand_count']) },
        ...Object.entries(units).map(([u, where]) => ({ label: words(u), value: asStr(where, 'off-board') })),
      ];
      const tableau: Zone = {
        kind: 'tableau', id: `sl:p:${pid}`,
        data: { label: `${asStr(p['faction_name'], words(ck))}${pid === me ? ' (you)' : ''}`, owner: ck, active: pid === activePid, stats },
      };
      pointsSpaces[asNum(p['points'])]?.pieces.push({ label: ck, colorKey: ck });
      if (pid === me) bench.push(tableau); else side.push(tableau);
    }
    const tokens: Zone = {
      kind: 'pool', id: 'sl:tokens',
      data: {
        label: 'Your tokens',
        items: (() => {
          const mine = players.find((p) => isObj(p) && p['player_id'] === me);
          if (!isObj(mine)) return [];
          return [
            { label: 'sugar', count: asNum(mine['sugar_cubes']), colorKey: 'sugar' },
            { label: 'influence', count: asNum(mine['influence']), colorKey: 'influence' },
          ];
        })(),
      },
    };
    if (me) bench.push(tokens);
    if (Array.isArray(view['your_hand'])) {
      bench.push({
        kind: 'card-zone', id: 'sl:hand', arriveFrom: 'sl:intel-deck',
        data: { label: 'Your Intel', mode: 'fan', cards: (view['your_hand'] as unknown[]).map((c, i) => intelCard(c, `sl:hand:${i}`)) },
      });
    }
    const points: Zone = { kind: 'track', id: 'sl:points', data: { label: 'Points', spaces: pointsSpaces } };
    const status = `Round ${asNum(view['round'], 1)} · ${words(asStr(view['phase']))}${asStr(view['your_turn_step']) ? ` · ${words(asStr(view['your_turn_step']))}` : ''}`;
    return { board, bench, side, points, palette: PALETTE, title: 'Sweetlands Imperium', status };
  },

  litParts(input: GlueInput): string[] {
    const lit: string[] = [];
    const hand = shapeHas(input.view, 'your_hand') ? asArr(input.view['your_hand']) : [];
    for (const m of input.legalMoves) {
      const t = asStr(m.move['type']);
      if (t === 'play_intel' && typeof m.move['hand_index'] === 'number') {
        const c = hand[m.move['hand_index']];
        lit.push(isObj(c) ? `sl:card:${asStr(c['card_id'], `sl:hand:${m.move['hand_index']}`)}` : `sl:hand:${m.move['hand_index']}`);
      }
      const dest = m.move['destination'];
      const sid = locToSpaceId(dest);
      if (sid) lit.push(sid);
    }
    return [...new Set(lit)];
  },

  moveForSelect(sel: SelectEvent, input: GlueInput): LegalMove | null {
    const hand = shapeHas(input.view, 'your_hand') ? asArr(input.view['your_hand']) : [];
    const idx = hand.findIndex((c, i) => (isObj(c) ? `sl:card:${asStr(c['card_id'], `sl:hand:${i}`)}` : `sl:hand:${i}`) === sel.id);
    if (idx >= 0) {
      return input.legalMoves.find((m) => m.move['type'] === 'play_intel' && m.move['hand_index'] === idx) ?? null;
    }
    return input.legalMoves.find((m) => locToSpaceId(m.move['destination']) === sel.id) ?? null;
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },

  setupFields(_reference: GameReferenceResponse): SetupField[] {
    // Faction picks are checklist steps the engine offers as legal moves.
    return [];
  },

  diceFor(event) {
    const found = /rolled?\s+(?:a\s+)?(\d)/i.exec(event.summary);
    return found ? [Number(found[1])] : null;
  },
};

export default sweetlandsGlue;
