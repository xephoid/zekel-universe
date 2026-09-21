// Warble Way Galaxy glue: the character tableau, the crew row, the ship,
// items, the travel deck pile, the ruin grid, and the journey. Solo with no
// hidden zones (zekel src/games/warble-way-galaxy/views.ts). Every number
// shown comes from the view: crew capacity from ship.capacity, level
// progress from xp_to_next_level, the season finish lines from
// season_endings. Nothing here knows a threshold.

import type { CardData, GridData, TableauData } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import type { FormField, GlueModule, GlueInput, LegalMove, MoveForm, SelectEvent, SetupAnswers, SetupField, SetupSeat, TablePlan, Zone } from './types';
import { asArr, asNum, asStr, isObj, shapeHas, words } from './types';
import { answerNumber, answerText } from './forms';

/** The twelve abilities as the reference data prints them: "SWA (Swashbuckling)". */
function abilityOptions(reference: GameReferenceResponse | null): Array<{ code: string; name: string; stat: string }> {
  const rd = reference?.referenceData;
  const stats = isObj(rd) && isObj(rd['stats']) ? rd['stats'] : {};
  const out: Array<{ code: string; name: string; stat: string }> = [];
  for (const [stat, list] of Object.entries(stats)) {
    for (const entry of asArr(list)) {
      const m = /^([A-Z]{3})\s*\((.+)\)$/.exec(asStr(entry));
      if (m) out.push({ code: m[1]!, name: m[2]!, stat });
    }
  }
  return out;
}

function raceOptions(reference: GameReferenceResponse | null): string[] {
  const rd = reference?.referenceData;
  return isObj(rd) ? asArr(rd['races']).map((r) => asStr(r)).filter(Boolean) : [];
}

function archetypeOptions(reference: GameReferenceResponse | null): Array<{ name: string; label: string }> {
  const rd = reference?.referenceData;
  return isObj(rd)
    ? asArr(rd['archetypes']).flatMap((a) => {
      if (!isObj(a) || typeof a['name'] !== 'string') return [];
      const scores = isObj(a['scores']) ? Object.entries(a['scores']).map(([k, v]) => `${k} ${asNum(v)}`).join(' / ') : '';
      return [{ name: a['name'], label: `${a['name']} ${asStr(a['stars'])} ${asStr(a['difficulty'])} — ${scores}` }];
    })
    : [];
}

const PALETTE: Record<string, string> = {
  ship: '#4a6fa5',
  character: '#5fa873',
  crew: '#7a5fa8',
  danger: '#b4452f',
  credits: '#e6a23c',
  wall: '#2b2620',
  pit: '#8a8578',
  party: '#3E7C4F',
  attacker: '#b4452f',
  item: '#c9a227',
};

function crewCard(c: unknown, i: number): CardData {
  if (!isObj(c)) return { id: `ww:crew:${i}`, label: 'crew', colorKey: 'crew' };
  const anger = asNum(c['anger_tokens']);
  return {
    id: `ww:crew:${asStr(c['name'], String(i))}`,
    label: asStr(c['name'], 'crew'),
    subtitle: asStr(c['race']) || undefined,
    badges: anger > 0 ? [`anger ×${anger}`] : [],
    colorKey: 'crew',
  };
}

/** Parse the ruin board_rows ("row 3: # . . S …") into grid cells. */
function ruinGrid(ruin: Record<string, unknown>): Zone | null {
  const rows = asArr(ruin['board_rows']);
  if (rows.length === 0) return null;
  const cells: GridData['cells'] = [];
  let maxX = 0;
  rows.forEach((r, y) => {
    const glyphs = asStr(r).replace(/^row \d+:\s*/, '').trim().split(/\s+/);
    maxX = Math.max(maxX, glyphs.length - 1);
    glyphs.forEach((g, x) => {
      if (g === '.' || g === '') return;
      if (g === '#') cells.push({ x, y, terrain: 'wall' });
      else if (g === '~') cells.push({ x, y, terrain: 'pit' });
      else if (/^\d$/.test(g)) cells.push({ x, y, pieces: [{ label: g, colorKey: 'party' }] });
      else if (/^[a-z]$/i.test(g)) cells.push({ x, y, pieces: [{ label: g, colorKey: 'attacker' }] });
      else cells.push({ x, y, pieces: [{ label: g, colorKey: 'item' }] });
    });
  });
  return {
    kind: 'grid', id: 'ww:ruin',
    data: {
      label: `Ruin ${asStr(ruin['map'])} · round ${asNum(ruin['round'], 1)}`,
      extent: { minX: 0, minY: 0, maxX, maxY: rows.length - 1 },
      cells,
    },
  };
}

