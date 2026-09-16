// Fractured Fist glue: two tableaux, two hands, two decks, two discards, a
// played row, and each player's own supply. The view shape is the engine's
// (zekel src/games/fractured-fist/views.ts):
//   view = {
//     phase, round, active_player_id, player_order, players_done_this_round,
//     players: { [pid]: { kind, stamina, max_stamina, deck_size, hand_size,
//       discard_size, discard?, played: string[], damage_queued,
//       defense_queued, actions, channels, spirit, refine_pending,
//       misstep_count, starting_hand_size, focus_reloads_this_turn,
//       supply: { [cardId]: count },
//       hand?: string[], deck_count_by_card?   // this seat only
//     } },
//     winners, scores, result_summary
//   }
// Card names, types, costs and effects come from the engine's reference data
// (get_rules), never from a table here. The misstep cap is
// reference_data.max_missteps; max stamina is on the view.

import type { CardData, TrackData } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import type { GlueModule, GlueInput, LegalMove, SelectEvent, SetupField, TablePlan, Zone } from './types';
import { asArr, asNum, asStr, isObj, shapeHas, words } from './types';
import { trackIdentities, type IdentityState } from './identity';

const PALETTE: Record<string, string> = {
  resource: '#e6a23c',
  technique: '#3f7cc9',
  misstep: '#8a8578',
  'masters-circle': '#d63031',
  uncounted: '#0984e3',
  'titan-entertainment': '#c9a227',
  'the-awakened': '#00b894',
  you: '#3E7C4F',
  opponent: '#b4452f',
  round: '#E8862E',
};

interface CardDef { id: string; name: string; type: string; cost: number; value?: number; description?: string; faction?: string }

function cardDefs(reference: GameReferenceResponse | null): Map<string, CardDef> {
  const rd = reference?.referenceData;
  const out = new Map<string, CardDef>();
  if (isObj(rd) && Array.isArray(rd['cards'])) {
    for (const c of rd['cards']) {
      if (isObj(c) && typeof c['id'] === 'string') {
        out.set(c['id'], {
          id: c['id'], name: asStr(c['name'], words(c['id'])), type: asStr(c['type']), cost: asNum(c['cost']),
          value: typeof c['value'] === 'number' ? c['value'] : undefined,
          description: asStr(c['description']) || undefined, faction: asStr(c['faction']) || undefined,
        });
      }
    }
  }
  return out;
}

function maxMissteps(reference: GameReferenceResponse | null): number | null {
  const rd = reference?.referenceData;
  return isObj(rd) && typeof rd['max_missteps'] === 'number' ? rd['max_missteps'] : null;
}

function colorKeyFor(def: CardDef | undefined): string | undefined {
  if (!def) return undefined;
  if (def.faction) return def.faction.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return def.type.toLowerCase();
}

function cardData(cardId: string, instance: string, defs: Map<string, CardDef>, face: 'up' | 'down' = 'up'): CardData {
  const def = defs.get(cardId);
  const badges: string[] = [];
  if (def?.cost !== undefined && def.type !== 'MISSTEP') badges.push(`cost ${def.cost}`);
  if (def?.value !== undefined) badges.push(`${def.value} spirit`);
  // A short effect line fits on the card; a long rule text does not, so it
  // stays as the card's tooltip and the type shows instead.
  const description = def?.description ?? '';
  const subtitle = description && description.length <= 40 ? description : (def ? words(def.type.toLowerCase()) : undefined);
  return {
    id: instance,
    label: def?.name ?? words(cardId),
    subtitle,
    colorKey: colorKeyFor(def) ?? 'technique',
    badges,
    face,
  };
}

const ZONES = ['hand', 'played', 'discard'] as const;

type Contents = { hand: string[]; played: string[]; discard: string[] };

function contentsOf(p: Record<string, unknown>): Contents {
  return {
    hand: asArr(p['hand']).map((x) => asStr(x)),
    played: asArr(p['played']).map((x) => asStr(x)),
    discard: asArr(p['discard']).map((x) => asStr(x)),
  };
}

