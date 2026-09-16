// Sweetlands Imperium glue — the 80-space ring board with four junction
// roads, per-seat tableaux, Intel deck/discard piles, the points track and
// the token pool (sugar cubes + influence). View shape per the engine's
// views.ts: shared fields plus your_hand/your_secret_objectives/your_turn_step
// for the owning seat; units as the UnitLocation union under unit_locations.

import type { CardData, MapRegionData, TablePlan, Zone } from './zoneData';
import type { GlueModule, GlueInput } from './types';
import { asArr, asNum, asStr, isObj, shapeHas } from './types';
import type { LegalMove, SelectEvent } from './primitiveTree';
import { SPACES, REGION_FACTION, SPACE_COLORS, TREATS, BOARD } from './sweetlands-board';

const PALETTE: Record<string, string> = {
  ...SPACE_COLORS,
  milkshake: REGION_FACTION[1]!.color,
  fudge: REGION_FACTION[2]!.color,
  jellybean: REGION_FACTION[3]!.color,
  cheesecake: REGION_FACTION[4]!.color,
  nomads: '#2c2c2c',
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
  if (l.zone === 'ring' && typeof l.ringIndex === 'number' && typeof l.region === 'number') {
    return `r${l.region}-ring-${l.ringIndex}`;
  }
  if (l.zone === 'road' && typeof l.roadIndex === 'number' && typeof l.region === 'number') {
    return `r${l.region}-road-${l.roadIndex}`;
  }
  if (l.zone === 'castle') return 'castle';
  if (l.zone === 'start' && typeof l.region === 'number') return `r${l.region}-start`;
  if (l.zone === 'treat' && typeof l.region === 'number') return `r${l.region}-treat-${l.slotKind ?? '?'}`;
  return null;
}

function factionColorKey(faction: unknown): string {
  const f = asStr(faction).toLowerCase();
  if (f.includes('milkshake')) return 'milkshake';
  if (f.includes('fudge')) return 'fudge';
  if (f.includes('jellybean')) return 'jellybean';
  if (f.includes('cheesecake')) return 'cheesecake';
  return 'nomads';
}

function intelCard(c: unknown, uniqueKey: string): CardData {
  if (!isObj(c)) return { id: uniqueKey, title: 'card' };
  const kind = asStr(c['kind']);
  const color = asStr(c['color']);
  const treat = asStr(c['treat']);
  if (kind === 'treat') {
    const art = treat.toLowerCase().replace(/\s+/g, '-');
    return { id: uniqueKey, title: treat || 'Treat', subtitle: 'Treat card', artUrl: `/art/sweetlands/treat-${art}-1.png`, colorKey: color || undefined };
  }
  return {
    id: uniqueKey,
    title: kind === 'double' ? `${color} ×2` : color,
    subtitle: `${kind} Intel`,
    colorKey: color || undefined,
  };
}

