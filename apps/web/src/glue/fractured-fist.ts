// Fractured Fist glue, after docs/design/Fractured Fist Table.dc.html and
// docs/games/fractured-fist-build.md: the two played rows with the strike
// gutter between them, one supply shelf carrying both players' counts, the
// counters scoped to the step that can change them, an action bar holding
// the moves that move the turn, and the strike as a moment. The view shape
// is the engine's (zekel src/games/fractured-fist/views.ts):
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
// Card names, types, costs, values, effects and factions come from the
// engine's reference data (get_rules), never from a table here. The misstep
// cap is reference_data.max_missteps; max stamina is on the view; the
// default loadout is reference_data.starter_loadout. The engine resolves
// every draw inside the move that causes it and lists no draw step, so the
// deck never lights up here (fractured-fist-build.md, the open question).

import type { CardData, PoolData } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import type {
  GlueModule, GlueInput, LegalMove, Moment, MomentInput, PlanPrompt, PlanStep, PromptAction, SelectEvent, SetupField, TablePlan, Zone, SetupSeat,
} from './types';
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
  damage: '#b3261e',
  defense: '#24507f',
};

/** The printed word for each effect key the engine's reference data uses. */
const EFFECT_WORDS: Record<string, string> = {
  damage: 'Damage', defense: 'Defense', actions: 'Tech', draw: 'Draw', spirit: 'Spirit',
  channels: 'Channel', refine: 'Refine', add_misstep: 'Missteps', heal: 'Heal',
};
const EFFECT_ORDER = Object.keys(EFFECT_WORDS);

interface CardDef {
  id: string; name: string; type: string; cost: number; value?: number; description?: string; faction?: string;
  effects: Record<string, number>;
}

