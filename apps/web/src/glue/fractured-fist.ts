// Fractured Fist glue — two tableaux, two hands, two decks, two discards,
// a played row; plus each player's own supply. Shape per
// docs/games/fractured-fist.md and the engine's views.ts:
//   view = {
//     phase, round, active_player_id, player_order, players_done_this_round,
//     players: { [pid]: { kind, stamina, max_stamina, deck_size, hand_size,
//       discard_size, discard?, played: string[], damage_queued,
//       defense_queued, actions, channels, spirit, refine_pending,
//       misstep_count, starting_hand_size, focus_reloads_this_turn,
//       supply: { [cardId]: count },
//       hand?: string[],  // this seat only
//     } },
//     winners, scores, result_summary
//   }
// Legal moves carry move.type: play_card | refine_card | skip_refine |
// focus_reload | advance_phase | end_turn | buy_card; play_card carries
// hand_index, buy_card carries card_id.

import type { CardData, TablePlan, Zone } from './zoneData';
import type { GlueModule, GlueInput } from './types';
import { asArr, asNum, asStr, isObj, shapeHas } from './types';
import type { LegalMove, SelectEvent } from './primitiveTree';

const PALETTE = {
  masters: '#d63031',
  uncounted: '#0984e3',
  titan: '#fdcb6e',
  awakened: '#00b894',
  spirit: '#e6a23c',
  stamina: '#c0392b',
} as const;

const CARDS: Record<string, { name: string; type: string; cost: number }> = {
  focus: { name: 'Focus', type: 'RESOURCE', cost: 0 },
  momentum: { name: 'Momentum', type: 'RESOURCE', cost: 3 },
  mastery: { name: 'Mastery', type: 'RESOURCE', cost: 6 },
  misstep: { name: 'Misstep', type: 'MISSTEP', cost: 0 },
  attack: { name: 'Attack', type: 'TECHNIQUE', cost: 4 },
  block: { name: 'Block', type: 'TECHNIQUE', cost: 3 },
  react: { name: 'React', type: 'TECHNIQUE', cost: 3 },
  quicken: { name: 'Quicken', type: 'TECHNIQUE', cost: 2 },
  center: { name: 'Center', type: 'TECHNIQUE', cost: 2 },
  distract: { name: 'Distract', type: 'TECHNIQUE', cost: 3 },
  assess: { name: 'Assess', type: 'TECHNIQUE', cost: 2 },
};