export const warbleWayGlue: GlueModule = {
  gameId: 'warble-way-galaxy',
  title: 'Warble Way Galaxy',

  plan(input: GlueInput): TablePlan | null {
    const { view } = input;
    if (!shapeHas(view, 'phase')) return null;
    if (!('travel_deck' in view) && !('character' in view) && !('ship' in view)) return null;

    const char = isObj(view['character']) ? view['character'] : null;
    const ship = isObj(view['ship']) ? view['ship'] : null;
    const travel = isObj(view['travel_deck']) ? view['travel_deck'] : null;
    const journey = isObj(view['journey']) ? view['journey'] : null;
    const ruin = isObj(view['ruin']) ? view['ruin'] : null;
    const endings = isObj(view['season_endings']) ? view['season_endings'] : {};

    const bench: Zone[] = [];
    const side: Zone[] = [];
    const board: Zone[] = [];

    if (char) {
      const abilities = isObj(char['abilities']) ? char['abilities'] : {};
      const xp = asNum(char['xp']);
      const toNext = asNum(char['xp_to_next_level']);
      const stats: NonNullable<TableauData['stats']> = [
        { label: 'Level', value: asNum(char['level'], 1) },
        { label: 'XP to next level', value: xp, max: toNext > 0 ? xp + toNext : undefined },
        { label: 'Credits', value: asNum(char['credits']) },
        { label: 'Dread', value: asNum(char['dread']) },
        { label: 'Wounded', value: char['wounded'] ? 'yes' : 'no' },
        ...Object.entries(abilities).map(([k, v]) => ({
          label: isObj(v) ? asStr(v['name'], k.toUpperCase()) : k.toUpperCase(),
          value: isObj(v) ? asNum(v['effective'], asNum(v['natural'])) : asNum(v),
        })),
      ];
      side.push({
        kind: 'tableau', id: 'ww:character',
        data: { label: asStr(char['name'], 'You'), owner: 'character', active: true, stats },
      });
      // The finish lines, as the engine spells them out.
      const endingStats = Object.entries(endings).map(([k, v]) => ({ label: words(k), value: asStr(v, String(v)) }));
      if (endingStats.length > 0) {
        side.push({ kind: 'tableau', id: 'ww:season', data: { label: 'Season', stats: endingStats } });
      }
    }
    const crew = asArr(view['crew']);
    const capacity = ship ? asNum(ship['capacity']) : 0;
    if (crew.length > 0 || asNum(view['unnamed_crew']) > 0) {
      const extra = asNum(view['unnamed_crew']);
      bench.push({
        kind: 'card-zone', id: 'ww:crew',
        data: {
          label: `Crew${capacity ? ` (${crew.length}/${capacity})` : ` (${crew.length})`}${extra ? ` +${extra} unnamed` : ''}`,
          mode: 'row', cards: crew.map(crewCard),
        },
      });
    }
    const items = asArr(view['items']);
    if (items.length > 0) {
      bench.push({
        kind: 'card-zone', id: 'ww:items',
        data: {
          label: 'Items', mode: 'fan',
          cards: items.map((it, i) => {
            const o = isObj(it) ? it : {};
            return {
              id: asStr(o['id'], `ww:item:${i}`),
              label: asStr(o['name'], 'item'),
              subtitle: asStr(o['type']) || undefined,
              badges: o['consumed'] ? ['used'] : [],
              colorKey: 'item',
            };
          }),
        },
      });
    }
    if (ship) {
      side.push({
        kind: 'tableau', id: 'ww:ship',
        data: {
          label: `Ship: ${asStr(ship['name'], 'ship')}`, owner: 'ship',
          stats: [
            { label: 'Damage', value: asStr(ship['damage'], String(ship['damage'] ?? '')) },
            ...(capacity ? [{ label: 'Capacity', value: capacity }] : []),
          ],
        },
      });
    }
    if (travel) {
      const discard = asArr(travel['discard']).map((x) => asStr(x));
      board.push({
        kind: 'card-zone', id: 'ww:travel-draw',
        data: { label: 'Travel deck', mode: 'pile', countOnly: asNum(travel['cards_in_draw_pile']) },
      });
      board.push({
        kind: 'card-zone', id: 'ww:travel-discard', arriveFrom: 'ww:travel-draw',
        data: {
          label: 'Discard', mode: 'pile',
          cards: discard.map((c, i) => ({ id: `ww:travel:${i}:${c}`, label: c, colorKey: 'ship' })),
        },
      });
    }
    if (journey && asArr(journey['legs']).length > 0) {
      const legs = asArr(journey['legs']);
      board.push({
        kind: 'track', id: 'ww:journey',
        data: {
          label: 'Journey',
          spaces: legs.map((l, i) => {
            const o = isObj(l) ? l : {};
            return { index: i + 1, label: `${asNum(o['cards_remaining'])}`, filled: asStr(o['position']) === 'current' };
          }),
        },
      });
    }
    if (ruin) {
      const g = ruinGrid(ruin);
      if (g) board.push(g);
    }
    const habitat = isObj(view['habitat']) ? view['habitat'] : null;
    if (habitat) {
      board.push({
        kind: 'tableau', id: 'ww:habitat',
        data: {
          label: `Habitat ${asNum(habitat['number'], 1)}: ${asStr(habitat['name'])}`,
          stats: [
            { label: 'Shop', value: asArr(habitat['shop']).length },
            { label: 'Cantina', value: asArr(habitat['cantina']).length },
            { label: 'Missions', value: asArr(habitat['missions']).length },
          ],
        },
      });
    }
    const status = `${words(asStr(view['phase']))}${isObj(view['pending']) ? ` · ${words(asStr((view['pending'] as Record<string, unknown>)['kind']))}` : ''}`;
    return { board, bench, side, palette: PALETTE, title: 'Warble Way Galaxy', status };
  },

  litParts(input: GlueInput): string[] {
    const lit: string[] = [];
    for (const m of input.legalMoves) {
      const t = asStr(m.move['type']);
      const itemId = m.move['item_id'];
      if ((t === 'use_item' || t === 'equip') && typeof itemId === 'string') lit.push(itemId);
      const cell = m.move['to_cell'] ?? m.move['cell'];
      if (typeof cell === 'string') {
        const [x, y] = cell.split(',').map((n) => Number(n.trim()));
        if (Number.isFinite(x) && Number.isFinite(y)) lit.push(`ww:ruin:${x},${y}`);
      }
    }
    return [...new Set(lit)];
  },

  moveForSelect(sel: SelectEvent, input: GlueInput): LegalMove | null {
    const cell = /^ww:ruin:(\d+),(\d+)$/.exec(sel.id);
    return (
      input.legalMoves.find((m) => sel.id === (m.move['item_id'] as string)) ??
      (cell ? input.legalMoves.find((m) => {
        const c = asStr(m.move['to_cell'] ?? m.move['cell']).replace(/\s+/g, '');
        return c === `${cell[1]},${cell[2]}`;
      }) : undefined) ??
      null
    );
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },

  /** Character creation on the setup screen: the same questions as the
   *  table's form, answered before the season starts. */
  setupFields(reference: GameReferenceResponse, _seats?: SetupSeat[]): SetupField[] {
    const races = raceOptions(reference);
    const abilities = abilityOptions(reference);
    const archetypes = archetypeOptions(reference);
    if (races.length === 0 || abilities.length === 0) return [];
    const fields: SetupField[] = [
      { kind: 'text', key: 'character_name', label: 'Your character\'s name', maxLength: 40 },
      { kind: 'choice', key: 'race', label: 'Race', options: races.map((r) => ({ value: r, label: words(r) })) },
      { kind: 'text', key: 'ship_name', label: 'Your ship\'s name', maxLength: 40 },
      {
        kind: 'choice', key: 'method', label: 'Ability scores',
        help: 'Recommended: one score 3, one 2, one 1. Or an archetype card, a pre-built spread with a printed difficulty.',
        options: [{ value: 'recommended', label: 'Choose the scores' }, ...(archetypes.length ? [{ value: 'archetype', label: 'An archetype card' }] : [])],
      },
    ];
    for (const a of abilities) fields.push({ kind: 'number', key: `score.${a.code}`, label: `${a.name} (${a.code}, ${words(a.stat)})`, min: 0, max: 3 });
    if (archetypes.length) fields.push({ kind: 'choice', key: 'archetype_name', label: 'Archetype card', options: archetypes.map((a) => ({ value: a.name, label: a.label })) });
    fields.push({ kind: 'choice', key: 'disposition', label: 'Disposition (a roleplay hint, never a rule)', options: [
      { value: 'none', label: 'No hint' }, { value: 'brash', label: 'Brash' }, { value: 'risk_averse', label: 'Risk-averse' },
    ] });
    return fields;
  },

  setupMoves(answers: SetupAnswers, _seats: SetupSeat[], reference: GameReferenceResponse): Array<Record<string, unknown>> {
    const text = (k: string) => (typeof answers[k] === 'string' ? (answers[k] as string).trim() : '');
    const name = text('character_name'); const race = text('race'); const ship = text('ship_name');
    const method = text('method'); const disposition = text('disposition');
    if (!name || !race || !ship || !method) return [];
    const base: Record<string, unknown> = { type: 'create_character', character_name: name, race, ship_name: ship, method, ...(disposition && disposition !== 'none' ? { disposition } : {}) };
    if (method === 'archetype') {
      const card = text('archetype_name');
      return card ? [{ ...base, archetype_name: card }] : [];
    }
    const scores: Record<string, number> = {};
    for (const a of abilityOptions(reference)) {
      const v = Number(answers[`score.${a.code}`]);
      if (Number.isFinite(v) && v > 0) scores[a.code] = v;
    }
    return Object.keys(scores).length ? [{ ...base, scores }] : [];
  },

  /** Character creation: the engine lists two skeletons ("FILL IN the
   *  values the player chose"); each becomes a form with nothing filled in. */
  formFor(move: LegalMove, input: GlueInput): MoveForm | null {
    if (move.move['type'] !== 'create_character') return null;
    const method = asStr(move.move['method']);
    const races = raceOptions(input.reference);
    const abilities = abilityOptions(input.reference);
    const archetypes = archetypeOptions(input.reference);
    const common: FormField[] = [
      { kind: 'text', key: 'character_name', label: 'Character name', maxLength: 40 },
      { kind: 'choice', key: 'race', label: 'Race', options: races.map((r) => ({ value: r, label: words(r) })) },
      { kind: 'text', key: 'ship_name', label: 'Ship name', maxLength: 40 },
      { kind: 'choice', key: 'disposition', label: 'Disposition (a roleplay hint, never a rule)', options: [
        { value: 'none', label: 'No hint' }, { value: 'brash', label: 'Brash' }, { value: 'risk_averse', label: 'Risk-averse' },
      ] },
    ];
    if (method === 'archetype') {
      return {
        title: 'Create your character from an archetype card',
        help: move.description,
        fields: [...common, { kind: 'choice', key: 'archetype_name', label: 'Archetype card', options: archetypes.map((a) => ({ value: a.name, label: a.label })) }],
        template: move,
        editableKeys: ['character_name', 'race', 'ship_name', 'archetype_name', 'disposition'],
        submitLabel: 'Begin the season',
        build(answers) {
          const name = answerText(answers, 'character_name');
          const race = answerText(answers, 'race');
          const ship = answerText(answers, 'ship_name');
          const card = answerText(answers, 'archetype_name');
          const disposition = answerText(answers, 'disposition');
          if (!name || !race || !ship || !card || !disposition) return null;
          return { ...move.move, character_name: name, race, ship_name: ship, archetype_name: card, ...(disposition !== 'none' ? { disposition } : {}) };
        },
      };
    }
    const scoreFields: FormField[] = abilities.map((a) => ({
      kind: 'number', key: `score.${a.code}`, label: `${a.name} (${a.code}, ${words(a.stat)})`, min: 0, max: 3,
    }));
    return {
      title: 'Create your character',
      help: move.description,
      fields: [...common, ...scoreFields],
      template: move,
      editableKeys: ['character_name', 'race', 'ship_name', 'scores', 'disposition'],
      submitLabel: 'Begin the season',
      build(answers) {
        const name = answerText(answers, 'character_name');
        const race = answerText(answers, 'race');
        const ship = answerText(answers, 'ship_name');
        const disposition = answerText(answers, 'disposition');
        if (!name || !race || !ship || !disposition) return null;
        const scores: Record<string, number> = {};
        for (const a of abilities) {
          const v = answerNumber(answers, `score.${a.code}`);
          if (v !== null && v > 0) scores[a.code] = v;
        }
        if (Object.keys(scores).length === 0) return null;
        return { ...move.move, character_name: name, race, ship_name: ship, scores, ...(disposition !== 'none' ? { disposition } : {}) };
      },
    };
  },

  diceFor(event) {
    const m = event.engineMove;
    const dice = m && Array.isArray(m['dice']) ? m['dice'] : null;
    if (dice) return dice.map((d) => asNum(d)).filter((n) => n > 0);
    const found = /rolled?\s+(\d(?:\s*[,+]\s*\d)*)/i.exec(event.summary);
    if (!found) return null;
    return found[1]!.split(/[,+]/).map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 6);
  },
};

export default warbleWayGlue;