function cardDefs(reference: GameReferenceResponse | null): Map<string, CardDef> {
  const rd = reference?.referenceData;
  const out = new Map<string, CardDef>();
  if (isObj(rd) && Array.isArray(rd['cards'])) {
    for (const c of rd['cards']) {
      if (isObj(c) && typeof c['id'] === 'string') {
        const effects: Record<string, number> = {};
        if (isObj(c['effects'])) {
          for (const [k, v] of Object.entries(c['effects'])) if (typeof v === 'number' && v > 0) effects[k] = v;
        }
        out.set(c['id'], {
          id: c['id'], name: asStr(c['name'], words(c['id'])), type: asStr(c['type']), cost: asNum(c['cost']),
          value: typeof c['value'] === 'number' ? c['value'] : undefined,
          description: asStr(c['description']) || undefined, faction: asStr(c['faction']) || undefined,
          effects,
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

function starterLoadout(reference: GameReferenceResponse | null): string[] {
  const rd = reference?.referenceData;
  return isObj(rd) ? asArr(rd['starter_loadout']).map((x) => asStr(x)).filter(Boolean) : [];
}

/** "+2 Draw, +1 Tech" chips from the engine's effects, in the printed order. */
function effectChips(def: CardDef | undefined): string[] {
  if (!def) return [];
  return EFFECT_ORDER.filter((k) => def.effects[k]).map((k) => `+${def.effects[k]} ${EFFECT_WORDS[k]}`);
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
  if (def?.value !== undefined && def.value > 0) badges.push(`${def.value} spirit`);
  // The effects line fits on the card; the full rule text is the tooltip.
  const chips = effectChips(def);
  const subtitle = chips.length ? chips.join(', ') : def?.description && def.description.length <= 40 ? def.description : def ? words(def.type.toLowerCase()) : undefined;
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

function cardOf(instance: string): string {
  return instance.slice(instance.indexOf('|') + 1, instance.lastIndexOf('#'));
}

/** The shelf's stack for a card: the one place every copy flies from. */
function shelfCardId(shelfPid: string, cardId: string): string {
  return `p:${shelfPid}:supply:${cardId}`;
}

/** Instance ids for one player's cards, carried across events in memory. */
function identitiesFor(pid: string, p: Record<string, unknown>, input: GlueInput, shelfPid: string): IdentityState {
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
      // Bought cards and pushed Missteps both land in the discard from the
      // shelf: the stack of that card is where every copy comes from.
      discard: 'ff:supply',
      played: `${prefix}:hand`,
    },
  });
  for (const [inst, from] of Object.entries(state.arrivals)) {
    if (from === 'ff:supply') state.arrivals[inst] = shelfCardId(shelfPid, cardOf(inst));
  }
  input.memory.set(key, { seq: input.seq, state, base });
  return state;
}

type Stats = NonNullable<import('@universe/primitives').TableauData['stats']>;

/**
 * Only the counters the current step can change: actions in the technique
 * step, spirit and channels in the channel step, refines while a refine is
 * pending. Stamina and the misstep meter are about the whole game and stay.
 */
function statsFor(p: Record<string, unknown>, phase: string, active: boolean, missCap: number | null): Stats {
  const stats: Stats = [{ label: 'Stamina', value: asNum(p['stamina']), max: asNum(p['max_stamina']) || undefined }];
  if (active) {
    if (asNum(p['refine_pending']) > 0) stats.push({ label: 'Refines pending', value: asNum(p['refine_pending']) });
    if (phase === 'technique') stats.push({ label: 'Actions', value: asNum(p['actions']) });
    if (phase === 'channel') {
      stats.push({ label: 'Spirit', value: asNum(p['spirit']) });
      stats.push({ label: 'Channels', value: asNum(p['channels']) });
    }
  }
  stats.push({ label: 'Missteps', value: asNum(p['misstep_count']), max: missCap ?? undefined });
  return stats;
}

function playerZones(pid: string, p: Record<string, unknown>, isSelf: boolean, input: GlueInput, defs: Map<string, CardDef>, shelfPid: string, active: boolean, phase: string, missCap: number | null) {
  const prefix = `p:${pid}`;
  const ids = identitiesFor(pid, p, input, shelfPid);
  const contents = contentsOf(p);
  const instance = (zone: (typeof ZONES)[number], i: number) => ids.zones[zone]?.[i] ?? `${prefix}:${zone}:${i}`;

  // A watcher has no seat: the players go by their engine names then.
  const watching = input.playerId === null;
  const who = watching ? words(pid) : isSelf ? 'You' : 'Opponent';
  const whose = watching ? `${words(pid)}'s` : isSelf ? 'Your' : "Opponent's";
  const tableau: Zone = {
    kind: 'tableau', id: `${prefix}:tableau`,
    data: { label: who, owner: isSelf ? 'you' : 'opponent', active, activeLabel: isSelf ? 'your turn' : 'their turn', stats: statsFor(p, phase, active, missCap) },
  };

  const refining = isSelf && asNum(p['refine_pending']) > 0;
  const handCards: CardData[] = contents.hand.length > 0
    ? contents.hand.map((cid, i) => cardData(cid, instance('hand', i), defs))
    : Array.from({ length: asNum(p['hand_size']) }, (_, i) => ({ id: `${prefix}:hand:back:${i}`, label: 'card', face: 'down' as const }));
  const hand: Zone = {
    kind: 'card-zone', id: `${prefix}:hand`, arriveFrom: `${prefix}:deck`,
    data: { label: `Hand (${asNum(p['hand_size'], contents.hand.length)})${refining ? ' · pick one to remove' : ''}`, mode: 'fan', cards: handCards },
  };
  const deck: Zone = {
    kind: 'card-zone', id: `${prefix}:deck`,
    data: { label: 'Deck', mode: 'pile', countOnly: asNum(p['deck_size']) },
  };
  const discardCards = contents.discard.map((cid, i) => cardData(cid, instance('discard', i), defs));
  const discard: Zone = {
    kind: 'card-zone', id: `${prefix}:discard`, arriveFrom: 'ff:supply',
    data: contents.discard.length > 0 || asNum(p['discard_size']) === 0
      ? { label: 'Discard', mode: 'pile', cards: discardCards }
      : { label: 'Discard', mode: 'pile', countOnly: asNum(p['discard_size']) },
  };
  const played: Zone = {
    kind: 'card-zone', id: `${prefix}:played`, arriveFrom: `${prefix}:hand`, span: 'full',
    data: {
      label: `${whose} played cards (${contents.played.length})${contents.played.length ? ' · stay on the table until the round ends' : ''}`,
      mode: 'row', cards: contents.played.map((cid, i) => cardData(cid, instance('played', i), defs)),
    },
  };
  return { tableau, hand, deck, discard, played, ids };
}

/**
 * One shelf for both supplies. The engine has no shared market: every stack
 * is still its owner's, and the shelf just draws each card once with the
 * two counts on it (docs/games/fractured-fist.md, the shared area).
 */
function shelfZone(order: string[], players: Record<string, unknown>, shelfPid: string, defs: Map<string, CardDef>, watching: boolean, phase: string): Zone {
  const supplies = order.map((pid) => ({ pid, supply: isObj(players[pid]) && isObj((players[pid] as Record<string, unknown>)['supply']) ? ((players[pid] as Record<string, unknown>)['supply'] as Record<string, unknown>) : {} }));
  const cardIds: string[] = [];
  for (const s of supplies) for (const cid of Object.keys(s.supply)) if (!cardIds.includes(cid)) cardIds.push(cid);
  const cards: CardData[] = cardIds.map((cid) => ({
    ...cardData(cid, shelfCardId(shelfPid, cid), defs),
    counts: supplies.map((s) => ({
      label: watching ? words(s.pid) : s.pid === shelfPid ? 'you' : 'them',
      value: asNum(s.supply[cid]),
      own: !watching && s.pid === shelfPid,
    })),
  }));
  return {
    kind: 'card-zone', id: 'ff:supply', span: 'full',
    data: { label: `Supply · ${phase === 'channel' ? 'pick one to buy; it goes to your discard' : 'buying opens in the Channel step'}`, mode: 'row', cards },
  };
}

/**
 * The strike gutter: what each player has queued against the other, as the
 * view has it. What will get through is the engine's to say at the strike;
 * nothing here subtracts.
 */
function gutterZones(order: string[], players: Record<string, unknown>, me: string | null): Zone[] {
  const watching = me === null;
  const name = (pid: string) => (watching ? words(pid) : pid === me ? 'You' : 'Opponent');
  return order.map((pid) => {
    const other = order.find((x) => x !== pid) ?? pid;
    const p = isObj(players[pid]) ? (players[pid] as Record<string, unknown>) : {};
    const o = isObj(players[other]) ? (players[other] as Record<string, unknown>) : {};
    const data: PoolData = {
      label: `${name(pid)} hit${name(pid) === 'You' ? '' : 's'} ${name(other) === 'You' ? 'you' : name(other)} · ${name(other)} at ${asNum(o['stamina'])} of ${asNum(o['max_stamina'])}`,
      items: [
        { label: 'damage', count: asNum(p['damage_queued']), colorKey: 'damage' },
        { label: 'defense', count: asNum(o['defense_queued']), colorKey: 'defense' },
      ],
    };
    return { kind: 'pool', id: `ff:strike:${pid}`, data };
  });
}

function selfPid(input: GlueInput, view: Record<string, unknown>): string | null {
  if (input.playerId) return input.playerId;
  const players = isObj(view['players']) ? view['players'] : {};
  for (const [pid, p] of Object.entries(players)) if (isObj(p) && Array.isArray(p['hand'])) return pid;
  return null;
}

const STEP_NAMES: Record<string, string> = { technique: 'Technique', channel: 'Channel' };

/** The action bar: the step in words, and a button for each move that moves the turn. */
function promptFor(view: Record<string, unknown>, me: string | null, defs: Map<string, CardDef>, ids: IdentityState | null, input: GlueInput): PlanPrompt {
  const phase = asStr(view['phase']);
  const activePid = asStr(view['active_player_id']);
  const players = isObj(view['players']) ? view['players'] : {};
  const p = me && isObj(players[me]) ? (players[me] as Record<string, unknown>) : null;
  const moves = input.legalMoves;
  const find = (type: string) => moves.find((m) => m.move['type'] === type) ?? null;
  const actions: PromptAction[] = [];

  if (phase === 'game_over') return { title: 'The fight is over', actions };
  if (!p || activePid !== me) {
    const who = me === null ? words(activePid) : 'Opponent';
    return { title: `${who} is taking their turn`, sub: 'When they finish, both hits land at once.', actions };
  }
  // Your turn, but the engine's menu is not here yet (the board is still
  // playing back): the step in words, no buttons.
  if (moves.length === 0) return { title: phase === 'channel' ? 'Channel step' : 'Technique step', actions };

  const refine = asNum(p['refine_pending']);
  const skip = find('skip_refine');
  if (refine > 0 && skip) {
    actions.push({ id: 'skip-refine', label: 'Skip the rest', move: skip });
    return {
      title: `Remove ${refine} more card${refine === 1 ? '' : 's'}`,
      sub: 'Pick from your hand, or skip the rest. Refined cards leave the game.',
      actions, urgent: true,
    };
  }

  const reload = find('focus_reload');
  if (reload) {
    const used = asNum(p['focus_reloads_this_turn']);
    actions.push({
      id: 'focus-reload', label: 'Focus reload', note: used > 0 ? `used ${used} this turn` : undefined,
      title: 'Discard every Focus in hand and draw that many. Allowed while your stamina is lower.', move: reload,
    });
  }

  let title = 'Technique step';
  let sub = 'Play techniques, one action each. Nothing moves on until you say so.';
  if (phase === 'channel') {
    title = 'Channel step';
    const ch = asNum(p['channels']);
    sub = `Play resources for spirit, then buy from your supply. ${asNum(p['spirit'])} spirit, ${ch} channel${ch === 1 ? '' : 's'} left.`;
    // Every resource in hand in one press, when there is more than one to
    // press. Each is a listed play; the button says what the press spends.
    const hand = asArr(p['hand']).map((x) => asStr(x));
    const plays = moves.filter((m) => m.move['type'] === 'play_card' && typeof m.move['hand_index'] === 'number' && defs.get(asStr(m.move['card_id']))?.type === 'RESOURCE');
    const batch: SelectEvent[] = [];
    let gain = 0;
    let focus = 0;
    for (const m of plays) {
      const idx = m.move['hand_index'] as number;
      const inst = ids?.zones['hand']?.[idx];
      const def = defs.get(hand[idx] ?? '');
      if (!inst || !def) continue;
      batch.push({ component: 'card', id: inst, label: def.name });
      gain += def.value ?? 0;
      if (def.id === 'focus') focus += 1;
    }
    if (batch.length > 1) {
      const costsReload = reload !== null && focus > 0;
      actions.push({
        id: 'play-all-resources', label: `Play all resources · +${gain}`,
        note: costsReload ? `spends your ${focus} Focus` : undefined,
        title: `Plays all ${batch.length} resources into your played row at once, for ${gain} spirit.${costsReload ? ` Your ${focus} Focus go with them, so no reload after this.` : ''}`,
        batch,
      });
    }
  } else if (asNum(p['actions']) < 1) {
    title = 'No actions left';
    sub = 'Advance to Channel to spend spirit, or end your turn.';
  }
  const advance = find('advance_phase');
  if (advance) actions.push({ id: 'advance-phase', label: 'Advance to Channel', move: advance });
  const end = find('end_turn');
  if (end) actions.push({ id: 'end-turn', label: 'End turn', primary: true, move: end });
  return { title, sub, actions };
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
    const phase = asStr(view['phase']);
    const shelfPid = me ?? order[0] ?? 'p1';

    const bench: Zone[] = [];
    const side: Zone[] = [];
    // The fight: their row, the gutter, your row, the shelf. Your row sits
    // nearest your hand.
    const rows: { self: Zone[]; other: Zone[] } = { self: [], other: [] };
    let myIds: IdentityState | null = null;
    for (const pid of order) {
      const p = players[pid];
      if (!isObj(p)) continue;
      const isSelf = pid === me;
      const z = playerZones(pid, p, isSelf, input, defs, shelfPid, pid === activePid, phase, missCap);
      if (isSelf) {
        rows.self.push(z.played);
        bench.push(z.tableau, z.hand, z.deck, z.discard);
        myIds = z.ids;
      } else {
        rows.other.push(z.played);
        side.push(z.tableau, z.hand, z.deck, z.discard);
      }
    }
    const board: Zone[] = [...rows.other, ...gutterZones(order, players, me), ...rows.self, shelfZone(order, players, shelfPid, defs, me === null, phase)];

    const steps: PlanStep[] = Object.entries(STEP_NAMES).map(([id, label]) => ({ id, label, current: phase === id }));
    const status = `Round ${asNum(view['round'], 1)} · ${phase === 'game_over' ? 'over' : `${words(phase)} step`}`;
    return { board, bench, side, palette: PALETTE, title: 'Fractured Fist', status, steps, prompt: promptFor(view, me, defs, myIds, input) };
  },

  litParts(input: GlueInput): string[] {
    const { view, legalMoves } = input;
    if (!shapeHas(view, 'players')) return [];
    const me = selfPid(input, view);
    if (!me) return [];
    const players = isObj(view['players']) ? view['players'] : {};
    const p = isObj(players[me]) ? (players[me] as Record<string, unknown>) : null;
    if (!p) return [];
    const ids = identitiesFor(me, p, input, me);
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
        // Only your own stacks ever light: the shelf's stacks are keyed by
        // your seat, and a buy is always from your own supply.
        lit.push(shelfCardId(me, asStr(m.move['card_id'])));
      }
      // The moves that move the turn (advance, end, reload, skip) are the
      // action bar's buttons; the numbered menu lists them too.
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
    const ids = identitiesFor(me, p, input, me);
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

  /**
   * The strike: the round ended between the view on screen and the one
   * arriving. What each player queued and what stood in the way come from
   * the view before; what got through is the stamina the engine took off.
   */
  momentFor(input: MomentInput): Moment | null {
    const { before, after } = input;
    if (!shapeHas(before, 'players', 'round', 'player_order') || !shapeHas(after, 'players', 'round')) return null;
    const struck = asNum(after['round']) > asNum(before['round']) || (asStr(after['phase']) === 'game_over' && asStr(before['phase']) !== 'game_over');
    if (!struck) return null;
    const order = asArr(before['player_order']).map((x) => asStr(x));
    const bp = isObj(before['players']) ? before['players'] : {};
    const ap = isObj(after['players']) ? after['players'] : {};
    const lanes = order.map((pid) => {
      const target = order.find((x) => x !== pid) ?? pid;
      const a = isObj(bp[pid]) ? (bp[pid] as Record<string, unknown>) : {};
      const tBefore = isObj(bp[target]) ? (bp[target] as Record<string, unknown>) : {};
      const tAfter = isObj(ap[target]) ? (ap[target] as Record<string, unknown>) : {};
      const wasAt = asNum(tBefore['stamina']);
      const nowAt = asNum(tAfter['stamina'], wasAt);
      return {
        attacker: pid, target,
        hit: asNum(a['damage_queued']), shield: asNum(tBefore['defense_queued']),
        through: Math.max(0, wasAt - nowAt),
        before: wasAt, after: nowAt, max: asNum(tBefore['max_stamina']),
      };
    });
    return {
      kind: 'strike', key: `strike:${asNum(before['round'])}`,
      title: `Round ${asNum(before['round'])} · strike`,
      lanes, over: asStr(after['phase']) === 'game_over',
    };
  },

  setupFields(reference: GameReferenceResponse, _seats?: SetupSeat[]): SetupField[] {
    // The loadout is a printed-rules decision: the seven techniques in play.
    // The engine's options schema names the option; its reference data
    // lists every technique, its school, its effects and the default seven.
    // The player picks; nothing is preselected, the default is a button.
    const schema = reference.optionsSchema;
    const props = isObj(schema) && isObj(schema['properties']) ? schema['properties'] : {};
    if (!('loadout' in props)) return [];
    const defs = cardDefs(reference);
    const techniques = [...defs.values()].filter((c) => c.type === 'TECHNIQUE');
    if (techniques.length === 0) return [];
    const loadoutSchema = isObj(props['loadout']) ? props['loadout'] : {};
    const help = asStr(loadoutSchema['description']).split('.').slice(0, 1).join('.') || undefined;
    const starter = starterLoadout(reference).filter((id) => defs.has(id));
    const factions = [...new Set(techniques.map((c) => c.faction ?? ''))];
    const groups = factions.map((f) => ({
      key: f || 'none',
      label: f ? words(f) : 'No school',
      note: f ? undefined : 'open to anyone',
      color: PALETTE[f ? f.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'misstep'],
    }));
    return [{
      key: 'loadout',
      label: 'Choose the 7 techniques in play',
      help,
      kind: 'multi',
      pick: 7,
      noun: 'technique',
      groups,
      preset: starter.length ? { label: 'Use the default seven', values: starter } : undefined,
      options: techniques.map((c) => ({
        value: c.id,
        label: c.name,
        group: c.faction ?? 'none',
        badge: String(c.cost),
        chips: effectChips(c),
        tag: starter.includes(c.id) ? 'default seven' : undefined,
        hint: `cost ${c.cost}${c.description ? ` · ${c.description}` : ''}${c.faction ? ` · ${words(c.faction)}` : ''}`,
      })),
      summarize: (values) => {
        const picked = values.map((v) => defs.get(v)).filter((d): d is CardDef => !!d);
        const sum: Record<string, number> = {};
        for (const d of picked) for (const [k, v] of Object.entries(d.effects)) sum[k] = (sum[k] ?? 0) + v;
        const chips = EFFECT_ORDER.filter((k) => sum[k]).map((k) => `${EFFECT_WORDS[k]} ${sum[k]}`);
        const costs = picked.map((d) => d.cost);
        const note = costs.length ? `Cheapest ${Math.min(...costs)} spirit, dearest ${Math.max(...costs)}.` : undefined;
        return { chips, note };
      },
    }];
  },
};

export default fracturedFistGlue;
