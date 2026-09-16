// Warble Way Galaxy glue — character tableau, crew row, ship tableau,
// tracks for XP/level and ship damage, credits pool, travel deck pile,
// ruin grid. Solo with no hidden zones; the doc mapping (docs/games/
// warble-way-galaxy.md) is the contract, and view.ts is the shape:
//   view = { phase, pending, character {…abilities…credits…}, crew[],
//     ship {damage…parts}, items[], habit t, journey {legs}, space_combat,
//     ruin { board_rows, party, attackers } , travel_deck, result, … }

import type { CardData, TablePlan, Zone } from './zoneData';
import type { GlueModule, GlueInput } from './types';
import { asArr, asNum, asStr, isObj, shapeHas } from './types';
import type { LegalMove, SelectEvent } from './primitiveTree';

const PALETTE: Record<string, string> = {
  ship: '#4a6fa5',
  character: '#5fa873',
  crew: '#7a5fa8',
  danger: '#b4452f',
  credits: '#e6a23c',
  wall: '#2b2620',
  pit: '#8a8578',
};

const DAMAGE_STEPS = ['P', 'U', 'D', 'H']; // Pristine, Used, Damaged, Hobbled

function damageIndex(step: unknown): number {
  const s = asStr(step).toUpperCase();
  return Math.max(0, DAMAGE_STEPS.findIndex((d) => s.startsWith(d)));
}

function crewCard(c: unknown, i: number): CardData {
  if (!isObj(c)) return { id: `ww:crew:${i}`, title: 'crew' };
  const anger = asNum(c['anger_tokens']);
  return {
    id: `ww:crew:${i}`,
    title: asStr(c['name'], 'crew'),
    subtitle: `${asStr(c['race'])}${anger > 0 ? ` · anger ×${anger}` : ''}`,
    colorKey: 'crew',
  };
}

/** Parse the ruin board_rows ("row 3: # . . S …") into grid cells. */
function ruinGrid(ruin: Record<string, unknown>): Zone | null {
  const rows = asArr(ruin['board_rows']);
  if (rows.length === 0) return null;
  const cells: { x: number; y: number; occupant?: string; colorKey?: string; label?: string }[] = [];
  const glyphColor: Record<string, string> = { '#': 'wall', '~': 'pit' };
  rows.forEach((r, y) => {
    const glyphs = asStr(r).replace(/^row \d+:\s*/, '').split(/\s+/);
    glyphs.forEach((g, x) => {
      if (g === '.') return;
      const cell: { x: number; y: number; occupant?: string; colorKey?: string; label?: string } = { x, y };
      if (glyphColor[g]) cell.colorKey = glyphColor[g];
      else if (/^[a-z0-9]$/i.test(g)) cell.occupant = g; // party digits, attacker letters
      else cell.label = g; // S G I B A icons
      cells.push(cell);
    });
  });
  return {
    kind: 'grid',
    label: `Ruin ${asStr(ruin['map'])} — round ${asNum(ruin['round'], 1)}`,
    data: { id: 'ww:ruin', width: 9, height: 9, cells },
  };
}