function cardName(id: string): string {
  return CARDS[id]?.name ?? id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function cardData(id: string, uniqueKey: string, faceDown = false): CardData {
  const def = CARDS[id];
  return {
    id: uniqueKey,
    title: def?.name ?? cardName(id),
    subtitle: faceDown ? undefined : def ? `${def.type} · cost ${def.cost}` : undefined,
    colorKey: def ? typeColor(def.type) : undefined,
    faceDown,
  };
}

function typeColor(t: string): string {
  if (t === 'RESOURCE') return 'spirit';
  if (t === 'TECHNIQUE') return 'uncounted';
  return 'masters';
}

/** The hand ids are the part ids play_card moves light up on: hand:<idx>. */
function handZone(p: Record<string, unknown>, zonePrefix: string): Zone {
  const hand = asArr(p['hand']);
  const handSize = asNum(p['hand_size'], hand.length);
  let cards: CardData[];
  if (hand.length > 0) {
    cards = hand.map((id, i) => cardData(asStr(id), `${zonePrefix}:hand:${i}`));
  } else {
    // Opponent's hand: face-down backs by count.
    cards = Array.from({ length: handSize }, (_, i) => ({
      id: `${zonePrefix}:hand:${i}`,
      title: 'card',
      faceDown: true,
    }));
  }
  return {
    kind: 'card-zone',
    label: `Hand (${handSize})`,
    data: { id: `${zonePrefix}:hand`, kind: 'fan', cards },
  };
}

function playerZone(pid: string, p: Record<string, unknown>, isSelf: boolean): Zone[] {
  const prefix = `p:${pid}`;
  const played = asArr(p['played']).map((id, i) =>
    cardData(asStr(id), `${prefix}:played:${i}`),
  );
  const discardTop = asArr(p['discard']).at(-1);
  const supply = isObj(p['supply']) ? p['supply'] : {};
  const supplyCards: CardData[] = Object.entries(supply).map(([id, count]) => ({
    id: `${prefix}:supply:${id}`,
    title: cardName(id),
    subtitle: `×${asNum(count)} left`,
    count: asNum(count),
  }));

  const tableau: Zone = {
    kind: 'tableau',
    label: `${isSelf ? 'You' : 'Opponent'} — ${asStr(p['kind'], 'player')}`,
    data: {
      id: `${prefix}:tableau`,
      colorKey: isSelf ? 'awakened' : 'masters',
      stats: {
        stamina: `${asNum(p['stamina'])}/${asNum(p['max_stamina'], 7)}`,
        damage: asNum(p['damage_queued']),
        defense: asNum(p['defense_queued']),
        actions: asNum(p['actions']),
        channels: asNum(p['channels']),
        spirit: asNum(p['spirit']),
        missteps: `${asNum(p['misstep_count'])}/10`,
      },
      zones: [],
    },
  };

  const deckDiscard: Zone = {
    kind: 'card-zone',
    label: 'Deck & discard',
    data: {
      id: `${prefix}:piles`, kind: 'row',
      cards: [
        { id: `${prefix}:deck`, title: 'Deck', count: asNum(p['deck_size']), faceDown: true },
        {
          id: `${prefix}:discard`, title: 'Discard',
          subtitle: discardTop ? `top: ${cardName(asStr(discardTop))}` : `×${asNum(p['discard_size'])}`,
          count: asNum(p['discard_size']),
        },
      ],
    },
  };

  const playedRow: Zone = {
    kind: 'card-zone',
    label: 'Played this round',
    data: { id: `${prefix}:played`, kind: 'row', cards: played },
  };

  const supplyZone: Zone = {
    kind: 'card-zone',
    label: 'Supply',
    data: { id: `${prefix}:supply`, kind: 'row', cards: supplyCards },
  };

  return [tableau, handZone(p, prefix), deckDiscard, playedRow, supplyZone];
}

function selfPid(view: Record<string, unknown>, legalMoves: LegalMove[]): string | undefined {
  // The player whose view carries a private hand is us; fall back to the
  // active player when moves exist for them.
  const players = isObj(view['players']) ? view['players'] : {};
  for (const [pid, p] of Object.entries(players)) {
    if (isObj(p) && Array.isArray(p['hand'])) return pid;
  }
  if (legalMoves.length > 0) return asStr(view['active_player_id']) || undefined;
  return undefined;
}

export const fracturedFistGlue: GlueModule = {
  gameId: 'fractured-fist',

  plan(input: GlueInput): TablePlan | null {
    const { view, legalMoves } = input;
    if (!shapeHas(view, 'players', 'phase', 'player_order')) return null;
    const players = view['players'];
    if (!isObj(players)) return null;
    const prev = input.previous;
    const prevPlayers = isObj(prev) && isObj(prev['players']) ? prev['players'] : {};
    const me = selfPid(view, legalMoves);
    const order = asArr(view['player_order']).map((x) => asStr(x));

    const bench: Zone[] = [];
    const side: Zone[] = [];
    for (const pid of order) {
      const p = players[pid];
      if (!isObj(p)) continue;
      const zones = playerZone(pid, p, pid === me);
      const prevP = isObj(prevPlayers[pid]) ? (prevPlayers[pid] as Record<string, unknown>) : undefined;
      if (prevP) {
        const prevZones = playerZone(pid, prevP, pid === me);
        zones.forEach((z, i) => { z.previous = prevZones[i]?.data; });
      }
      if (pid === me) bench.push(...zones);
      else side.push(...zones);
    }

    const board: Zone[] = [{
      kind: 'track',
      label: 'Round',
      data: {
        id: 'ff:round', length: 20,
        markers: { round: asNum(view['round'], 1) - 1 },
        colorKey: 'titan',
      },
    }];

    return {
      board, bench, side,
      palette: PALETTE,
      title: 'Fractured Fist',
    };
  },

  litParts(view: unknown, legalMoves: LegalMove[]): string[] {
    if (!shapeHas(view, 'players')) return [];
    const lit: string[] = [];
    const me = selfPid(view, legalMoves);
    const prefix = me ? `p:${me}` : '';
    for (const m of legalMoves) {
      const t = asStr(m.move['type']);
      if (t === 'play_card' && typeof m.move['hand_index'] === 'number') {
        lit.push(`${prefix}:hand:${m.move['hand_index']}`);
      } else if (t === 'refine_card' && typeof m.move['hand_index'] === 'number') {
        lit.push(`${prefix}:hand:${m.move['hand_index']}`);
      } else if (t === 'buy_card') {
        lit.push(`${prefix}:supply:${asStr(m.move['card_id'])}`);
      }
      // Phase moves (advance, end, reload, skip) appear only in the numbered
      // menu — they decide the flow, and the player names them by number.
    }
    return lit;
  },

  moveForSelect(sel: SelectEvent, legalMoves: LegalMove[]): LegalMove | null {
    const hand = /hand:(\d+)$/.exec(sel.id);
    if (hand) {
      const idx = Number(hand[1]);
      return (
        legalMoves.find((m) => m.move['type'] === 'play_card' && m.move['hand_index'] === idx) ??
        legalMoves.find((m) => m.move['type'] === 'refine_card' && m.move['hand_index'] === idx) ??
        null
      );
    }
    const supply = /supply:([a-z0-9_-]+)$/i.exec(sel.id);
    if (supply) {
      return legalMoves.find((m) => m.move['type'] === 'buy_card' && m.move['card_id'] === supply[1]) ?? null;
    }
    return null;
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },
};

export default fracturedFistGlue;
