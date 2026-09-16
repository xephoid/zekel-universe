// Cybernoir 2127 glue — a map of 19 locations in three boroughs, two very
// different tableaux (Detective case board / Hacker contacts), the evidence
// row, jail track and the clue tokens. View shape per the engine's views.ts
// (zekel src/games/cybernoir-2127/views.ts): public fields (phase, turn,
// activePlayerId, playerOrder, pending, board (played location names),
// informants_*, jail slots, truthful_*/negative clues, safehouse_burned,
// evidence {weapon, witnesses, motive_set_1..4}, contacts_discard, detective
// {location_*_size, ap, overclock_used, …}, hacker {contacts_*, hand_size,
// ap, overclock_used}, overclock_draws_*) plus role/location_hand/informants
// for the Detective, or role/hand/hideout/evidence_detail for the Hacker.
// Location names/boroughs transcribed from the engine's data/index.ts
// (LOCATIONS); the docs/games map names are stale and must not be used.

import type { CardData, MapRegionData, TablePlan, Zone } from './zoneData';
import type { GlueModule, GlueInput } from './types';
import { asArr, asNum, asStr, isObj, shapeHas } from './types';
import type { LegalMove, SelectEvent } from './primitiveTree';

// The 19 real locations (zekel src/games/cybernoir-2127/data/index.ts):
// borough field is 'downtown' | 'the_hive' | 'boonies'; affiliations
// corp_1/corp_2/gang_1..3; coordinates hand-placed by borough on 100×100.
type Borough = 'downtown' | 'the_hive' | 'boonies';
interface Loc { name: string; borough: Borough; aff: string; x: number; y: number }

const LOCATIONS: Loc[] = [
  // downtown
  { name: 'OmniSuperUltra Corporate Office #beebee', borough: 'downtown', aff: 'corp_1', x: 20, y: 8 },
  { name: 'Shizuoka Megamall', borough: 'downtown', aff: 'corp_2', x: 55, y: 12 },
  { name: 'Dark City Central Station', borough: 'downtown', aff: 'none', x: 38, y: 18 },
  { name: 'The Back Alley', borough: 'downtown', aff: 'gang_1', x: 12, y: 26 },
  { name: 'Xistential Club', borough: 'downtown', aff: 'gang_2', x: 30, y: 32 },
  { name: 'Sewers', borough: 'downtown', aff: 'gang_3', x: 62, y: 28 },
  // the Hive
  { name: 'Platinum Extraluxx Apartments Unit 1337x', borough: 'the_hive', aff: 'corp_1', x: 10, y: 46 },
  { name: 'Suburb Tower #2013', borough: 'the_hive', aff: 'corp_2', x: 34, y: 50 },
  { name: 'Nature Reserve #42', borough: 'the_hive', aff: 'gang_2', x: 22, y: 60 },
  { name: 'Resident Block #8008315', borough: 'the_hive', aff: 'gang_3', x: 48, y: 58 },
  { name: "Dirty Mel's", borough: 'the_hive', aff: 'gang_1', x: 38, y: 66 },
  { name: 'Garbage Dump', borough: 'the_hive', aff: 'none', x: 58, y: 64 },
  // boonies
  { name: 'Shipyard', borough: 'boonies', aff: 'corp_1', x: 80, y: 46 },
  { name: 'Trailer Towers', borough: 'boonies', aff: 'none', x: 90, y: 64 },
  { name: 'Warehouse', borough: 'boonies', aff: 'corp_2', x: 72, y: 62 },
  { name: 'The Junction', borough: 'boonies', aff: 'gang_1', x: 82, y: 76 },
  { name: 'Tower Furnace', borough: 'boonies', aff: 'gang_2', x: 66, y: 78 },
  { name: 'Junktown', borough: 'boonies', aff: 'gang_3', x: 92, y: 86 },
  { name: 'Little Ghana', borough: 'boonies', aff: 'none', x: 60, y: 90 },
];

const PALETTE: Record<string, string> = {
  detective: '#b3222a',
  hacker: '#1f6e8c',
  none: '#6b6f76',
  corp_1: '#1c2a5e',
  corp_2: '#0e7c6b',
  gang_1: '#1f6e8c',
  gang_2: '#7a1220',
  gang_3: '#5a3d8a',
  downtown: '#4a4e57',
  the_hive: '#7a4a12',
  boonies: '#6e6558',
};

function locId(name: string): string {
  return `cn:loc:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
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

    // Jail track: three named slots (booked / processing / release pending).
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

    // NOT tokens (negative clues) — the hacker's denials handed to the det.
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
      const t = asStr(m.move['type']);
      // Location-targeting moves name the printed location: play_location,
      // guess_location, final_guess (location_name); board_discard_choice
      // (target_location); burn_choice (new_location_name).
      const loc = asStr(
        m.move['location_name'] ?? m.move['target_location'] ?? m.move['new_location_name'],
      );
      if (loc) lit.push(locId(loc));
      if (typeof m.move['hand_index'] === 'number') lit.push(`cn:hand:${m.move['hand_index']}`);
      // informant targets are named by their ordinal string ('first', 'second'…)
      const inf = asStr(m.move['target_informant']);
      if ((t === 'reveal_informant' || t === 'informant_removal_choice') && inf) {
        lit.push(`cn:informant:${inf}`);
      }
    }
    return [...new Set(lit)];
  },

  moveForSelect(sel: SelectEvent, legalMoves: LegalMove[]): LegalMove | null {
    return (
      legalMoves.find((m) => {
        const loc = asStr(
          m.move['location_name'] ?? m.move['target_location'] ?? m.move['new_location_name'],
        );
        if (loc && locId(loc) === sel.id) return true;
        const hand = /cn:hand:(\d+)$/.exec(sel.id);
        if (hand && m.move['hand_index'] === Number(hand[1])) return true;
        const inf = /cn:informant:(.+)$/.exec(sel.id);
        if (inf && m.move['target_informant'] === inf[1]) return true;
        return false;
      }) ?? null
    );
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    // Cybernoir resolves its report-style pendings through typed choices
    // (report_hideout, block_decide, clue_reveal, …), handled by menu rows.
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },
};

export default cybernoirGlue;
