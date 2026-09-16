// Cybernoir 2127 glue — a map of 19 locations in three boroughs, two very
// different tableaux (Detective case board / Hacker contacts), the evidence
// row, jail track and the clue tokens. View shape per the engine's views.ts:
// public fields plus role/location_hand/informants for the Detective, or
// role/hand/hideout/evidence_detail for the Hacker.

import type { CardData, MapRegionData, TablePlan, Zone } from './zoneData';
import type { GlueModule, GlueInput } from './types';
import { asArr, asNum, asStr, isObj, shapeHas } from './types';
import type { LegalMove, SelectEvent } from './primitiveTree';

// The 19 locations, from docs/games/cybernoir-2127.md "The map" (6 Downtown,
// 6 Hive, 7 Boonies). Positions are hand-placed by borough on a 100×100 plane.
const LOCATIONS: { name: string; borough: 'downtown' | 'hive' | 'boonies'; x: number; y: number; faction: string }[] = [
  { name: 'Neon Plaza', borough: 'downtown', x: 15, y: 15, faction: 'none' },
  { name: 'OmniSuperUltra Tower', borough: 'downtown', x: 35, y: 10, faction: 'omnisuperultra' },
  { name: 'Glass Arcade', borough: 'downtown', x: 55, y: 18, faction: 'shizuoka' },
  { name: 'The Stacks', borough: 'downtown', x: 25, y: 30, faction: 'none' },
  { name: 'Rain Market', borough: 'downtown', x: 45, y: 32, faction: 'chimera' },
  { name: 'Kestrel Station', borough: 'downtown', x: 65, y: 28, faction: 'none' },
  { name: 'The Warrens', borough: 'hive', x: 15, y: 55, faction: 'crimson' },
  { name: 'Static Court', borough: 'hive', x: 32, y: 50, faction: 'none' },
  { name: 'Blackout Row', borough: 'hive', x: 48, y: 58, faction: 'crimson' },
  { name: 'The Undernet', borough: 'hive', x: 28, y: 68, faction: 'iceden' },
  { name: 'Hollow Market', borough: 'hive', x: 45, y: 72, faction: 'none' },
  { name: 'Doppler Clinic', borough: 'hive', x: 62, y: 62, faction: 'iceden' },
  { name: 'Dust Fields', borough: 'boonies', x: 78, y: 78, faction: 'none' },
  { name: 'Relay Spires', borough: 'boonies', x: 88, y: 60, faction: 'omnisuperultra' },
  { name: 'The Salt Flats', borough: 'boonies', x: 70, y: 88, faction: 'none' },
  { name: 'Crawlspace', borough: 'boonies', x: 84, y: 40, faction: 'shizuoka' },
  { name: 'Wreckfield', borough: 'boonies', x: 92, y: 85, faction: 'chimera' },
  { name: 'Old Power Plant', borough: 'boonies', x: 60, y: 84, faction: 'none' },
  { name: 'The Junction', borough: 'boonies', x: 72, y: 55, faction: 'iceden' },
];

const PALETTE: Record<string, string> = {
  detective: '#b3222a',
  hacker: '#1f6e8c',
  none: '#6b6f76',
  omnisuperultra: '#1c2a5e',
  shizuoka: '#0e7c6b',
  iceden: '#1f6e8c',
  crimson: '#7a1220',
  chimera: '#5a3d8a',
  downtown: '#4a4e57',
  hive: '#7a4a12',
  boonies: '#6e6558',
};