export const warbleWayGlue: GlueModule = {
  gameId: 'warble-way-galaxy',

  plan(input: GlueInput): TablePlan | null {
    const { view } = input;
    if (!shapeHas(view, 'phase')) return null;
    if (!('travel_deck' in view) && !('character' in view) && !('ship' in view)) return null;
    void input.legalMoves;

    const char = isObj(view['character']) ? view['character'] : null;
    const ship = isObj(view['ship']) ? view['ship'] : null;
    const travel = isObj(view['travel_deck']) ? view['travel_deck'] : null;
    const journey = isObj(view['journey']) ? view['journey'] : null;
    const ruin = isObj(view['ruin']) ? (view['ruin'] as Record<string, unknown>) : null;

    const bench: Zone[] = [];
    if (char) {
      const abilities = isObj(char['abilities']) ? char['abilities'] : {};
      bench.push({
        kind: 'tableau',
        label: `${asStr(char['name'], 'You')} — level ${asNum(char['level'], 1)}`,
        data: {
          id: 'ww:character', colorKey: 'character',
          stats: {
            credits: asNum(char['credits']),
            xp: asNum(char['xp']),
            xpToNext: asNum(char['xp_to_next_level']),
            wounded: char['wounded'] ? 'yes' : 'no',
            dread: asNum(char['dread']),
            ...Object.fromEntries(
              Object.entries(abilities).map(([k, v]) => [
                k.toUpperCase(),
                isObj(v) ? asNum(v['effective'], asNum(v['natural'])) : asNum(v),
              ]),
            ),
          },
          zones: [],
        },
      });
    }
    const crew = asArr(view['crew']);
    if (crew.length > 0 || asNum(view['unnamed_crew']) > 0) {
      bench.push({
        kind: 'card-zone',
        label: `Crew (${crew.length}/${asNum(ship?.['capacity'], 5)})${asNum(view['unnamed_crew']) ? ` +${asNum(view['unnamed_crew'])} bodies` : ''}`,
        data: { id: 'ww:crew', kind: 'row', cards: crew.map(crewCard) },
      });
    }
    const items = asArr(view['items']);
    if (items.length > 0) {
      bench.push({
        kind: 'card-zone',
        label: 'Items',
        data: {
          id: 'ww:items', kind: 'fan',
          cards: items.map((it, i) => {
            const o = isObj(it) ? it : {};
            return {
              id: asStr(o['id'], `ww:item:${i}`),
              title: asStr(o['name'], 'item'),
              subtitle: `${asStr(o['type'])}${o['consumed'] ? ' · used' : ''}`,
            };
          }),
        },
      });
    }

    const board: Zone[] = [];
    if (ship) {
      board.push({
        kind: 'track',
        label: `Ship: ${asStr(ship['name'], 'ship')} — damage`,
        data: {
          id: 'ww:damage', length: 4,
          markers: { ship: damageIndex(ship['damage']) },
          colorKey: 'ship',
        },
      });
    }
    if (char) {
      board.push({
        kind: 'track',
        label: `Level ${asNum(char['level'], 1)} (pips at 6/12/24/48 XP)`,
        data: {
          id: 'ww:xp', length: 48,
          markers: { xp: Math.min(47, asNum(char['xp'])) },
          colorKey: 'character',
        },
      });
      board.push({
        kind: 'pool',
        label: 'Credits (−300 cliff · 6,000 finish)',
        data: { id: 'ww:credits', tokens: { credits: asNum(char['credits']) } },
      });
    }
    if (travel) {
      board.push({
        kind: 'card-zone',
        label: 'Travel deck',
        data: {
          id: 'ww:travel', kind: 'row',
          cards: [
            { id: 'ww:draw', title: 'Draw pile', count: asNum(travel['cards_in_draw_pile']), faceDown: true },
            {
              id: 'ww:discard', title: 'Discard',
              subtitle: asArr(travel['discard']).length ? `top: ${asStr(asArr(travel['discard']).at(-1))}` : undefined,
              count: asNum(travel['cards_in_discard']),
            },
          ],
        },
      });
    }
    if (journey && asArr(journey['legs']).length > 0) {
      const legs = asArr(journey['legs']);
      board.push({
        kind: 'tableau',
        label: 'Journey',
        data: {
          id: 'ww:journey', colorKey: 'ship',
          stats: Object.fromEntries(
            legs.map((l, i) => {
              const o = isObj(l) ? l : {};
              return [`leg ${i + 1}`, `${asStr(o['position'])}: ${asNum(o['cards_remaining'])} cards left`];
            }),
          ),
          zones: [],
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
        kind: 'track',
        label: `Galaxy — you are at Habitat #${asNum(habitat['number'], 1)} ${asStr(habitat['name'])}`,
        data: {
          id: 'ww:galaxy', length: 3,
          markers: { you: asNum(habitat['number'], 1) - 1 },
          colorKey: 'character',
        },
      });
    }

    return { board, bench, side: [], palette: PALETTE, title: 'Warble Way Galaxy' };
  },

  litParts(_view: unknown, legalMoves: LegalMove[]): string[] {
    const lit: string[] = [];
    for (const m of legalMoves) {
      const t = asStr(m.move['type']);
      // Items that can be used/equipped light up by item id.
      const itemId = m.move['item_id'];
      if ((t === 'use_item' || t === 'equip') && typeof itemId === 'string') lit.push(itemId);
      // Ruin cell moves light the destination cell.
      const cell = m.move['to_cell'] ?? m.move['cell'];
      if (typeof cell === 'string') lit.push(`ww:ruin:${cell}`);
    }
    return lit;
  },

  moveForSelect(sel: SelectEvent, legalMoves: LegalMove[]): LegalMove | null {
    return (
      legalMoves.find((m) => sel.id === (m.move['item_id'] as string)) ??
      legalMoves.find((m) => sel.id === `ww:ruin:${asStr(m.move['to_cell'] ?? m.move['cell'])}`) ??
      null
    );
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },
};

export default warbleWayGlue;