/** Instance ids for one player's cards, carried across events in memory. */
function identitiesFor(pid: string, p: Record<string, unknown>, input: GlueInput, opponentPid: string | null): IdentityState {
  const key = `ff:identity:${pid}`;
  const cached = input.memory.get(key) as { seq: number; state: IdentityState; base: IdentityState | null } | undefined;
  if (cached && cached.seq === input.seq) return cached.state;
  // The state before this event is the one computed for the previous event.
  const base = cached ? (cached.seq < input.seq ? cached.state : cached.base) : null;
  const move = input.engineMove;
  const movedFrom = move && input.actorPlayerId === pid && typeof move['hand_index'] === 'number'
    && (move['type'] === 'play_card' || move['type'] === 'refine_card')
    ? { zone: 'hand', index: move['hand_index'] as number }
    : undefined;
  const prefix = `p:${pid}`;
  // Cleanups: end_turn sends the actor's whole hand to the discard; a new
  // round means the strike swept every played row into its discard.
  const clearedZones: string[] = [];
  if (move && move['type'] === 'end_turn' && input.actorPlayerId === pid) clearedZones.push('hand');
  if (isObj(input.previous) && isObj(input.view) && asNum(input.previous['round']) < asNum(input.view['round'])) clearedZones.push('played');
  const state = trackIdentities(prefix, base, contentsOf(p), {
    movedFrom,
    clearedZones,
    sources: {
      hand: `${prefix}:deck`,
      // Bought cards land in the discard from the own supply; pushed Missteps
      // come from the opponent's supply. Both fly from a supply.
      discard: `${prefix}:supply`,
      played: `${prefix}:hand`,
    },
  });
  // Missteps arriving in the discard came from the opponent.
  if (opponentPid) {
    for (const [inst, from] of Object.entries(state.arrivals)) {
      if (from === `${prefix}:supply` && inst.includes('|misstep#')) state.arrivals[inst] = `p:${opponentPid}:supply:misstep`;
    }
  }
  input.memory.set(key, { seq: input.seq, state, base });
  return state;
}

function playerZones(pid: string, p: Record<string, unknown>, isSelf: boolean, input: GlueInput, defs: Map<string, CardDef>, opponentPid: string | null, active: boolean, missCap: number | null) {
  const prefix = `p:${pid}`;
  const ids = identitiesFor(pid, p, input, opponentPid);
  const contents = contentsOf(p);
  const instance = (zone: (typeof ZONES)[number], i: number) => ids.zones[zone]?.[i] ?? `${prefix}:${zone}:${i}`;
  const arrive = (inst: string) => ids.arrivals[inst];

  const stats: NonNullable<import('@universe/primitives').TableauData['stats']> = [
    { label: 'Stamina', value: asNum(p['stamina']), max: asNum(p['max_stamina']) || undefined },
    { label: 'Damage queued', value: asNum(p['damage_queued']) },
    { label: 'Defense queued', value: asNum(p['defense_queued']) },
    { label: 'Actions', value: asNum(p['actions']) },
    { label: 'Channels', value: asNum(p['channels']) },
    { label: 'Spirit', value: asNum(p['spirit']) },
  ];
  if (asNum(p['refine_pending']) > 0) stats.push({ label: 'Refines pending', value: asNum(p['refine_pending']) });
  stats.push({ label: 'Missteps', value: asNum(p['misstep_count']), max: missCap ?? undefined });

  const tableau: Zone = {
    kind: 'tableau', id: `${prefix}:tableau`,
    data: { label: isSelf ? 'You' : 'Opponent', owner: isSelf ? 'you' : 'opponent', active, activeLabel: isSelf ? 'your turn' : 'their turn', stats },
  };

  const handCards: CardData[] = contents.hand.length > 0
    ? contents.hand.map((cid, i) => cardData(cid, instance('hand', i), defs))
    : Array.from({ length: asNum(p['hand_size']) }, (_, i) => ({ id: `${prefix}:hand:back:${i}`, label: 'card', face: 'down' as const }));
  const hand: Zone = {
    kind: 'card-zone', id: `${prefix}:hand`, arriveFrom: `${prefix}:deck`,
    data: { label: `Hand (${asNum(p['hand_size'], contents.hand.length)})`, mode: 'fan', cards: handCards },
  };
  const deck: Zone = {
    kind: 'card-zone', id: `${prefix}:deck`,
    data: { label: 'Deck', mode: 'pile', countOnly: asNum(p['deck_size']) },
  };
  const discardCards = contents.discard.map((cid, i) => cardData(cid, instance('discard', i), defs));
  const discard: Zone = {
    kind: 'card-zone', id: `${prefix}:discard`, arriveFrom: `${prefix}:supply`,
    data: contents.discard.length > 0 || asNum(p['discard_size']) === 0
      ? { label: 'Discard', mode: 'pile', cards: discardCards }
      : { label: 'Discard', mode: 'pile', countOnly: asNum(p['discard_size']) },
  };
  const played: Zone = {
    kind: 'card-zone', id: `${prefix}:played`, arriveFrom: `${prefix}:hand`,
    data: { label: `${isSelf ? 'Your' : "Opponent's"} played cards`, mode: 'row', cards: contents.played.map((cid, i) => cardData(cid, instance('played', i), defs)) },
  };
  const supply = isObj(p['supply']) ? p['supply'] : {};
  const supplyCards: CardData[] = Object.entries(supply).map(([cid, count]) => ({
    ...cardData(cid, `${prefix}:supply:${cid}`, defs),
    count: asNum(count),
  }));
  const supplyZone: Zone = {
    kind: 'card-zone', id: `${prefix}:supply`,
    data: { label: `${isSelf ? 'Your' : "Opponent's"} supply`, mode: 'row', cards: supplyCards },
  };
  return { tableau, hand, deck, discard, played, supply: supplyZone, ids };
}