function locId(name: string): string {
  return `cn:loc:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function playedSet(board: unknown[]): Set<string> {
  return new Set(board.map((b) => asStr(b)));
}

export const cybernoirGlue: GlueModule = {
  gameId: 'cybernoir-2127',

  plan(input: GlueInput): TablePlan | null {
    const { view } = input;
    if (!shapeHas(view, 'phase', 'board', 'detective', 'hacker')) return null;
    const role = asStr(view['role'], '');
    const played = playedSet(asArr(view['board']));
    const hideout = asStr(view['hideout'], ''); // Hacker-private; empty to others

    const regions: MapRegionData[] = LOCATIONS.map((l) => {
      let occupant: string | undefined;
      if (played.has(l.name)) occupant = 'played';
      if (role === 'hacker' && hideout === l.name) occupant = 'safehouse';
      return {
        id: locId(l.name),
        label: l.name,
        x: l.x, y: l.y,
        colorKey: played.has(l.name) ? 'none' : l.borough,
        occupant,
      };
    });

    const board: Zone[] = [
      { kind: 'map', label: 'Cybernoir 2127 — the city', data: { id: 'cn:map', regions } },
    ];

    // Jail track: three slots.
    const jail = isObj(view['jail']) ? view['jail'] : {};
    board.push({
      kind: 'track',
      label: 'Jail',
      data: {
        id: 'cn:jail', length: 3,
        markers: {
          slot1: asArr(jail['slot_1_booked']).length > 0 ? 0 : -1,
          slot2: asArr(jail['slot_2_processing']).length > 0 ? 1 : -1,
          slot3: asArr(jail['slot_3_release_pending_then_freed']).length > 0 ? 2 : -1,
        },
        colorKey: 'detective',
      },
    });

    // Clue pools.
    const neg = asArr(view['negative_clues']);
    board.push({
      kind: 'pool',
      label: 'NOT tokens',
      data: { id: 'cn:not-clues', tokens: { hacker: neg.length } },
    });

    const evidence = isObj(view['evidence']) ? view['evidence'] : {};
    const evCards: CardData[] = [];
    if (evidence['weapon']) evCards.push({ id: 'cn:ev:weapon', title: 'Weapon', subtitle: asStr(evidence['weapon']) });
    asArr(evidence['witnesses']).forEach((w, i) => evCards.push({ id: `cn:ev:wit:${i}`, title: 'Witness', subtitle: asStr(w), colorKey: 'hacker' }));
    for (const s of ['motive_set_1', 'motive_set_2', 'motive_set_3', 'motive_set_4']) {
      asArr(evidence[s]).forEach((m, i) => evCards.push({ id: `cn:ev:${s}:${i}`, title: 'Motive', subtitle: asStr(m), colorKey: 'detective' }));
    }
    board.push({
      kind: 'card-zone', label: `Evidence (${evCards.length}/13)`,
      data: { id: 'cn:evidence', kind: 'row', cards: evCards },
    });

    const det = isObj(view['detective']) ? view['detective'] : {};
    const hak = isObj(view['hacker']) ? view['hacker'] : {};
    const detTz: Zone = {
      kind: 'tableau', label: 'Detective',
      data: {
        id: 'cn:detective', colorKey: 'detective',
        stats: {
          ap: asNum(det['ap']),
          locationDeck: asNum(det['location_deck_size']),
          hand: asNum(det['location_hand_size']),
          poiDeck: asNum(det['poi_deck_size']),
          midGameGuess: det['mid_game_guess_spent'] ? 'spent' : 'available',
          overclock: det['overclock_used'] ? 'used' : 'available',
        },
        zones: [],
      },
    };
    const hakTz: Zone = {
      kind: 'tableau', label: 'Hacker',
      data: {
        id: 'cn:hacker', colorKey: 'hacker',
        stats: {
          ap: asNum(hak['ap']),
          contactsDeck: asNum(hak['contacts_deck_size']),
          hand: asNum(hak['hand_size']),
          safehouseBurned: view['safehouse_burned'] ? 'yes' : 'no',
          overclock: hak['overclock_used'] ? 'used' : 'available',
        },
        zones: [],
      },
    };

    const bench: Zone[] = [];
    const side: Zone[] = [];
    if (role === 'detective') {
      bench.push(detTz);
      side.push(hakTz);
      const hand = view['location_hand'];
      if (Array.isArray(hand)) {
        bench.push({
          kind: 'card-zone', label: 'Your location hand',
          data: { id: 'cn:hand', kind: 'fan', cards: hand.map((n, i) => ({ id: `cn:hand:${i}`, title: asStr(n), colorKey: 'detective' })) },
        });
      }
      const informants = asArr(view['informants']);
      bench.push({
        kind: 'card-zone', label: 'Informants',
        data: {
          id: 'cn:informants', kind: 'row',
          cards: informants.map((inf, i) => {
            const o = isObj(inf) ? inf : {};
            return { id: `cn:informant:${i}`, title: o['revealed'] ? asStr(o['person']) : `face-down #${i + 1}`, faceDown: !o['revealed'] };
          }),
        },
      });
    } else {
      bench.push(hakTz);
      side.push(detTz);
      const hand = view['hand'];
      if (Array.isArray(hand)) {
        bench.push({
          kind: 'card-zone', label: 'Your contacts',
          data: { id: 'cn:hand', kind: 'fan', cards: hand.map((n, i) => ({ id: `cn:hand:${i}`, title: asStr(n), colorKey: 'hacker' })) },
        });
      }
    }

    return { board, bench, side, palette: PALETTE, title: 'Cybernoir 2127' };
  },

  litParts(_view: unknown, legalMoves: LegalMove[]): string[] {
    const lit: string[] = [];
    for (const m of legalMoves) {
      const loc = asStr(m.move['location'] ?? m.move['location_name']);
      if (loc) lit.push(locId(loc));
      if (typeof m.move['hand_index'] === 'number') lit.push(`cn:hand:${m.move['hand_index']}`);
      if (typeof m.move['informant_index'] === 'number') lit.push(`cn:informant:${m.move['informant_index']}`);
    }
    return [...new Set(lit)];
  },

  moveForSelect(sel: SelectEvent, legalMoves: LegalMove[]): LegalMove | null {
    return (
      legalMoves.find((m) => {
        const loc = asStr(m.move['location'] ?? m.move['location_name']);
        if (loc && locId(loc) === sel.id) return true;
        const hand = /cn:hand:(\d+)$/.exec(sel.id);
        if (hand && m.move['hand_index'] === Number(hand[1])) return true;
        const inf = /cn:informant:(\d+)$/.exec(sel.id);
        if (inf && m.move['informant_index'] === Number(inf[1])) return true;
        return false;
      }) ?? null
    );
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },
};

export default cybernoirGlue;
