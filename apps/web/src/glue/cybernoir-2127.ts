// Cybernoir 2127 glue: a map of the city's locations in three boroughs, two
// very different tableaux (Detective case board, Hacker contacts), the
// evidence row, the jail track and the clue tokens. View shape per the
// engine (zekel src/games/cybernoir-2127/views.ts). The locations and their
// boroughs come from the engine's reference data; the map lays each borough
// out as a band and spreads its locations across it.

import type { CardData, MapNode, TableauData } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import type { GlueModule, GlueInput, LegalMove, SelectEvent, SetupField, TablePlan, Zone, SetupAnswers, SetupSeat } from './types';
import { asArr, asNum, asStr, isObj, shapeHas, words } from './types';

const PALETTE: Record<string, string> = {
  detective: '#b3222a',
  hacker: '#1f6e8c',
  none: '#6b6f76',
  played: '#3b3f46',
  safehouse: '#c9a227',
  downtown: '#4a4e57',
  the_hive: '#7a4a12',
  boonies: '#6e6558',
  evidence: '#3E7C4F',
  witness: '#1f6e8c',
  motive: '#b3222a',
  weapon: '#c9a227',
  not: '#8a8578',
};

interface Loc { name: string; borough: string; affiliation?: string }

function locations(reference: GameReferenceResponse | null, view: Record<string, unknown>): Loc[] {
  const rd = reference?.referenceData;
  const out: Loc[] = [];
  if (isObj(rd) && Array.isArray(rd['locations'])) {
    for (const l of rd['locations']) {
      if (isObj(l) && typeof l['name'] === 'string') {
        out.push({ name: l['name'], borough: asStr(l['borough'], 'city'), affiliation: asStr(l['affiliation']) || undefined });
      } else if (typeof l === 'string') {
        out.push({ name: l, borough: 'city' });
      }
    }
  }
  if (out.length > 0) return out;
  // Without reference data, at least show what the view names.
  const names = new Set<string>();
  for (const b of asArr(view['board'])) names.add(asStr(b));
  const det = isObj(view['detective']) ? view['detective'] : {};
  for (const d of asArr(det['location_discard'])) names.add(asStr(d));
  for (const h of asArr(view['location_hand'])) names.add(asStr(h));
  return [...names].filter(Boolean).map((name) => ({ name, borough: 'city' }));
}