function selfPid(input: GlueInput, view: Record<string, unknown>): string | null {
  if (input.playerId) return input.playerId;
  const players = isObj(view['players']) ? view['players'] : {};
  for (const [pid, p] of Object.entries(players)) if (isObj(p) && Array.isArray(p['hand'])) return pid;
  return null;
}

export const fracturedFistGlue: GlueModule = {
  gameId: 'fractured-fist',
  title: 'Fractured Fist',

  plan(input: GlueInput): TablePlan | null {
    const { view } = input;
    if (!shapeHas(view, 'players', 'phase', 'player_order')) return null;
    const players = view['players'];
    if (!isObj(players)) return null;
    const defs = cardDefs(input.reference);
    const missCap = maxMissteps(input.reference);
    const me = selfPid(input, view);
    const order = asArr(view['player_order']).map((x) => asStr(x));
    const activePid = asStr(view['active_player_id']);

    const bench: Zone[] = [];
    const side: Zone[] = [];
    const board: Zone[] = [];
    for (const pid of order) {
      const p = players[pid];
      if (!isObj(p)) continue;
      const isSelf = pid === me;
      const opponent = order.find((x) => x !== pid) ?? null;
      const z = playerZones(pid, p, isSelf, input, defs, opponent, pid === activePid, missCap);
      // Both supplies sit near the centre so both are readable; each is
      // still its owner's (docs/games/fractured-fist.md, the shared area).
      board.push(z.played, z.supply);
      if (isSelf) {
        bench.push(z.hand, z.deck, z.discard);
        side.push(z.tableau);
      } else {
        side.push(z.tableau, z.hand, z.deck, z.discard);
      }
    }

    const phase = asStr(view['phase']);
    const phaseTrack: TrackData = {
      label: `Round ${asNum(view['round'], 1)} · ${activePid === me ? 'your turn' : activePid ? `${words(activePid)}'s turn` : ''}`,
      spaces: [
        { index: 'technique', label: 'Technique', filled: phase === 'technique' },
        { index: 'channel', label: 'Channel', filled: phase === 'channel' },
        { index: 'cleanup', label: 'Cleanup', filled: phase === 'cleanup' },
      ],
      markers: activePid ? [{ label: activePid === me ? 'you' : 'them', colorKey: activePid === me ? 'you' : 'opponent', at: phase }] : [],
    };
    board.unshift({ kind: 'track', id: 'ff:phase', data: phaseTrack });

    const status = `Round ${asNum(view['round'], 1)} · ${words(phase)} phase`;
    return { board, bench, side, palette: PALETTE, title: 'Fractured Fist', status };
  },

  litParts(input: GlueInput): string[] {
    const { view, legalMoves } = input;
    if (!shapeHas(view, 'players')) return [];
    const me = selfPid(input, view);
    if (!me) return [];
    const players = isObj(view['players']) ? view['players'] : {};
    const p = isObj(players[me]) ? (players[me] as Record<string, unknown>) : null;
    if (!p) return [];
    const opponent = asArr(view['player_order']).map((x) => asStr(x)).find((x) => x !== me) ?? null;
    const ids = identitiesFor(me, p, input, opponent);
    const lit: string[] = [];
    for (const m of legalMoves) {
      const t = asStr(m.move['type']);
      if ((t === 'play_card' || t === 'refine_card') && typeof m.move['hand_index'] === 'number') {
        const inst = ids.zones['hand']?.[m.move['hand_index']];
        if (inst) lit.push(inst);
      } else if (t === 'play_card' && typeof m.move['card_id'] === 'string') {
        // An opaque seat lists plays by card id only; light every copy.
        const hand = asArr(p['hand']).map((x) => asStr(x));
        hand.forEach((cid, i) => { if (cid === m.move['card_id']) { const inst = ids.zones['hand']?.[i]; if (inst) lit.push(inst); } });
      } else if (t === 'buy_card') {
        lit.push(`p:${me}:supply:${asStr(m.move['card_id'])}`);
      }
      // Phase moves (advance, end, reload, skip) appear only in the numbered
      // menu: they decide the flow, and the player names them by number.
    }
    return [...new Set(lit)];
  },

  moveForSelect(sel: SelectEvent, input: GlueInput): LegalMove | null {
    const { view, legalMoves } = input;
    if (!shapeHas(view, 'players')) return null;
    const me = selfPid(input, view);
    if (!me) return null;
    const players = isObj(view['players']) ? view['players'] : {};
    const p = isObj(players[me]) ? (players[me] as Record<string, unknown>) : null;
    if (!p) return null;
    const supply = new RegExp(`^p:${me}:supply:([a-z0-9_-]+)$`, 'i').exec(sel.id);
    if (supply) {
      return legalMoves.find((m) => m.move['type'] === 'buy_card' && m.move['card_id'] === supply[1]) ?? null;
    }
    const opponent = asArr(view['player_order']).map((x) => asStr(x)).find((x) => x !== me) ?? null;
    const ids = identitiesFor(me, p, input, opponent);
    const idx = (ids.zones['hand'] ?? []).indexOf(sel.id);
    if (idx < 0) return null;
    const cardId = asArr(p['hand']).map((x) => asStr(x))[idx];
    return (
      legalMoves.find((m) => m.move['type'] === 'play_card' && m.move['hand_index'] === idx) ??
      legalMoves.find((m) => m.move['type'] === 'refine_card' && m.move['hand_index'] === idx) ??
      legalMoves.find((m) => m.move['type'] === 'play_card' && m.move['hand_index'] === undefined && m.move['card_id'] === cardId) ??
      null
    );
  },

  resolveReportMove(legalMoves: LegalMove[]): LegalMove | null {
    return legalMoves.find((m) => m.move['type'] === 'resolve_report') ?? null;
  },

  setupFields(reference: GameReferenceResponse): SetupField[] {
    // The loadout is a printed-rules decision: the seven techniques in play.
    // The engine's options schema names the option; its reference data
    // lists every technique. The player picks; nothing is preselected.
    const schema = reference.optionsSchema;
    const props = isObj(schema) && isObj(schema['properties']) ? schema['properties'] : {};
    if (!('loadout' in props)) return [];
    const techniques = [...cardDefs(reference).values()].filter((c) => c.type === 'TECHNIQUE');
    if (techniques.length === 0) return [];
    const loadoutSchema = isObj(props['loadout']) ? props['loadout'] : {};
    const help = asStr(loadoutSchema['description']).split('.').slice(0, 1).join('.') || undefined;
    return [{
      key: 'loadout',
      label: 'Choose the 7 techniques in play',
      help,
      kind: 'multi',
      pick: 7,
      options: techniques.map((c) => ({
        value: c.id,
        label: c.name,
        hint: `cost ${c.cost}${c.description ? ` · ${c.description}` : ''}${c.faction ? ` · ${c.faction}` : ''}`,
      })),
    }];
  },
};

export default fracturedFistGlue;
