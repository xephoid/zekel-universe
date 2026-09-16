// Warble Way Galaxy glue: the character tableau, the crew row, the ship,
// items, the travel deck pile, the ruin grid, and the journey. Solo with no
// hidden zones (zekel src/games/warble-way-galaxy/views.ts). Every number
// shown comes from the view: crew capacity from ship.capacity, level
// progress from xp_to_next_level, the season finish lines from
// season_endings. Nothing here knows a threshold.

import type { CardData, GridData, TableauData } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import type { GlueModule, GlueInput, LegalMove, SelectEvent, SetupField, TablePlan, Zone } from './types';
import { asArr, asNum, asStr, isObj, shapeHas, words } from './types';

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

  setupFields(_reference: GameReferenceResponse): SetupField[] {
    // Character creation is a checklist step the engine offers as legal
    // moves once the session exists; the table presents it there.
    return [];
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