export function locId(name: string): string {
  return `cn:loc:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

export const cybernoirGlue: GlueModule = {
  gameId: 'cybernoir-2127',
  title: 'Cybernoir 2127',

  plan(input: GlueInput): TablePlan | null {
    const { view } = input;
    if (!shapeHas(view, 'phase', 'board', 'detective', 'hacker')) return null;
    const role = asStr(view['role'], '');
    const played = new Set(asArr(view['board']).map((b) => asStr(b)));
    // The hideout is a name when the engine names it, or a description
    // (borough, population, affiliation) that marks no single node.
    const hideoutRaw = view['hideout'];
    const hideout = asStr(hideoutRaw, '');
    const hideoutDesc = isObj(hideoutRaw) ? hideoutRaw : null;

    const locs = locations(input.reference, view);
    const boroughs = [...new Set(locs.map((l) => l.borough))];
    const nodes: MapNode[] = [];
    boroughs.forEach((b, bi) => {
      const inBand = locs.filter((l) => l.borough === b);
      const yTop = (bi / boroughs.length) * 100;
      inBand.forEach((l, i) => {
        const cols = Math.ceil(inBand.length / 2);
        const row = i % 2;
        const col = Math.floor(i / 2);
        const isPlayed = played.has(l.name);
        const isHideout = role === 'hacker' && hideout === l.name;
        nodes.push({
          id: locId(l.name),
          label: l.name,
          x: 8 + (cols <= 1 ? 42 : (col / (cols - 1)) * 84),
          y: yTop + 14 + row * ((100 / boroughs.length) - 22),
          colorKey: isPlayed ? 'played' : b,
          badges: [...(isPlayed ? ['played'] : []), ...(isHideout ? ['safehouse'] : []), ...(l.affiliation && l.affiliation !== 'none' ? [words(l.affiliation)] : [])],
          pieces: isHideout ? [{ label: 'safehouse', colorKey: 'safehouse' }] : [],
        });
      });
    });

    const board: Zone[] = [
      { kind: 'map', id: 'cn:map', data: { label: 'The city', aspect: 70, nodes } },
    ];

    // Jail: three named slots with whoever sits in them.
    const jail = isObj(view['jail']) ? view['jail'] : {};
    const slots: Array<[string, string]> = [
      ['slot_1_booked', 'Booked'], ['slot_2_processing', 'Processing'], ['slot_3_release_pending_then_freed', 'Release pending'],
    ];
    board.push({
      kind: 'track', id: 'cn:jail',
      data: {
        label: 'Jail',
        spaces: slots.map(([key, label]) => ({
          index: label,
          filled: asArr(jail[key]).length > 0,
          pieces: asArr(jail[key]).map((who) => ({ label: asStr(who), colorKey: 'detective' })),
        })),
      },
    });

    const evidence = isObj(view['evidence']) ? view['evidence'] : {};
    const evCards: CardData[] = [];
    if (evidence['weapon']) evCards.push({ id: 'cn:ev:weapon', label: asStr(evidence['weapon']), subtitle: 'Weapon', colorKey: 'weapon' });
    asArr(evidence['witnesses']).forEach((w) => evCards.push({ id: `cn:ev:witness:${asStr(w)}`, label: asStr(w), subtitle: 'Witness', colorKey: 'witness' }));
    for (const key of Object.keys(evidence).filter((k) => k.startsWith('motive'))) {
      asArr(evidence[key]).forEach((m) => evCards.push({ id: `cn:ev:${key}:${asStr(m)}`, label: asStr(m), subtitle: words(key), colorKey: 'motive' }));
    }
    board.push({ kind: 'card-zone', id: 'cn:evidence', data: { label: `Evidence (${evCards.length})`, mode: 'row', cards: evCards } });

    const neg = asArr(view['negative_clues']);
    board.push({ kind: 'pool', id: 'cn:not-clues', data: { label: 'NOT tokens', items: [{ label: 'NOT', count: neg.length, colorKey: 'not' }] } });

    const det = isObj(view['detective']) ? view['detective'] : {};
    const hak = isObj(view['hacker']) ? view['hacker'] : {};
    const activeRole = asStr(view['activePlayerId']);
    const detStats: NonNullable<TableauData['stats']> = [
      { label: 'Action points', value: asNum(det['ap']) },
      { label: 'Location deck', value: asNum(det['location_deck_size']) },
      { label: 'Location hand', value: asNum(det['location_hand_size']) },
      { label: 'Person deck', value: asNum(det['poi_deck_size']) },
      { label: 'Mid-game guess', value: det['mid_game_guess_spent'] ? 'spent' : 'available' },
      { label: 'Overclock', value: det['overclock_used'] ? 'used' : 'available' },
    ];
    const hakStats: NonNullable<TableauData['stats']> = [
      { label: 'Action points', value: asNum(hak['ap']) },
      ...(role === 'hacker' && hideoutDesc ? [{ label: 'Safehouse', value: [asStr(hideoutDesc['borough']), asStr(hideoutDesc['affiliation'])].filter((x) => x && x !== 'none').map(words).join(' · ') || 'hidden' }] : []),
      { label: 'Contacts deck', value: asNum(hak['contacts_deck_size']) },
      { label: 'Hand', value: asNum(hak['hand_size']) },
      { label: 'Safehouse burned', value: view['safehouse_burned'] ? 'yes' : 'no' },
      { label: 'Overclock', value: hak['overclock_used'] ? 'used' : 'available' },
    ];
    const detTz: Zone = { kind: 'tableau', id: 'cn:detective', data: { label: `Detective${role === 'detective' ? ' (you)' : ''}`, owner: 'detective', active: /det/i.test(activeRole), stats: detStats } };
    const hakTz: Zone = { kind: 'tableau', id: 'cn:hacker', data: { label: `Hacker${role === 'hacker' ? ' (you)' : ''}`, owner: 'hacker', active: /hak|hack/i.test(activeRole), stats: hakStats } };

    const bench: Zone[] = [];
    const side: Zone[] = [];
    if (role === 'detective') {
      bench.push(detTz);
      side.push(hakTz);
      const hand = view['location_hand'];
      if (Array.isArray(hand)) {
        bench.push({
          kind: 'card-zone', id: 'cn:hand', arriveFrom: 'cn:location-deck',
          data: { label: 'Your location hand', mode: 'fan', cards: hand.map((n, i) => ({ id: `cn:hand:${i}:${asStr(n)}`, label: asStr(n), colorKey: 'detective' })) },
        });
      }
      const informants = asArr(view['informants']);
      bench.push({
        kind: 'card-zone', id: 'cn:informants',
        data: {
          label: 'Informants', mode: 'row',
          cards: informants.map((inf, i) => {
            const o = isObj(inf) ? inf : {};
            const revealed = !!o['revealed'];
            return { id: `cn:informant:${ORDINALS[i] ?? String(i)}`, label: revealed ? asStr(o['person']) : `Informant ${i + 1}`, face: revealed ? 'up' as const : 'down' as const, colorKey: 'detective' };
          }),
        },
      });
      side.push({ kind: 'card-zone', id: 'cn:location-deck', data: { label: 'Location deck', mode: 'pile', countOnly: asNum(det['location_deck_size']) } });
    } else {
      bench.push(hakTz);
      side.push(detTz);
      const hand = view['hand'];
      if (Array.isArray(hand)) {
        bench.push({
          kind: 'card-zone', id: 'cn:hand', arriveFrom: 'cn:contacts-deck',
          data: { label: 'Your contacts', mode: 'fan', cards: hand.map((n, i) => ({ id: `cn:hand:${i}:${asStr(n)}`, label: asStr(n), colorKey: 'hacker' })) },
        });
      }
      side.push({ kind: 'card-zone', id: 'cn:contacts-deck', data: { label: 'Contacts deck', mode: 'pile', countOnly: asNum(hak['contacts_deck_size']) } });
    }

    const status = `Turn ${asNum(view['turn'], 1)} · ${words(asStr(view['phase']))}`;
    return { board, bench, side, palette: PALETTE, title: 'Cybernoir 2127', status };
  },

  litParts(input: GlueInput): string[] {
    const lit: string[] = [];
    const hand = shapeHas(input.view, 'role') ? asArr(input.view['location_hand'] ?? input.view['hand']) : [];
    for (const m of input.legalMoves) {
      const t = asStr(m.move['type']);
      const loc = asStr(m.move['location_name'] ?? m.move['target_location'] ?? m.move['new_location_name']);
      if (loc) lit.push(locId(loc));
      if (typeof m.move['hand_index'] === 'number') lit.push(`cn:hand:${m.move['hand_index']}:${asStr(hand[m.move['hand_index']])}`);
      const inf = asStr(m.move['target_informant']);
      if ((t === 'reveal_informant' || t === 'informant_removal_choice') && inf) lit.push(`cn:informant:${inf}`);
    }
    return [...new Set(lit)];
  },

  moveForSelect(sel: SelectEvent, input: GlueInput): LegalMove | null {
    const hand = shapeHas(input.view, 'role') ? asArr(input.view['location_hand'] ?? input.view['hand']) : [];
    return (
      input.legalMoves.find((m) => {
        const loc = asStr(m.move['location_name'] ?? m.move['target_location'] ?? m.move['new_location_name']);
        if (loc && locId(loc) === sel.id) return true;
        const h = /^cn:hand:(\d+):/.exec(sel.id);
        if (h && m.move['hand_index'] === Number(h[1]) && asStr(hand[Number(h[1])]) === sel.id.slice(h[0].length)) return true;
        const inf = /^cn:informant:(.+)$/.exec(sel.id);
        if (inf && m.move['target_informant'] === inf[1]) return true;
        return false;
      }) ?? null
    );
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },

  /**
   * Two setup choices, both session options the engine takes: which role
   * the host plays (the engine's `detective` option names the Detective's
   * player id; the other seat is the Hacker), and the one rules variant
   * (when Overclock grants the Detective two Location draws).
   */
  setupFields(reference: GameReferenceResponse, _seats?: SetupSeat[]): SetupField[] {
    const schema = reference.optionsSchema;
    const props = isObj(schema) && isObj(schema['properties']) ? schema['properties'] : {};
    const fields: SetupField[] = [];
    if (isObj(props['detective'])) {
      fields.push({
        kind: 'choice', key: 'role', label: 'Your role',
        help: 'The Detective goes first and hunts the leads; the Hacker hides the truth. The other seat takes the other role.',
        options: [
          { value: 'detective', label: 'Detective', hint: 'Chase leads across the city and name the hideout.' },
          { value: 'hacker', label: 'Hacker', hint: 'Keep your hideout hidden and clear your name.' },
        ],
      });
    }
    const timing = isObj(props['overclock_draw_timing']) ? props['overclock_draw_timing'] : null;
    const values = timing && Array.isArray(timing['enum']) ? timing['enum'].map((v) => String(v)) : [];
    if (values.length > 0) {
      fields.push({
        kind: 'choice', key: 'overclock_draw_timing', label: 'Overclock: when the Detective draws the two Locations',
        help: typeof timing?.['description'] === 'string' ? timing['description'] : undefined,
        options: values.map((v) => ({ value: v, label: words(v) })),
      });
    }
    return fields;
  },

  setupOptions(answers: SetupAnswers, seats: SetupSeat[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const role = answers['role'];
    const host = seats.find((s) => s.host);
    const other = seats.find((s) => !s.host);
    if ((role === 'detective' || role === 'hacker') && host && other) {
      // Universe names seats p1..pN by position; the Detective is the host's
      // seat or the other one.
      out['detective'] = `p${(role === 'detective' ? host : other).position + 1}`;
    }
    const v = answers['overclock_draw_timing'];
    if (typeof v === 'string' && v) out['overclock_draw_timing'] = v;
    return out;
  },

};

export default cybernoirGlue;