export const sweetlandsGlue: GlueModule = {
  gameId: 'sweetlands-imperium',

  plan(input: GlueInput): TablePlan | null {
    const { view } = input;
    if (!shapeHas(view, 'players', 'phase')) return null;
    if (asStr(view['game_id'], 'sweetlands-imperium') !== 'sweetlands-imperium' && !('taxes' in view)) return null;
    const players = asArr(view['players']);
    if (players.length === 0) return null;

    // --- the 80-region map; occupants stacked by unit location -------------
    const occupants = new Map<string, string[]>();
    for (const p of players) {
      if (!isObj(p)) continue;
      const ck = factionColorKey(p['faction']);
      const locs = isObj(p['unit_locations']) ? p['unit_locations'] : {};
      for (const [unit, loc] of Object.entries(locs)) {
        const sid = locToSpaceId(loc);
        if (!sid) continue;
        const list = occupants.get(sid) ?? [];
        list.push(`${ck}:${unit}`);
        occupants.set(sid, list);
      }
    }
    const castleOcc = asStr(view['castle_occupant_id']);
    if (castleOcc) {
      const list = occupants.get('castle') ?? [];
      list.push(castleOcc);
      occupants.set('castle', list);
    }

    const placement = isObj(view['random_treat_placement']) ? view['random_treat_placement'] : {};
    const regions: MapRegionData[] = SPACES.map((s) => {
      const base: MapRegionData = {
        id: s.id,
        label: s.zone === 'ring' ? '◎' : s.zone === 'road' ? '➜' : '★',
        x: (s.col / (BOARD.cols - 1)) * 92 + 4,
        y: ((s.row - 1) / (BOARD.rows - 1)) * 88 + 6,
        colorKey: s.color ?? REGION_FACTION[s.region]!.colorKey,
        occupant: occupants.get(s.id)?.join(', ') || undefined,
        // Junction roads drawn as links: junction ring space -> road 0.
        roadsTo: s.zone === 'ring' && s.index === 5 ? [`r${s.region}-road-0`] : [],
      };
      if (s.zone === 'treat' && s.index === 0) {
        base.label = REGION_FACTION[s.region]!.name.split(' ').at(-1) ?? 'treat';
      } else if (s.zone === 'treat') {
        const randTreat = asStr(placement[String(s.region)], '?');
        base.label = randTreat === '?' ? '?' : randTreat;
        base.colorKey = undefined;
      }
      return base;
    });

    // Castle as one big region in the middle.
    regions.push({
      id: 'castle', label: '🏰 Candy Castle',
      x: 50, y: 53, colorKey: 'nomads',
      occupant: occupants.get('castle')?.join(', ') || undefined,
      roadsTo: ['r1-road-5', 'r2-road-5', 'r3-road-5', 'r4-road-5'],
    });

    // Start tiles as anchor regions.
    for (const r of [1, 2, 3, 4] as const) {
      regions.push({
        id: `r${r}-start`,
        label: REGION_FACTION[r]!.name.split(' ').at(-1) ?? 'start',
        x: (TREATS[r]!.start[1]! / (BOARD.cols - 1)) * 92 + 4,
        y: ((TREATS[r]!.start[0]! - 1) / (BOARD.rows - 1)) * 88 + 6,
        colorKey: REGION_FACTION[r]!.colorKey,
        occupant: occupants.get(`r${r}-start`)?.join(', ') || undefined,
      });
    }

    const board: Zone[] = [
      { kind: 'map', label: 'Sweetlands Imperium', data: { id: 'sl:map', regions } },
      {
        kind: 'card-zone', label: 'Intel deck / discard',
        data: {
          id: 'sl:intel-piles', kind: 'row',
          cards: [
            { id: 'sl:intel-deck', title: 'Intel deck', count: asNum(view['intel_deck_count']), faceDown: true },
            { id: 'sl:intel-discard', title: 'Discard', count: asNum(view['intel_discard_count']) },
          ],
        },
      },
    ];

    // --- per-seat tableaux + this seat's hand in the bench -----------------
    const mePid = shapeHas(view, 'your_hand') && isObj(view) ? findMe(view, players) : null;
    const side: Zone[] = [];
    const bench: Zone[] = [];
    for (const p of players) {
      if (!isObj(p)) continue;
      const ck = factionColorKey(p['faction']);
      const tableau: Zone = {
        kind: 'tableau',
        label: `${asStr(p['faction_name'], '?')} — ${asNum(p['points'])} pts`,
        data: {
          id: `sl:p:${asStr(p['player_id'])}`,
          colorKey: ck,
          stats: {
            points: `${asNum(p['points'])}/5`,
            influence: asNum(p['influence']),
            sugar: asNum(p['sugar_cubes']),
            intelKinds: asArr(p['intel_tokens']).length,
            hand: asNum(p['hand_count']),
            leader: asStr(isObj(p['units']) ? (p['units'] as Record<string, unknown>)['leader'] : '', 'off-board'),
            knight: asStr(isObj(p['units']) ? (p['units'] as Record<string, unknown>)['knight'] : '', 'off-board'),
            ambassador: asStr(isObj(p['units']) ? (p['units'] as Record<string, unknown>)['ambassador'] : '', 'off-board'),
          },
          zones: [],
        },
      };
      if (mePid && p['player_id'] === mePid) bench.push(tableau);
      else side.push(tableau);
    }
    if (Array.isArray(view['your_hand'])) {
      bench.push({
        kind: 'card-zone',
        label: 'Your Intel',
        data: {
          id: 'sl:hand', kind: 'fan',
          cards: (view['your_hand'] as unknown[]).map((c, i) => intelCard(c, `sl:hand:${i}`)),
        },
      });
    }

    return { board, bench, side, palette: PALETTE, title: 'Sweetlands Imperium' };
  },

  litParts(view: unknown, legalMoves: LegalMove[]): string[] {
    const lit: string[] = [];
    const handSize = Array.isArray(view) ? 0 : (isObj(view) && Array.isArray(view['your_hand']) ? (view['your_hand'] as unknown[]).length : 0);
    void handSize;
    for (const m of legalMoves) {
      const t = asStr(m.move['type']);
      if (t === 'play_intel' && typeof m.move['hand_index'] === 'number') {
        lit.push(`sl:hand:${m.move['hand_index']}`);
      }
      // Movement targets: engine legal moves may name a unit + destination;
      // we light the destination space when the move carries one.
      const dest = m.move['destination'];
      const sid = locToSpaceId(dest);
      if (sid) lit.push(sid);
    }
    return [...new Set(lit)];
  },

  moveForSelect(sel: SelectEvent, legalMoves: LegalMove[]): LegalMove | null {
    const hand = /sl:hand:(\d+)$/.exec(sel.id);
    if (hand) {
      const idx = Number(hand[1]);
      return legalMoves.find((m) => m.move['type'] === 'play_intel' && m.move['hand_index'] === idx) ?? null;
    }
    const dest = legalMoves.find((m) => locToSpaceId(m.move['destination']) === sel.id);
    return dest ?? null;
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    // Sugar-cube battle rolls and Intel draws come through resolve_report.
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },
};

function findMe(view: Record<string, unknown>, players: unknown[]): unknown {
  void players;
  return view['your_player_id'] ?? null;
}

export default sweetlandsGlue;
