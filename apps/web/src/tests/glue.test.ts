// Glue mapping tests with fixture views matching the engine's REAL view
// shape for each game (zekel src/games/<id>/views.ts). Legal move fixtures
// follow the engine's LegalMove shape: { move_id, description, move }.

import { describe, expect, it } from 'vitest';
import type { GameReferenceResponse } from '@universe/shared';
import type { CardZoneData, MapData, PoolData, TableauData, TrackData } from '@universe/primitives';
import { GLUES } from '../glue';
import type { GlueInput, LegalMove, TablePlan, Zone } from '../glue';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formForMove, isSubmissionAllowed, movesForSelect, templateForm } from '../glue';
import { SPACES, JUNCTION_ROADS, TREATS, CASTLE_POS } from '../glue/sweetlands-board';

function input(view: unknown, legalMoves: GlueInput['legalMoves'] = [], extra: Partial<GlueInput> = {}): GlueInput {
  return {
    view, previous: null, legalMoves, playerId: extra.playerId ?? null, reference: extra.reference ?? null,
    seq: extra.seq ?? 1, engineMove: extra.engineMove ?? null, actorPlayerId: extra.actorPlayerId ?? null,
    memory: extra.memory ?? new Map(),
  };
}

const ids = (zones: Zone[]) => zones.map((z) => z.id);
const cards = (z: Zone | undefined) => ((z?.data as CardZoneData | undefined)?.cards ?? []);

// zekel/src/games/fractured-fist/views.ts getPlayerView for a TRACKED seat.
const FF_VIEW = {
  phase: 'technique',
  round: 2,
  active_player_id: 'p1',
  player_order: ['p1', 'p2'],
  players_done_this_round: [],
  players: {
    p1: {
      kind: 'tracked', stamina: 6, max_stamina: 7, deck_size: 8, hand_size: 5,
      discard_size: 2, discard: ['misstep', 'focus'], played: ['attack'],
      damage_queued: 1, defense_queued: 0, actions: 1, channels: 1, spirit: 0,
      refine_pending: 0, misstep_count: 3, starting_hand_size: 5,
      focus_reloads_this_turn: 0, supply: { attack: 4, focus: 20, momentum: 19 },
      hand: ['focus', 'misstep', 'quicken', 'center', 'focus'],
      deck_count_by_card: { focus: 5, misstep: 1, attack: 2 },
    },
    p2: {
      kind: 'tracked', stamina: 7, max_stamina: 7, deck_size: 9, hand_size: 5,
      discard_size: 1, discard: ['block'], played: [], damage_queued: 0,
      defense_queued: 1, actions: 1, channels: 1, spirit: 2, refine_pending: 0,
      misstep_count: 3, starting_hand_size: 5, focus_reloads_this_turn: 0,
      supply: { attack: 5 },
    },
  },
  winners: [], scores: {}, result_summary: null,
};

const FF_MOVES = [
  { move_id: 'play-2-quicken', description: 'Play Quicken from your hand', move: { type: 'play_card', card_id: 'quicken', hand_index: 2 } },
  { move_id: 'buy-attack', description: 'Buy Attack', move: { type: 'buy_card', card_id: 'attack' } },
  { move_id: 'advance-phase', description: 'Advance to Channel phase', move: { type: 'advance_phase' } },
];

const FF_REFERENCE: GameReferenceResponse = {
  gameId: 'fractured-fist',
  rules: 'rules',
  referenceData: {
    cards: [
      { id: 'focus', name: 'Focus', type: 'RESOURCE', cost: 0, value: 1, description: '1 Spirit.' },
      { id: 'misstep', name: 'Misstep', type: 'MISSTEP', cost: 0, description: 'Cannot be played.' },
      { id: 'quicken', name: 'Quicken', type: 'TECHNIQUE', cost: 2, description: '+2 Draw.', effects: { draw: 2 } },
      { id: 'center', name: 'Center', type: 'TECHNIQUE', cost: 2, description: '+2 Spirit.', effects: { spirit: 2 } },
      { id: 'attack', name: 'Attack', type: 'TECHNIQUE', cost: 4, description: '+1 Damage.', effects: { damage: 1 } },
      { id: 'block', name: 'Block', type: 'TECHNIQUE', cost: 3, description: '+1 Defense.', effects: { defense: 1 } },
      { id: 'momentum', name: 'Momentum', type: 'RESOURCE', cost: 3, value: 2, description: '2 spirit.' },
      { id: 'grand-finale', name: 'Grand Finale', type: 'TECHNIQUE', cost: 10, description: '+5 Damage.', faction: 'Titan Entertainment', effects: { damage: 5 } },
    ],
    starter_loadout: ['attack', 'block', 'assess', 'center', 'distract', 'quicken', 'react'],
    max_missteps: 10,
  },
  moveSchema: {},
  optionsSchema: { type: 'object', properties: { loadout: { type: 'array', description: 'Seven techniques. ASK THE PLAYER.' } } },
};

describe('fractured-fist glue', () => {
  const g = GLUES['fractured-fist']!;
  const hand = (plan: { bench: Zone[] }) => cards(plan.bench.find((z) => z.id === 'p:p1:hand'));
  it('plans the bench (you, hand, deck, discard), the side (the opponent) and the board (their row, the gutter, your row, one shelf)', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(plan).not.toBeNull();
    expect(ids(plan.bench)).toEqual(['p:p1:tableau', 'p:p1:hand', 'p:p1:deck', 'p:p1:discard']);
    expect(ids(plan.side)).toEqual(['p:p2:tableau', 'p:p2:hand', 'p:p2:deck', 'p:p2:discard']);
    expect(ids(plan.board)).toEqual(['p:p2:played', 'ff:strike:p1', 'ff:strike:p2', 'p:p1:played', 'ff:supply']);
    expect(plan.board.filter((z) => z.span === 'full').map((z) => z.id)).toEqual(['p:p2:played', 'p:p1:played', 'ff:supply']);
    expect(plan.status).toBe('Round 2 · Technique step');
    expect(plan.steps).toEqual([{ id: 'technique', label: 'Technique', current: true }, { id: 'channel', label: 'Channel', current: false }]);
  });
  it('draws one shelf with both players\' counts, yours marked as your own', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    const shelf = cards(plan.board.find((z) => z.id === 'ff:supply'));
    expect(shelf.map((c) => c.id)).toEqual(['p:p1:supply:attack', 'p:p1:supply:focus', 'p:p1:supply:momentum']);
    expect(shelf[0]!.counts).toEqual([{ label: 'you', value: 4, own: true }, { label: 'them', value: 5, own: false }]);
    // A card only the other player still has is on the shelf too, at zero for you.
    expect(shelf[1]!.counts).toEqual([{ label: 'you', value: 20, own: true }, { label: 'them', value: 0, own: false }]);
    // Buying lights only your own stacks; the opponent's are never selectable.
    const lit = g.litParts(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }));
    expect(lit).toContain('p:p1:supply:attack');
    expect(lit.some((id) => id.startsWith('p:p2:supply'))).toBe(false);
  });
  it('the gutter shows what each player queued against the other, without subtracting', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    const mine = plan.board.find((z) => z.id === 'ff:strike:p1')!;
    expect(mine.kind).toBe('pool');
    const data = mine.data as { label: string; items: Array<{ label: string; count: number }> };
    expect(data.label).toBe('You hit Opponent · Opponent at 7 of 7');
    expect(data.items).toEqual([{ label: 'damage', count: 1, colorKey: 'damage' }, { label: 'defense', count: 1, colorKey: 'defense' }]);
    const theirs = plan.board.find((z) => z.id === 'ff:strike:p2')!.data as { label: string };
    expect(theirs.label).toBe('Opponent hits you · You at 6 of 7');
  });
  it('names cards from the reference data and shows the misstep cap from it, never from a constant', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(hand(plan).map((c) => c.label)).toEqual(['Focus', 'Misstep', 'Quicken', 'Center', 'Focus']);
    expect(hand(plan)[2]!.badges).toContain('cost 2');
    expect(hand(plan)[2]!.subtitle).toBe('+2 Draw');
    const tableau = plan.bench.find((z) => z.id === 'p:p1:tableau')!;
    const stats = (tableau.data as { stats: Array<{ label: string; value: unknown; max?: number }> }).stats;
    expect(stats.find((s) => s.label === 'Missteps')).toEqual({ label: 'Missteps', value: 3, max: 10 });
    expect(stats.find((s) => s.label === 'Stamina')).toEqual({ label: 'Stamina', value: 6, max: 7 });
    // Without reference data the cap is simply absent.
    const bare = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1' }))!;
    const bareStats = (bare.bench.find((z) => z.id === 'p:p1:tableau')!.data as { stats: Array<{ label: string; max?: number }> }).stats;
    expect(bareStats.find((s) => s.label === 'Missteps')!.max).toBeUndefined();
  });
  it('shows only the counters the current step can change; stamina and missteps always', () => {
    const labels = (view: unknown, pid: string) => {
      const plan = g.plan(input(view, [], { playerId: 'p1', reference: FF_REFERENCE }))!;
      const z = [...plan.bench, ...plan.side].find((x) => x.id === `p:${pid}:tableau`)!;
      return (z.data as { stats: Array<{ label: string }> }).stats.map((s) => s.label);
    };
    expect(labels(FF_VIEW, 'p1')).toEqual(['Stamina', 'Actions', 'Missteps']);
    // The opponent is not on turn: their per-turn counters cannot change.
    expect(labels(FF_VIEW, 'p2')).toEqual(['Stamina', 'Missteps']);
    const channel = { ...FF_VIEW, phase: 'channel' };
    expect(labels(channel, 'p1')).toEqual(['Stamina', 'Spirit', 'Channels', 'Missteps']);
    const refining = { ...FF_VIEW, players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, refine_pending: 2 } } };
    expect(labels(refining, 'p1')).toEqual(['Stamina', 'Refines pending', 'Actions', 'Missteps']);
  });
  it('gives cards stable instance ids that carry across events', () => {
    const memory = new Map<string, unknown>();
    const first = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE, seq: 1, memory }))!;
    const quicken = hand(first)[2]!.id!;
    const after = {
      ...FF_VIEW,
      players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, hand: ['focus', 'misstep', 'center', 'focus'], played: ['attack', 'quicken'] } },
    };
    const second = g.plan(input(after, [], {
      playerId: 'p1', reference: FF_REFERENCE, seq: 2, memory,
      engineMove: { type: 'play_card', card_id: 'quicken', hand_index: 2 }, actorPlayerId: 'p1',
    }))!;
    const played = second.board.find((z) => z.id === 'p:p1:played')!;
    expect(cards(played).map((c) => c.id)).toContain(quicken);
    expect(hand(second).map((c) => c.id)).not.toContain(quicken);
  });
  it('a bought card flies in from its stack on the shelf', () => {
    const memory = new Map<string, unknown>();
    g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE, seq: 1, memory }));
    const after = {
      ...FF_VIEW,
      players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, discard: ['misstep', 'focus', 'attack'], discard_size: 3, supply: { attack: 3, focus: 20, momentum: 19 } } },
    };
    const second = g.plan(input(after, [], { playerId: 'p1', reference: FF_REFERENCE, seq: 2, memory, engineMove: { type: 'buy_card', card_id: 'attack' }, actorPlayerId: 'p1' }))!;
    const discard = second.bench.find((z) => z.id === 'p:p1:discard')!;
    expect(discard.kind === 'card-zone' && discard.arriveFrom).toBe('ff:supply');
    const state = memory.get('ff:identity:p1') as { state: { zones: Record<string, string[]>; arrivals: Record<string, string> } };
    const bought = state.state.zones['discard']![2]!;
    expect(state.state.arrivals[bought]).toBe('p:p1:supply:attack');
  });
  it('lights playable hand cards by instance and buyable supply piles', () => {
    const memory = new Map<string, unknown>();
    const inp = input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE, memory });
    const plan = g.plan(inp)!;
    const lit = g.litParts(inp);
    const quicken = hand(plan)[2]!.id!;
    expect(lit).toContain(quicken);
    expect(lit).toContain('p:p1:supply:attack');
    expect(lit).not.toContain('advance-phase');
    expect(lit).toHaveLength(2);
  });
  it('maps a tap back to the move', () => {
    const memory = new Map<string, unknown>();
    const inp = input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE, memory });
    const plan = g.plan(inp)!;
    const quicken = hand(plan)[2]!.id!;
    expect(g.moveForSelect({ component: 'card', id: quicken, label: 'Quicken' }, inp)?.move_id).toBe('play-2-quicken');
    expect(g.moveForSelect({ component: 'card', id: 'p:p1:supply:attack', label: 'Attack' }, inp)?.move_id).toBe('buy-attack');
    expect(g.moveForSelect({ component: 'card', id: hand(plan)[0]!.id!, label: 'Focus' }, inp)).toBeNull();
  });
  it('has no resolve_report (no dice, and the engine resolves every draw itself)', () => {
    expect(g.resolveReportMove(FF_MOVES)).toBeNull();
  });
  it('the action bar holds the moves that move the turn, each only while the engine lists it', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(plan.prompt!.title).toBe('Technique step');
    expect(plan.prompt!.actions.map((a) => a.id)).toEqual(['advance-phase']);
    const withEnd = g.plan(input(FF_VIEW, [...FF_MOVES, { move_id: 'end-turn', description: 'End turn', move: { type: 'end_turn' } }, { move_id: 'focus-reload', description: 'Focus reload', move: { type: 'focus_reload' } }], { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(withEnd.prompt!.actions.map((a) => a.id)).toEqual(['focus-reload', 'advance-phase', 'end-turn']);
    const end = withEnd.prompt!.actions.find((a) => a.id === 'end-turn')!;
    expect('move' in end && end.move.move).toEqual({ type: 'end_turn' });
    expect(end.primary).toBe(true);
    // Not your turn: words, no buttons.
    const theirs = g.plan(input({ ...FF_VIEW, active_player_id: 'p2' }, [], { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(theirs.prompt!.title).toBe('Opponent is taking their turn');
    expect(theirs.prompt!.actions).toEqual([]);
    // A refine window is an interrupt with one way out besides picking.
    const refining = { ...FF_VIEW, players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, refine_pending: 1 } } };
    const r = g.plan(input(refining, [{ move_id: 'refine-0-focus', description: 'Refine Focus', move: { type: 'refine_card', hand_index: 0 } }, { move_id: 'skip-refine', description: 'Skip', move: { type: 'skip_refine' } }], { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(r.prompt!.title).toBe('Remove 1 more card');
    expect(r.prompt!.urgent).toBe(true);
    expect(r.prompt!.actions.map((a) => a.id)).toEqual(['skip-refine']);
  });
  it('offers "play all resources" only when more than one resource play is listed, and says what it spends', () => {
    const channel = { ...FF_VIEW, phase: 'channel', players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, hand: ['focus', 'misstep', 'quicken', 'momentum', 'focus'] } } };
    const plays = [
      { move_id: 'play-0-focus', description: 'Play Focus for 1 spirit', move: { type: 'play_card', card_id: 'focus', hand_index: 0 } },
      { move_id: 'play-3-momentum', description: 'Play Momentum for 2 spirit', move: { type: 'play_card', card_id: 'momentum', hand_index: 3 } },
      { move_id: 'play-4-focus', description: 'Play Focus for 1 spirit', move: { type: 'play_card', card_id: 'focus', hand_index: 4 } },
      { move_id: 'end-turn', description: 'End turn', move: { type: 'end_turn' } },
    ];
    const memory = new Map<string, unknown>();
    const plan = g.plan(input(channel, plays, { playerId: 'p1', reference: FF_REFERENCE, memory }))!;
    const all = plan.prompt!.actions.find((a) => a.id === 'play-all-resources')!;
    expect(all.label).toBe('Play all resources · +4');
    expect(all.note).toBeUndefined();
    const batch = 'batch' in all ? all.batch : [];
    expect(batch.map((b) => b.id)).toEqual([hand(plan)[0]!.id, hand(plan)[3]!.id, hand(plan)[4]!.id]);
    // With a reload still legal, the button says the Focus go with it.
    const withReload = g.plan(input(channel, [...plays, { move_id: 'focus-reload', description: 'Focus reload', move: { type: 'focus_reload' } }], { playerId: 'p1', reference: FF_REFERENCE, memory }))!;
    expect(withReload.prompt!.actions.find((a) => a.id === 'play-all-resources')!.note).toBe('spends your 2 Focus');
    // One resource play: no button, the card itself is the press.
    const one = g.plan(input(channel, [plays[1]!, plays[3]!], { playerId: 'p1', reference: FF_REFERENCE, memory }))!;
    expect(one.prompt!.actions.map((a) => a.id)).toEqual(['end-turn']);
  });
  it('reads the strike from the views before and after the round ended, never from arithmetic of its own', () => {
    const before = { ...FF_VIEW, players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, damage_queued: 2, defense_queued: 0 }, p2: { ...FF_VIEW.players.p2, damage_queued: 3, defense_queued: 1, stamina: 6 } } };
    const after = { ...FF_VIEW, round: 3, players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, stamina: 3, damage_queued: 0, played: [] }, p2: { ...FF_VIEW.players.p2, stamina: 5, damage_queued: 0, defense_queued: 0 } } };
    const m = g.momentFor!({ before, after, summary: 'End of round 2. Strike: p1 dealt 1, p2 dealt 3.', engineMove: { type: 'end_turn' }, playerId: 'p1', reference: FF_REFERENCE })!;
    expect(m.kind).toBe('strike');
    expect(m.title).toBe('Round 2 · strike');
    expect(m.over).toBe(false);
    expect(m.lanes).toEqual([
      { attacker: 'p1', target: 'p2', hit: 2, shield: 1, through: 1, before: 6, after: 5, max: 7 },
      { attacker: 'p2', target: 'p1', hit: 3, shield: 0, through: 3, before: 6, after: 3, max: 7 },
    ]);
    // No round change, no moment; the game ending on the strike is a moment that is over.
    expect(g.momentFor!({ before, after: before, summary: '', engineMove: null, playerId: 'p1', reference: FF_REFERENCE })).toBeNull();
    const over = { ...after, phase: 'game_over', players: { ...after.players, p1: { ...after.players.p1, stamina: 0 } } };
    expect(g.momentFor!({ before, after: over, summary: '', engineMove: null, playerId: 'p1', reference: FF_REFERENCE })!.over).toBe(true);
  });
  it('presents the loadout as a seven-pick grouped by school with nothing preselected and the default as a preset', () => {
    const fields = g.setupFields(FF_REFERENCE);
    expect(fields).toHaveLength(1);
    const f = fields[0]!;
    if (f.kind !== 'multi') throw new Error('the loadout is a multi pick');
    expect(f.pick).toBe(7);
    expect(f.options.map((o) => o.value)).toEqual(['quicken', 'center', 'attack', 'block', 'grand-finale']);
    expect(f.groups!.map((gr) => gr.key)).toEqual(['none', 'Titan Entertainment']);
    const finale = f.options.find((o) => o.value === 'grand-finale')!;
    expect(finale.group).toBe('Titan Entertainment');
    expect(finale.badge).toBe('10');
    expect(finale.chips).toEqual(['+5 Damage']);
    expect(f.options.find((o) => o.value === 'attack')!.tag).toBe('default seven');
    expect(f.preset).toEqual({ label: 'Use the default seven', values: ['attack', 'block', 'center', 'quicken'] });
    expect(f.summarize!(['attack', 'grand-finale', 'quicken'])).toEqual({ chips: ['Damage 6', 'Draw 2'], note: 'Cheapest 2 spirit, dearest 10.' });
    expect(f.summarize!([])).toEqual({ chips: [], note: undefined });
  });
});

// zekel/src/games/warble-way-galaxy/views.ts getView output.
const WW_VIEW = {
  phase: 'habitat',
  pending: { kind: 'research_roll' },
  character: {
    name: 'Zara', race: 'human', level: 1,
    xp: 2, xp_to_next_level: 4, credits: 200, wounded: false, dread: 0,
    abilities: { sne: { name: 'Sneak', stat: 'body', natural: 3, effective: 3 } },
    skills: ['Sneak (SNE basic)'], equipped: [],
  },
  crew: [{ name: 'Bolt', race: 'kralkin', anger_tokens: 1 }],
  unnamed_crew: 2,
  season_endings: { fortune: '200/6000 credits', legend: 'level 1/5' },
  ship: { name: 'Wasp', damage: 'Used', capacity: 3 },
  items: [{ id: 'it1', name: 'Laser Pistol', type: 'weapon', consumed: false }],
  habitat: { number: 1, name: 'Xaxalon 4', shop: [], cantina: [], missions: [] },
  journey: { legs: [{ position: 'current', cards_remaining: 3 }] },
  ruin: { map: 'R1', level: 1, round: 1, board_rows: ['row 1: # # # # #', 'row 2: # 1 . a #'] },
  travel_deck: { cards_in_draw_pile: 40, cards_in_discard: 3, discard: ['3♠', 'Q♥', '7♣'] },
  result: null,
};

describe('warble-way-galaxy glue', () => {
  const g = GLUES['warble-way-galaxy']!;
  it('plans the character, crew, ship, travel deck, journey and ruin from the view', () => {
    const plan = g.plan(input(WW_VIEW))!;
    expect(ids(plan.bench)).toEqual(['ww:crew', 'ww:items']);
    expect(ids(plan.side)).toEqual(['ww:character', 'ww:season', 'ww:ship']);
    expect(ids(plan.board)).toEqual(['ww:travel-draw', 'ww:travel-discard', 'ww:journey', 'ww:ruin', 'ww:habitat']);
    // Crew capacity comes from the ship, level progress from xp_to_next_level.
    expect((plan.bench[0]!.data as CardZoneData).label).toBe('Crew (1/3) +2 unnamed');
    const stats = (plan.side[0]!.data as { stats: Array<{ label: string; value: unknown; max?: number }> }).stats;
    expect(stats.find((s) => s.label === 'XP to next level')).toEqual({ label: 'XP to next level', value: 2, max: 6 });
    const grid = plan.board[3]!.data as { extent: { maxX: number; maxY: number }; cells: Array<{ x: number; y: number }> };
    expect(grid.extent).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 1 });
    expect(grid.cells.find((c) => c.x === 1 && c.y === 1)).toBeDefined();
  });
  it('surfaces the Roll button only for resolve_report and reads dice from the summary', () => {
    const moves = [{ move_id: 'r', description: 'Roll 3d6 + SNE', move: { type: 'resolve_report' } }];
    expect(g.resolveReportMove(moves)?.move_id).toBe('r');
    expect(g.diceFor!({ engineMove: null, summary: 'Rolled 3, 5 + 1 for research.', view: null })).toEqual([3, 5, 1]);
  });
  it('setup screen: the character is created from the answers, as one create_character move', () => {
    const ref: GameReferenceResponse = {
      gameId: 'warble-way-galaxy', rules: '', moveSchema: {}, optionsSchema: {},
      referenceData: {
        stats: { brawn: ['SWA (Swashbuckling)'], smarts: ['HAK (Hacking)'] },
        races: ['human', 'grull'],
        archetypes: [{ id: 'void-runner', name: 'Void Runner', scores: { SNE: 3 }, difficulty: 'easy', stars: '★' }],
      },
    };
    const seats = [{ position: 0, kind: 'human' as const, host: true }];
    const fields = g.setupFields(ref, seats);
    expect(fields.map((f) => f.key)).toEqual(['character_name', 'race', 'ship_name', 'method', 'score.SWA', 'score.HAK', 'archetype_name', 'disposition']);
    expect(g.setupMoves!({ character_name: 'Zara', race: 'grull', ship_name: 'Wasp', method: 'recommended', 'score.SWA': '3', 'score.HAK': '2', disposition: 'brash' }, seats, ref))
      .toEqual([{ type: 'create_character', character_name: 'Zara', race: 'grull', ship_name: 'Wasp', method: 'recommended', disposition: 'brash', scores: { SWA: 3, HAK: 2 } }]);
    expect(g.setupMoves!({ character_name: 'Zara', race: 'human', ship_name: 'Wasp', method: 'archetype', archetype_name: 'Void Runner', disposition: 'none' }, seats, ref))
      .toEqual([{ type: 'create_character', character_name: 'Zara', race: 'human', ship_name: 'Wasp', method: 'archetype', archetype_name: 'Void Runner' }]);
    // Unanswered: no move, so the table asks instead.
    expect(g.setupMoves!({ character_name: 'Zara' }, seats, ref)).toEqual([]);
  });
  it('character creation is a form the player fills in, with the races, abilities and archetypes from the reference data', () => {
    const ref: GameReferenceResponse = {
      gameId: 'warble-way-galaxy', rules: '', moveSchema: {}, optionsSchema: {},
      referenceData: {
        stats: { brawn: ['SWA (Swashbuckling)', 'ARM (Armor)'], smarts: ['HAK (Hacking)'] },
        races: ['human', 'kralkin', 'hexapod', 'grull'],
        archetypes: [{ id: 'void-runner', name: 'Void Runner', scores: { SNE: 3, MEC: 2, RES: 1 }, difficulty: 'easy', stars: '★' }],
      },
    };
    const skeleton = { move_id: 'create-character', description: 'Create your character … FILL IN the values the player chose — do not submit this skeleton.', move: { type: 'create_character', character_name: '', race: 'human', ship_name: '', method: 'recommended', scores: {} } };
    const inp = input({ phase: 'setup', character: null }, [skeleton], { reference: ref });
    const form = formForMove(g, skeleton, inp)!;
    expect(form.fields.map((f) => f.key)).toEqual(['character_name', 'race', 'ship_name', 'disposition', 'score.SWA', 'score.ARM', 'score.HAK']);
    expect((form.fields[1] as { options: Array<{ value: string }> }).options.map((o) => o.value)).toEqual(['human', 'kralkin', 'hexapod', 'grull']);
    // The template's "human" is a placeholder, not an answer: nothing builds until the player chooses.
    expect(form.build({ character_name: 'Zara', ship_name: 'Wasp', disposition: 'none', 'score.SWA': '3' })).toBeNull();
    expect(form.build({ character_name: 'Zara', race: 'grull', ship_name: 'Wasp', disposition: 'brash', 'score.SWA': '3', 'score.HAK': '2', 'score.ARM': '0' }))
      .toEqual({ type: 'create_character', character_name: 'Zara', race: 'grull', ship_name: 'Wasp', method: 'recommended', scores: { SWA: 3, HAK: 2 }, disposition: 'brash' });
    const arch = { ...skeleton, move_id: 'create-character-archetype', move: { type: 'create_character', character_name: '', race: 'human', ship_name: '', method: 'archetype', archetype_name: '' } };
    const af = formForMove(g, arch, input({ phase: 'setup' }, [arch], { reference: ref }))!;
    expect(af.fields.map((f) => f.key)).toEqual(['character_name', 'race', 'ship_name', 'disposition', 'archetype_name']);
    expect(af.build({ character_name: 'Zara', race: 'human', ship_name: 'Wasp', disposition: 'none', archetype_name: 'Void Runner' }))
      .toEqual({ type: 'create_character', character_name: 'Zara', race: 'human', ship_name: 'Wasp', method: 'archetype', archetype_name: 'Void Runner' });
  });
});

// zekel/src/games/sweetlands-imperium/views.ts getPlayerView. Treat ids and
// random placements are the engine's ids (data/board.ts TreatId).
const SL_VIEW = {
  game_id: 'sweetlands-imperium',
  phase: 'play', round: 1, active_player_id: 's1', first_player_id: 's1',
  taxes: { '1': 0, '2': 1, '3': 0, '4': 2 }, foe: { type: 'dragon', defeated: false }, castle_occupant_id: null,
  intel_deck_count: 72, intel_discard_count: 4,
  random_treat_placement: { '1': 'ice_cream', '2': 'chocolate_bar', '3': 'gummy_bear', '4': 'cupcake' },
  players: [
    {
      player_id: 's1', kind: 'human', faction: 'milkshake', faction_name: 'Arch Duchess of Milkshake',
      home_region: 1, points: 1, influence: 2, sugar_cubes: 3, intel_tokens: ['red'],
      hand_count: 3,
      units: { leader: 'region 1 start', knight: 'region 1 ring space 2 (yellow)', ambassador: 'off-board' },
      unit_locations: {
        leader: { zone: 'start', region: 1 },
        knight: { zone: 'ring', region: 1, ringIndex: 2 },
        ambassador: { zone: 'offboard' },
      },
    },
    { player_id: 's2', kind: 'ai', faction: 'fudge', faction_name: 'General Fudge', home_region: 2, points: 0, influence: 0, sugar_cubes: 2, intel_tokens: [], hand_count: 3, units: {}, unit_locations: { leader: { zone: 'castle' } } },
  ],
  your_hand: [
    { card_id: 'i1', kind: 'single', color: 'red' },
    { card_id: 'i2', kind: 'double', color: 'blue' },
    { card_id: 'i3', kind: 'treat', treat: 'ice_cream' },
    { card_id: 'i4', kind: 'single', color: 'red' },
  ],
  your_secret_objectives: ['so1'], your_turn_step: 'play',
};

const SL_REFERENCE: GameReferenceResponse = {
  gameId: 'sweetlands-imperium', rules: '', moveSchema: {}, optionsSchema: {},
  referenceData: {
    points_to_win: 5,
    factions: [
      { id: 'milkshake', name: 'Arch Duchess of Milkshake', region: 1, color: 'yellow', ability: 'You never pay taxes.' },
      { id: 'fudge', name: 'General Fudge', region: 2, color: 'brown', ability: 'Discard 2 Intel to convert.' },
      { id: 'jellybean', name: 'Princess Jellybean', region: 3, color: 'purple', ability: 'Knight wins vs knights.' },
      { id: 'cheesecake', name: 'Grand Vizier Cheesecake', region: 4, color: 'white', ability: 'Treats go anywhere.' },
      { id: 'nomads', name: 'Deposed Queen Quiche', region: null, color: 'black', ability: '5-player only.' },
    ],
  },
};

// The engine's legal moves for one card: several per card (unit, action, route).
const SL_MOVES = [
  { move_id: 'a', description: 'Play red: move leader and take the red action.', move: { type: 'play_intel', cardId: 'i1', unit: 'leader', viaRoad: false, takeAction: true } },
  { move_id: 'b', description: 'Play red: move leader only (no action).', move: { type: 'play_intel', cardId: 'i1', unit: 'leader', viaRoad: false, takeAction: false } },
  { move_id: 'c', description: 'Play red: move knight via road and take the red action.', move: { type: 'play_intel', cardId: 'i1', unit: 'knight', viaRoad: true, takeAction: true } },
  { move_id: 'd', description: 'Use the ice_cream treat to move your ambassador to its special location.', move: { type: 'play_intel', cardId: 'i3', unit: 'ambassador', takeAction: false } },
  { move_id: 'e', description: 'Spend your red Intel token: move leader and take the red action.', move: { type: 'play_token', color: 'red', unit: 'leader', viaRoad: false, takeAction: true } },
  { move_id: 'f', description: 'Discard 4 Intel to gain one green Intel.', move: { type: 'discard_for_color', cardIds: ['i1', 'i2', 'i3', 'i4'], color: 'green' } },
  { move_id: 'g', description: 'Pass your turn to gain 1 influence.', move: { type: 'pass' } },
];

/** The printed board from docs/games/sweetlands-imperium.md, cell by cell. */
function referenceBoard(): Map<string, string> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const doc = readFileSync(path.resolve(here, '../../../../docs/games/sweetlands-imperium.md'), 'utf8');
  const block = /The printed board[\s\S]*?```([\s\S]*?)```/.exec(doc);
  expect(block, 'the printed board block in the reference').toBeTruthy();
  const cells = new Map<string, string>();
  for (const line of block![1]!.split(/\r?\n/)) {
    const m = /^\s*r(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const row = Number(m[1]);
    m[2]!.trim().split(/\s+/).forEach((tok, col) => { if (tok !== '.') cells.set(`${row},${col}`, tok); });
  }
  return cells;
}

describe('sweetlands-imperium glue', () => {
  const g = GLUES['sweetlands-imperium']!;
  it('board data matches the reference: 80 spaces + 4 junction roads', () => {
    expect(SPACES).toHaveLength(80);
    expect(Object.keys(JUNCTION_ROADS)).toHaveLength(4);
    expect(JUNCTION_ROADS['r1-ring-5']).toBe('r1-road-0');
  });
  it('every one of the 80 spaces, the 4 starts and the castle sits where the reference document prints it', () => {
    const cells = referenceBoard();
    const letter: Record<string, string> = { red: 'R', orange: 'O', yellow: 'Y', green: 'G', blue: 'B', purple: 'P' };
    const regional: Record<number, string> = { 1: 'MS', 2: 'FD', 3: 'JB', 4: 'CC' };
    const covered = new Set<string>();
    for (const sp of SPACES) {
      const tok = cells.get(`${sp.row},${sp.col}`);
      expect(tok, `${sp.id} at (${sp.row},${sp.col})`).toBeDefined();
      covered.add(`${sp.row},${sp.col}`);
      if (sp.zone === 'ring') expect(tok).toBe(`${letter[sp.color!]}${sp.region}`);
      else if (sp.zone === 'road') expect(tok).toMatch(new RegExp(`^${letter[sp.color!]}[<>^v]$`));
      else if (sp.index === 0) expect(tok).toBe(regional[sp.region]);
      else expect(tok).toBe('?');
    }
    for (const r of [1, 2, 3, 4] as const) {
      const [row, col] = TREATS[r]!.start;
      expect(cells.get(`${row},${col}`)).toBe(`S${r}`);
      covered.add(`${row},${col}`);
    }
    for (const [row, col] of CASTLE_POS) {
      expect(cells.get(`${row},${col}`)).toBe('XX');
      covered.add(`${row},${col}`);
    }
    // And nothing printed is left unplaced.
    for (const key of cells.keys()) expect(covered.has(key), `printed cell ${key} ${cells.get(key)} is on the table`).toBe(true);
    expect(cells.size).toBe(80 + 4 + 4);
  });
  it('plans the map with units, the foe and the treat art; the hand and tokens in the bench; points from the reference', () => {
    const plan = g.plan(input(SL_VIEW, [], { playerId: 's1', reference: SL_REFERENCE }))!;
    const map = plan.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(map.nodes.find((n) => n.id === 'r1-start')!.pieces).toEqual([{ label: 'leader (s1)', colorKey: 'milkshake' }]);
    expect(map.nodes.find((n) => n.id === 'r1-ring-2')!.pieces![0]!.label).toBe('knight (s1)');
    const castle = map.nodes.find((n) => n.id === 'castle')!;
    expect(castle.pieces!.map((p) => p.label)).toEqual(['foe:dragon']);
    expect(castle.badges).toEqual(['Dragon']);
    expect(map.nodes.find((n) => n.id === 'r1-treat-regional')!.artUrl).toBe('/art/sweetlands/treat-milkshake-1.png');
    expect(map.nodes.find((n) => n.id === 'r2-treat-random')!.artUrl).toBe('/art/sweetlands/treat-fudge-2.png');
    expect(map.nodes.find((n) => n.id === 'r2-treat-random')!.label).toBe('Chocolate Bar');
    expect(ids(plan.bench)).toEqual(['sl:p:s1', 'sl:tokens', 'sl:hand', 'sl:secrets']);
    expect(cards(plan.bench[2]).map((c) => c.id)).toEqual(['sl:card:i1', 'sl:card:i2', 'sl:card:i3', 'sl:card:i4']);
    expect(cards(plan.bench[2])[2]!.artUrl).toBe('/art/sweetlands/treat-milkshake-2.png');
    const me = plan.bench[0]!.data as { artUrl?: string; stats: Array<{ label: string; max?: number }> };
    expect(me.artUrl).toBe('/art/sweetlands/sweet-milkshake.jpg');
    expect(me.stats.find((s) => s.label === 'Points')!.max).toBe(5);
    expect(ids(plan.side)).toEqual(['sl:p:s2', 'sl:taxes']);
    const points = plan.points!.data as TrackData;
    expect(points.spaces).toHaveLength(6);
    expect(points.spaces[1]!.pieces).toEqual([{ label: 'milkshake (s1)', colorKey: 'milkshake' }]);
  });
  it('lights cards by the engine card id and tokens as a pool; a tap opens the chooser with that card\'s moves only', () => {
    const inp = input(SL_VIEW, SL_MOVES, { playerId: 's1', reference: SL_REFERENCE });
    expect(g.litParts(inp).sort()).toEqual(['sl:card:i1', 'sl:card:i3', 'sl:tokens']);
    // Three moves for the red card: the chooser gets all three, in the engine's words.
    const red = movesForSelect(g, { component: 'card', id: 'sl:card:i1', label: 'Red' }, inp);
    expect(red.map((m) => m.move_id)).toEqual(['a', 'b', 'c']);
    expect(g.moveForSelect({ component: 'card', id: 'sl:card:i1', label: 'Red' }, inp)).toBeNull();
    // One move for the treat: sent as is.
    expect(g.moveForSelect({ component: 'card', id: 'sl:card:i3', label: 'Ice Cream' }, inp)?.move_id).toBe('d');
    expect(movesForSelect(g, { component: 'pool', id: 'sl:tokens', label: 'tokens' }, inp).map((m) => m.move_id)).toEqual(['e']);
    // A second copy of a card the engine did not list is not lit.
    expect(g.litParts(inp)).not.toContain('sl:card:i4');
  });
  it('turns template moves into forms with nothing preselected: factions per seat, the Intel to discard, the treat slot', () => {
    const setupView = { ...SL_VIEW, phase: 'setup_factions', players: SL_VIEW.players.map((p) => ({ ...p, faction: null })) };
    const assign = { move_id: 'x', description: 'Assign each player a faction — default distinct map shown; edit to each human\'s choice.', move: { type: 'assign_setup_choices', selections: { s1: 'milkshake', s2: 'fudge' } } };
    const inp = input(setupView, [assign], { playerId: 's1', reference: SL_REFERENCE });
    const form = formForMove(g, assign, inp)!;
    expect(form.fields.map((f) => f.key)).toEqual(['seat.s1', 'seat.s2']);
    expect(form.fields[0]).toMatchObject({ kind: 'choice', label: 's1 (you)' });
    expect((form.fields[1] as { options: unknown[] }).options).toHaveLength(4); // no Nomads at two seats
    expect(form.build({})).toBeNull();
    expect(form.build({ 'seat.s1': 'fudge', 'seat.s2': 'fudge' })).toBeNull(); // no sharing
    expect(form.build({ 'seat.s1': 'jellybean', 'seat.s2': 'cheesecake' })).toEqual({ type: 'assign_setup_choices', selections: { s1: 'jellybean', s2: 'cheesecake' } });
    expect(form.editableKeys).toEqual(['selections']);

    const discard = SL_MOVES[5]!;
    const df = formForMove(g, discard, input(SL_VIEW, SL_MOVES, { playerId: 's1' }))!;
    expect(df.fields[0]).toMatchObject({ kind: 'multi', key: 'cardIds', pick: 4 });
    expect(df.build({ cardIds: ['i1'] })).toBeNull();
    expect(df.build({ cardIds: ['i4', 'i3', 'i2', 'i1'] })).toEqual({ type: 'discard_for_color', cardIds: ['i4', 'i3', 'i2', 'i1'], color: 'green' });

    const anySlot = { move_id: 'y', description: 'Cheesecake: use ice_cream to move your ambassador to ANY treat (region 1 regional shown — edit region/slot).', move: { type: 'play_intel', cardId: 'i3', unit: 'ambassador', takeAction: false, treatRegion: 1, treatSlot: 'regional' } };
    const tf = formForMove(g, anySlot, input(SL_VIEW, [anySlot], { playerId: 's1', reference: SL_REFERENCE }))!;
    expect(tf.build({})).toBeNull();
    expect(tf.build({ treatRegion: '3', treatSlot: 'random' })).toMatchObject({ treatRegion: 3, treatSlot: 'random', cardId: 'i3' });
    // A complete move has no form.
    expect(formForMove(g, SL_MOVES[6]!, inp)).toBeNull();
  });
  it('setup screen: against the AI the host picks every faction and the foe, which become the setup moves; with a friend the factions stay at the table', () => {
    const seats = [{ position: 0, kind: 'human' as const, host: true }, { position: 1, kind: 'ai' as const, host: false, aiDifficulty: 'easy' }];
    const ref: GameReferenceResponse = { ...SL_REFERENCE, referenceData: { ...(SL_REFERENCE.referenceData as object), foes: [{ type: 'dragon', dice: 5 }, { type: 'orc', dice: 3 }] } };
    const fields = g.setupFields(ref, seats);
    expect(fields.map((f) => [f.key, f.kind])).toEqual([['faction.p1', 'choice'], ['faction.p2', 'choice'], ['foe', 'choice']]);
    const f1 = fields[0]!;
    if (f1.kind !== 'choice') throw new Error('choice');
    expect(f1.options.map((o) => o.value)).toEqual(['milkshake', 'fudge', 'jellybean', 'cheesecake']); // no Nomads at two seats
    expect(g.setupMoves!({ 'faction.p1': 'cheesecake', 'faction.p2': 'jellybean', foe: 'orc' }, seats, ref)).toEqual([
      { type: 'assign_setup_choices', selections: { p1: 'cheesecake', p2: 'jellybean' } },
      { type: 'choose_foe', foe: 'orc' },
    ]);
    // Half an answer sends nothing for that step.
    expect(g.setupMoves!({ 'faction.p1': 'cheesecake', foe: 'orc' }, seats, ref)).toEqual([{ type: 'choose_foe', foe: 'orc' }]);
    // A friend's seat: their faction is theirs to choose at the table.
    const withFriend = [seats[0]!, { position: 1, kind: 'human' as const, host: false }];
    expect(g.setupFields(ref, withFriend)).toEqual([]);
    expect(g.setupFields(ref)).toEqual([]);
  });
  it('shows the Draw button for a pending report and reads no dice (sugar dice are not d6)', () => {
    const draw = { move_id: 'r', description: 'Draw 2 Intel card(s) (the server deals them when you press this).', move: { type: 'resolve_report' } };
    expect(g.resolveReportMove([draw])?.move_id).toBe('r');
    expect(g.diceFor!({ engineMove: null, summary: 'defeated the dragon (7 vs 4)!', view: null })).toBeNull();
  });
});

// zekel/src/games/cybernoir-2127/views.ts hacker player view.
const CN_VIEW = {
  phase: 'play', turn: 3, activePlayerId: 'det', playerOrder: ['det', 'hak'],
  pending: null, endgame_triggered: false, endgame_reason: null,
  board: ['Dark City Central Station', 'Xistential Club'],
  informants_facedown_count: 1, informants_revealed: [{ person: 'Anansi the Spider' }],
  jail: { slot_1_booked: ['Blackice'], slot_2_processing: [], slot_3_release_pending_then_freed: [] },
  truthful_clues: { borough: true, population: false, affiliation: false },
  truthful_values: { borough: 'downtown' },
  negative_clues: ['population_0', 'affiliation_gang_1'],
  safehouse_burned: false, hideout_card_removed: false,
  evidence: { weapon: null, witnesses: ['Eddie the Doorman'], motive_set_1: [], motive_set_2: [], motive_set_3: [], motive_set_4: [] },
  contacts_discard: ['The Weapon'],
  detective: { location_deck_size: 12, location_hand_size: 3, location_discard: ['Shipyard'], poi_deck_size: 30, mid_game_guess_spent: false, ap: 3, overclock_used: false },
  hacker: { contacts_deck_size: 20, contacts_discard_size: 1, hand_size: 2, ap: 2, overclock_used: false },
  overclock_draws_owed: 0, overclock_draw_timing: null,
  role: 'hacker',
  hand: ['Blackice', 'The Weapon'],
  hideout: { location_name: 'The Junction', borough: 'boonies', population: 2, affiliation: 'gang_1' },
  evidence_detail: {},
};

const CN_REFERENCE: GameReferenceResponse = {
  gameId: 'cybernoir-2127', rules: '', moveSchema: {}, optionsSchema: {},
  referenceData: {
    locations: [
      { name: 'Dark City Central Station', borough: 'downtown', population: 3, affiliation: 'none' },
      { name: 'Xistential Club', borough: 'downtown', population: 1, affiliation: 'gang_2' },
      { name: 'Shipyard', borough: 'boonies', population: 0, affiliation: 'corp_1' },
      { name: 'The Junction', borough: 'boonies', population: 2, affiliation: 'gang_1' },
    ],
    people: [
      { name: 'Blackice', home_location: 'The Junction', affiliation: 'gang_1', cost: 2, ability: 'board_discard', is_witness: false },
      { name: 'Anansi the Spider', home_location: 'The Junction', affiliation: 'gang_2', cost: 1, ability: 'reveal_informant', is_witness: false },
      { name: 'Eddie the Doorman', home_location: 'Xistential Club', affiliation: 'none', cost: 0, ability: 'witness', is_witness: true },
    ],
    affiliations: [
      { id: 'none', name: 'None' },
      { id: 'corp_1', name: 'OmniSuperUltra Corp' },
      { id: 'gang_1', name: 'Iceden Collective' },
      { id: 'gang_2', name: 'Crimson Clan' },
    ],
    boroughs: [
      { id: 'downtown', name: 'Downtown' },
      { id: 'boonies', name: 'Boonies' },
    ],
    evidence: { weapon: 1, witnesses: 3, motive_sets: 3, motive_set_size: 3, total: 13 },
  },
};

// The setup phase, before the Hacker has hidden: no board, no hand, and one
// legal move with a blank for the location name.
const CN_SETUP_VIEW = {
  ...CN_VIEW, phase: 'setup', turn: 1, activePlayerId: 'hak',
  board: [], hand: [], hideout: null,
  hacker: { ...CN_VIEW.hacker, hand_size: 0, ap: 0 },
};
const CN_HIDEOUT_MOVE = {
  move_id: 'report_hideout', description: 'Choose your hideout location',
  move: { type: 'report_hideout', location_name: '' },
};

describe('cybernoir-2127 glue', () => {
  const g = GLUES['cybernoir-2127']!;
  it('plans the city from the reference data with played and safehouse marks, and the hacker hand', () => {
    const plan = g.plan(input(CN_VIEW, [], { reference: CN_REFERENCE }))!;
    const map = plan.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(map.nodes).toHaveLength(4);
    expect(map.nodes.find((n) => n.id === 'cn:loc:dark-city-central-station')!.badges).toContain('played');
    // Each of the three facts a clue can name is said once, where it fits:
    // the borough is the band a region stands in, the faction is its colour,
    // and how many live there is its one badge.
    const junction = map.nodes.find((n) => n.id === 'cn:loc:the-junction')!;
    expect(junction.badges).toEqual(['safehouse', '2 residents']);
    expect(junction.area).toBe('boonies');
    expect(junction.colorKey).toBe('gang_1');
    expect(map.nodes.find((n) => n.id === 'cn:loc:dark-city-central-station')!.badges)
      .toEqual(['played', '3 residents']);
    // The bands carry the printed borough names: "Gang 1" is an alias the
    // engine happens to list, not a faction's name, and no id reaches the eye.
    expect(map.areas!.map((a) => [a.key, a.label, a.note])).toEqual([
      ['downtown', 'Downtown', '2 locations'],
      ['boonies', 'Boonies', '2 locations'],
    ]);
    expect(map.nodeShape).toBe('pill');
    expect(JSON.stringify(plan)).not.toContain('Gang ');
    // Without the reference data there is no name to print, so the id is put
    // into words rather than shown raw — and never guessed at.
    const bare = g.plan(input(CN_VIEW, [], { reference: { ...CN_REFERENCE, referenceData: { locations: (CN_REFERENCE.referenceData as { locations: unknown[] }).locations } } }))!;
    const bareMap = bare.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(bareMap.areas!.map((a) => a.label)).toEqual(['Downtown', 'Boonies']);
    expect(map.nodes.find((n) => n.id === 'cn:loc:the-junction')!.pieces).toEqual([{ label: 'safehouse', colorKey: 'safehouse' }]);
    expect(ids(plan.bench)).toEqual(['cn:hacker', 'cn:hand']);
    expect(plan.board.find((z) => z.id === 'cn:evidence')).toBeUndefined();
  });
  it('gives a Contact its cost, its field and what playing it does, without a tooltip', () => {
    const plan = g.plan(input(CN_VIEW, [], { reference: CN_REFERENCE }))!;
    const hand = cards(plan.bench.find((z) => z.id === 'cn:hand'));
    expect(hand[0]).toEqual({
      id: 'cn:hand:0:Blackice', label: 'Blackice', colorKey: 'gang_1',
      groupKey: 'gang_1', cost: 2, subtitle: 'Board Discard', badges: ['Iceden Collective'],
    });
    // The Weapon is in the Contacts deck but not among the people; it is drawn
    // as itself rather than given facts it does not have.
    expect(hand[1]).toEqual({ id: 'cn:hand:1:The Weapon', label: 'The Weapon', colorKey: 'none' });
    // A Witness says so, and its ability line would only repeat the badge.
    const witness = g.plan(input({ ...CN_VIEW, hand: ['Eddie the Doorman'] }, [], { reference: CN_REFERENCE }))!;
    expect(cards(witness.bench.find((z) => z.id === 'cn:hand'))[0])
      .toEqual({ id: 'cn:hand:0:Eddie the Doorman', label: 'Eddie the Doorman', colorKey: 'none', groupKey: 'none', cost: 0, badges: ['Witness'] });
  });

  it('tells the Hacker how many informants are facing them, which is their central risk', () => {
    const plan = g.plan(input(CN_VIEW, [], { reference: CN_REFERENCE }))!;
    const stats = (plan.bench.find((z) => z.id === 'cn:hacker')!.data as TableauData).stats!;
    expect(stats.find((st) => st.label === 'Informants facing you')!.value).toBe(1);
  });

  it("gives the Detective their own hand's facts, and their own informants' names", () => {
    const det = {
      ...CN_VIEW, role: 'detective', hideout: null,
      location_hand: ['The Junction'],
      informants: [{ person: 'Blackice', revealed: false }, { person: 'Anansi the Spider', revealed: true }],
    };
    const plan = g.plan(input(det, [], { reference: CN_REFERENCE }))!;
    // A Location shows who lives there: residents are what playing it reaches.
    expect(cards(plan.bench.find((z) => z.id === 'cn:hand'))[0]).toEqual({
      id: 'cn:hand:0:The Junction', label: 'The Junction', colorKey: 'gang_1',
      groupKey: 'boonies', subtitle: 'Blackice, Anansi the Spider',
      badges: ['Boonies', '2 residents', 'Iceden Collective'],
    });
    // They pay to hold their informants and are the one person entitled to
    // know who they are; the line says whether the Hacker has seen them.
    const informants = cards(plan.bench.find((z) => z.id === 'cn:informants'));
    // Each wears their own faction, not the seat that holds them.
    expect(informants.map((c) => [c.label, c.subtitle, c.cost, c.colorKey])).toEqual([
      ['Blackice', 'face down to the Hacker', 2, 'gang_1'],
      ['Anansi the Spider', 'revealed to the Hacker', 1, 'gang_2'],
    ]);
    expect(informants.every((c) => c.face !== 'down')).toBe(true);
  });

  it('puts the case file in the points track, in the shape the printed sheet has it', () => {
    const plan = g.plan(input(CN_VIEW, [], { reference: CN_REFERENCE }))!;
    const caseFile = plan.points!;
    expect(caseFile.kind).toBe('tableau');
    expect((caseFile.data as TableauData).label).toBe('Your case');
    // Five rows, and thirteen slots between them from turn one.
    const rows = (caseFile as { children?: Zone[] }).children!;
    const shape = rows.map((r) => {
      const d = r.data as CardZoneData;
      return [d.label, (d.cards ?? []).length, d.empty];
    });
    expect(shape).toEqual([
      ['Weapon', 0, 1],
      ['Witnesses', 1, 2],
      ['Motive First', 0, 3],
      ['Motive Second', 0, 3],
      ['Motive Third', 0, 3],
    ]);
    const slots = shape.reduce((n, [, cards, empty]) => n + (cards as number) + (empty as number), 0);
    expect(slots).toBe(13);
    // The count is the engine's: played over the total it publishes.
    expect((caseFile.data as TableauData).stats).toEqual([{ label: 'Evidence', value: 1, max: 13 }]);
    // The Detective sees the same thirteen, as the threat they are.
    const det = g.plan(input({ ...CN_VIEW, role: 'detective', hideout: null, location_hand: [] }, [], { reference: CN_REFERENCE }))!;
    expect((det.points!.data as TableauData).label).toBe("The Hacker's case");
  });

  it("gives the Detective what is printed on the Hacker's Evidence, which is how the case is solved", () => {
    const played = {
      ...CN_VIEW, role: 'detective', hideout: null, location_hand: [], informants: [],
      evidence: {
        ...CN_VIEW.evidence,
        witnesses: ['Eddie the Doorman'],
        motive_set_1: ['Blackice', 'Anansi the Spider'],
      },
    };
    const rows = (g.plan(input(played, [], { reference: CN_REFERENCE }))!.points as { children?: Zone[] }).children!;
    const witnesses = cards(rows.find((r) => r.id === 'cn:case:witnesses'));
    // Where they live is the fact that narrows nineteen locations down.
    expect(witnesses[0]).toEqual({
      id: 'cn:ev:witness:Eddie the Doorman', label: 'Eddie the Doorman',
      colorKey: 'none', subtitle: 'at Xistential Club', cost: 0, badges: ['Witness'],
    });
    const motive = cards(rows.find((r) => r.id === 'cn:case:motive_set_1'));
    expect(motive.map((c) => [c.label, c.subtitle, c.badges])).toEqual([
      ['Blackice', 'at The Junction', ['Iceden Collective']],
      ['Anansi the Spider', 'at The Junction', ['Crimson Clan']],
    ]);
    // The Weapon is not a person and is drawn as itself.
    const weapon = cards(rows.find((r) => r.id === 'cn:case:weapon'));
    expect(weapon).toEqual([]);
    // The Hacker sees the same on their own case: it is their own card's
    // printed face either way.
    const mine = (g.plan(input({ ...played, role: 'hacker' }, [], { reference: CN_REFERENCE }))!.points as { children?: Zone[] }).children!;
    expect(cards(mine.find((r) => r.id === 'cn:case:witnesses'))[0]!.subtitle).toBe('at Xistential Club');
  });

  it('draws no slot outlines when the engine does not publish the shape of the win', () => {
    const rd = CN_REFERENCE.referenceData as Record<string, unknown>;
    const older = { ...CN_REFERENCE, referenceData: { ...rd, evidence: undefined } };
    const rows = (g.plan(input(CN_VIEW, [], { reference: older }))!.points as { children?: Zone[] }).children!;
    expect(rows.every((r) => (r.data as CardZoneData).empty === undefined)).toBe(true);
    // Still the rows the view names, with what is actually on the table.
    expect(rows.map((r) => (r.data as CardZoneData).label)).toEqual(['Weapon', 'Witnesses', 'Motive First', 'Motive Second', 'Motive Third', 'Motive Fourth']);
    expect((g.plan(input(CN_VIEW, [], { reference: older }))!.points!.data as TableauData).stats)
      .toEqual([{ label: 'Evidence', value: 1 }]);
  });

  it('draws the clue rail both seats share: a slot per category, and the ruled out tokens', () => {
    const plan = g.plan(input(CN_VIEW, [], { reference: CN_REFERENCE }))!;
    const rail = plan.board.find((z) => z.id === 'cn:clues')!;
    expect(rail.span).toBe('full');
    expect((rail.data as TrackData).spaces).toEqual([
      { index: 'Borough', label: 'Downtown', filled: true },
      { index: 'Population', label: undefined, filled: false },
      { index: 'Affiliation', label: undefined, filled: false },
    ]);
    // A ruled-out token is a category and a printed value, not "NOT ×4".
    const nots = plan.board.find((z) => z.id === 'cn:not-clues')!;
    expect((nots.data as PoolData).label).toBe('Ruled out (2)');
    expect((nots.data as PoolData).items.map((i) => i.label))
      .toEqual(['Population 0', 'Affiliation Iceden Collective']);
    // Both seats see the same rail: it is public.
    const det = g.plan(input({ ...CN_VIEW, role: 'detective', hideout: null, location_hand: [] }, [], { reference: CN_REFERENCE }))!;
    expect(det.board.find((z) => z.id === 'cn:clues')!.data).toEqual(rail.data);
  });

  it('draws an empty rail before any clue is given, and says so', () => {
    const fresh = { ...CN_VIEW, truthful_clues: {}, truthful_values: {}, negative_clues: [] };
    const plan = g.plan(input(fresh, [], { reference: CN_REFERENCE }))!;
    expect((plan.board.find((z) => z.id === 'cn:clues')!.data as TrackData).spaces.every((sp) => !sp.filled)).toBe(true);
    const nots = plan.board.find((z) => z.id === 'cn:not-clues')!.data as PoolData;
    expect(nots.label).toBe('Ruled out — nothing yet');
    expect(nots.items).toEqual([]);
  });

  it('offers the turn as verbs, only where the engine lists a move behind one', () => {
    const moves = [
      { move_id: 'pl1', description: 'Play Shipyard (mandatory)', move: { type: 'play_location', location_name: 'Shipyard' } },
      { move_id: 'pl2', description: 'Play The Junction (mandatory)', move: { type: 'play_location', location_name: 'The Junction' } },
      { move_id: 'a1', description: 'Arrest Blackice at The Junction', move: { type: 'arrest', target_person: 'Blackice' } },
      { move_id: 'burn', description: 'Burn the Safehouse (3 AP, once per game): relocate to a new secret hideout — discarded Locations return to the deck and ALL Clue tokens (truthful and Negative) are removed from the table', move: { type: 'burn_safehouse' } },
      { move_id: 'end', description: 'End turn', move: { type: 'pass_turn' } },
    ];
    const det = { ...CN_VIEW, role: 'detective', hideout: null, location_hand: [], informants: [] };
    const prompt = g.plan(input(det, moves, { reference: CN_REFERENCE }))!.prompt!;
    expect(prompt.actions.map((a) => a.label)).toEqual(['Play a Location', 'Arrest', 'Burn the safehouse', 'End turn']);
    // A verb several moves stand behind says how many and carries them all;
    // one move behind it carries the engine's own sentence.
    const play = prompt.actions[0] as { note?: string; title?: string; moves: LegalMove[] };
    expect(play.note).toBe('2 to choose from');
    expect(play.moves).toHaveLength(2);
    const arrest = prompt.actions[1] as { note?: string; title?: string; moves: LegalMove[] };
    expect(arrest.note).toBeUndefined();
    expect(arrest.title).toBe('Arrest Blackice at The Junction');
    // The burn paragraph is the button's title, never its label.
    const burn = prompt.actions[2] as { label: string; title?: string };
    expect(burn.label).toBe('Burn the safehouse');
    expect(burn.title!.length).toBeGreaterThan(100);
    // No verb the engine did not list.
    expect(prompt.actions.some((a) => a.label === 'Recruit an informant')).toBe(false);
    // Nothing is offered when the engine lists nothing.
    expect(g.plan(input(det, [], { reference: CN_REFERENCE }))!.prompt).toBeUndefined();
    // But a move no verb claims still gets one, in the engine's own word for
    // it: the bar was empty at exactly the moment the engine was waiting.
    const followUp = [{
      move_id: 'bd', description: 'Discard a Location from the board: Shipyard',
      move: { type: 'board_discard_choice', target_location: 'Shipyard' },
    }];
    const asked = g.plan(input(det, followUp, { reference: CN_REFERENCE }))!.prompt!;
    expect(asked.actions.map((a) => [a.label, a.title])).toEqual([
      ['Board Discard', 'Discard a Location from the board: Shipyard'],
    ]);
  });

  it('draws who the Detective can reach, and what a tap on a person could mean', () => {
    const det = {
      ...CN_VIEW, role: 'detective', hideout: null, location_hand: [],
      board: ['The Junction'],
      informants: [{ person: 'Anansi the Spider', revealed: false }],
      jail: { slot_1_booked: [], slot_2_processing: [], slot_3_release_pending_then_freed: [] },
    };
    const moves = [
      { move_id: 'a', description: 'Arrest Blackice at The Junction', move: { type: 'arrest', target_person: 'Blackice' } },
      { move_id: 'r', description: 'Recruit Blackice as informant', move: { type: 'recruit_informant', target_person: 'Blackice' } },
    ];
    const inp = input(det, moves, { reference: CN_REFERENCE });
    const reach = g.plan(inp)!.side.find((z) => z.id === 'cn:reach')!;
    // Everyone living at a played Location, with the ones already spoken for
    // drawn unlit and saying where they are.
    expect(cards(reach).map((c) => [c.label, c.subtitle, c.colorKey])).toEqual([
      ['Blackice', 'Board Discard', 'gang_1'],
      ['Anansi the Spider', 'your informant', 'out_of_reach'],
    ]);
    // Not the Contact's play cost: that is the Hacker's price, not theirs.
    expect(cards(reach).every((c) => c.cost === undefined)).toBe(true);
    // Every arrest and recruit the engine lists has something on screen to tap.
    expect(g.litParts(inp)).toContain('cn:person:blackice');
    // Both prices on one person: the tap asks which, in the engine's words.
    const options = movesForSelect(g, { component: 'card', id: 'cn:person:blackice', label: 'Blackice' }, inp);
    expect(options.map((m) => m.description)).toEqual(['Arrest Blackice at The Junction', 'Recruit Blackice as informant']);
    // A person nobody can reach lights nothing.
    expect(g.litParts(inp)).not.toContain('cn:person:anansi-the-spider');
  });

  it('lights a card in hand wherever it can be played, for either seat', () => {
    // The Detective's Locations: the card in hand lights, not only the region.
    const det = { ...CN_VIEW, role: 'detective', hideout: null, location_hand: ['Shipyard', 'The Junction'], informants: [] };
    const play = { move_id: 'pl', description: 'Play Shipyard', move: { type: 'play_location', location_name: 'Shipyard' } };
    const detIn = input(det, [play], { reference: CN_REFERENCE });
    const lit = g.litParts(detIn);
    expect(lit).toContain('cn:hand:0:Shipyard');
    expect(lit).toContain('cn:loc:shipyard');
    expect(lit).not.toContain('cn:hand:1:The Junction');
    // And tapping the card in hand means that move.
    expect(movesForSelect(g, { component: 'card', id: 'cn:hand:0:Shipyard', label: 'Shipyard' }, detIn).map((m) => m.move_id))
      .toEqual(['pl']);

    // The Hacker's Contacts, the same way.
    const hakIn = input(CN_VIEW, [
      { move_id: 'pp', description: 'Play Blackice (2 AP)', move: { type: 'play_person', person_name: 'Blackice' } },
    ], { reference: CN_REFERENCE });
    expect(g.litParts(hakIn)).toContain('cn:hand:0:Blackice');
    expect(movesForSelect(g, { component: 'card', id: 'cn:hand:0:Blackice', label: 'Blackice' }, hakIn).map((m) => m.move_id))
      .toEqual(['pp']);
  });

  it('names who is in each jail slot, rather than drawing them as dots', () => {
    const held = {
      ...CN_VIEW,
      jail: {
        slot_1_booked: ['Blackice'],
        slot_2_processing: [],
        slot_3_release_pending_then_freed: ['Anansi the Spider', 'Eddie the Doorman'],
      },
    };
    const jail = g.plan(input(held, [], { reference: CN_REFERENCE }))!.board.find((z) => z.id === 'cn:jail')!;
    const d = jail.data as TrackData;
    expect(d.label).toBe('Jail · 3 held');
    expect(d.pieceShape).toBe('named');
    expect(d.arrows).toBe(true);
    expect(d.spaces.map((sp) => [sp.index, sp.filled, (sp.pieces ?? []).map((p) => [p.label, p.colorKey])])).toEqual([
      ['Booked', true, [['Blackice', 'gang_1']]],
      ['Processing', false, []],
      ['Release pending', true, [['Anansi the Spider', 'gang_2'], ['Eddie the Doorman', 'none']]],
    ]);
    // An empty jail says so rather than showing three bare slots.
    const none = { ...CN_VIEW, jail: { slot_1_booked: [], slot_2_processing: [], slot_3_release_pending_then_freed: [] } };
    const empty = g.plan(input(none, [], { reference: CN_REFERENCE }))!.board.find((z) => z.id === 'cn:jail')!;
    expect((empty.data as TrackData).label).toBe('Jail · nobody held');
  });

  it('asks twice before spending what you only get to spend once', () => {
    const det = { ...CN_VIEW, role: 'detective', hideout: null, location_hand: [], informants: [] };
    const guess = {
      move_id: 'g', description: "Guess Shizuoka Megamall as Hacker's hideout (4 AP)",
      move: { type: 'guess_location', location_name: 'Shizuoka Megamall' },
    };
    const inp = input(det, [guess], { reference: CN_REFERENCE });
    // A tap on the map means the guess now, and it does not go out on the tap.
    expect(movesForSelect(g, { component: 'map', id: 'cn:loc:shizuoka-megamall', label: '' }, inp).map((m) => m.move_id)).toEqual(['g']);
    const sheet = g.formFor!(guess, inp)!;
    expect(sheet.title).toBe('Guess the hideout?');
    // What it costs comes from the engine's own sentence, not from here.
    expect(sheet.help).toBe("Guess Shizuoka Megamall as Hacker's hideout (4 AP)");
    expect(sheet.fields).toEqual([]);
    expect(sheet.submitLabel).toBe('Guess it');
    expect(sheet.build({})).toEqual(guess.move);
    // And what it sends is the move the engine listed, unchanged.
    expect(isSubmissionAllowed('form', sheet.build({})!, [guess], {
      template: sheet.template.move, editableKeys: sheet.editableKeys,
    })).toBe(true);

    // Playing a Location is an ordinary turn action and still goes on the tap.
    const play = { move_id: 'p', description: 'Play Shipyard', move: { type: 'play_location', location_name: 'Shipyard' } };
    expect(g.formFor!(play, input(det, [play], { reference: CN_REFERENCE }))).toBeNull();
  });

  it('asks what happens to each informant at upkeep, with nothing preselected', () => {
    const det = {
      ...CN_VIEW, role: 'detective', hideout: null, location_hand: [],
      informants: [{ person: 'Blackice', revealed: false }, { person: 'Anansi the Spider', revealed: true }],
    };
    // The engine lists every combination; the form finds the one the answers make.
    const listed = [
      { move_id: 'u0', description: 'Release all informants (Blackice, Anansi the Spider)', move: { type: 'upkeep_choice', keep: [], release: ['Blackice', 'Anansi the Spider'] } },
      { move_id: 'u1', description: 'Keep Blackice (1 AP); release Anansi the Spider', move: { type: 'upkeep_choice', keep: ['Blackice'], release: ['Anansi the Spider'] } },
      { move_id: 'u3', description: 'Keep all informants (2 AP)', move: { type: 'upkeep_choice', keep: ['Blackice', 'Anansi the Spider'], release: [] } },
    ];
    const inp = input(det, listed, { reference: CN_REFERENCE });
    const form = g.formFor!(listed[1]!, inp)!;
    expect(form.title).toBe('Pay upkeep');
    expect(form.fields.map((f) => f.label)).toEqual(['Blackice', 'Anansi the Spider']);
    // Nothing is preselected, and a half-answered form sends nothing.
    expect(form.build({})).toBeNull();
    expect(form.build({ 'inf.Blackice': 'keep' })).toBeNull();
    // What it sends is a move the engine listed, not one assembled here.
    expect(form.build({ 'inf.Blackice': 'keep', 'inf.Anansi the Spider': 'release' }))
      .toEqual({ type: 'upkeep_choice', keep: ['Blackice'], release: ['Anansi the Spider'] });
    expect(form.build({ 'inf.Blackice': 'keep', 'inf.Anansi the Spider': 'keep' }))
      .toEqual({ type: 'upkeep_choice', keep: ['Blackice', 'Anansi the Spider'], release: [] });
    // And the verb bar offers it as one press rather than sixteen sentences.
    expect(g.plan(inp)!.prompt!.actions.map((a) => a.label)).toEqual(['Pay upkeep']);
  });

  it('stops the turn for a block, states both doors, and preselects neither', () => {
    const pending = { ...CN_VIEW, role: 'detective', hideout: null, location_hand: [], pending: 'block_pending' };
    const moves = [
      { move_id: 'yes', description: 'Block Frostbyte by revealing informant', move: { type: 'block_decide', block: true } },
      { move_id: 'no', description: 'Decline to block — let the play proceed', move: { type: 'block_decide', block: false } },
    ];
    const prompt = g.plan(input(pending, moves, { reference: CN_REFERENCE }))!.prompt!;
    expect(prompt.title).toBe('Block this play?');
    expect(prompt.urgent).toBe(true);
    expect(prompt.actions.map((a) => [a.label, a.title])).toEqual([
      ['Block it', 'Block Frostbyte by revealing informant'],
      ['Let it through', 'Decline to block — let the play proceed'],
    ]);
    // The turn's own verbs wait: one question at a time.
    expect(prompt.actions.some((a) => a.label === 'End turn')).toBe(false);
  });

  it('asks the Hacker which clue the block bought, category by category', () => {
    const pending = { ...CN_VIEW, pending: 'clue_reveal_pending' };
    const moves = [
      { move_id: 'b', description: 'Reveal your hideout borough', move: { type: 'clue_reveal', category: 'borough', value: 'boonies' } },
      { move_id: 'p', description: 'Reveal your hideout population', move: { type: 'clue_reveal', category: 'population', value: 2 } },
    ];
    const prompt = g.plan(input(pending, moves, { reference: CN_REFERENCE }))!.prompt!;
    expect(prompt.title).toBe('Which clue do you give?');
    expect(prompt.urgent).toBe(true);
    expect(prompt.actions.map((a) => a.label)).toEqual(['Borough', 'Population']);
  });

  it('folds a big hand by what its cards stack with, and names the stacks', () => {
    const big = { ...CN_VIEW, hand: Array.from({ length: 13 }, (_, i) => (i % 2 === 0 ? 'Blackice' : 'Anansi the Spider')) };
    const zone = g.plan(input(big, [], { reference: CN_REFERENCE }))!.bench.find((z) => z.id === 'cn:hand')!;
    const d = zone.data as CardZoneData;
    expect(d.cards!.every((c) => !!c.groupKey)).toBe(true);
    expect(d.groupNames!['gang_1']).toBe('Iceden Collective');
    expect(d.groupNames!['gang_2']).toBe('Crimson Clan');
    // The Detective's Locations stack by borough instead.
    const det = { ...CN_VIEW, role: 'detective', hideout: null, location_hand: ['The Junction', 'Shipyard'] };
    const locZone = g.plan(input(det, [], { reference: CN_REFERENCE }))!.bench.find((z) => z.id === 'cn:hand')!;
    expect((locZone.data as CardZoneData).cards!.map((c) => c.groupKey)).toEqual(['boonies', 'boonies']);
    expect((locZone.data as CardZoneData).groupNames!['boonies']).toBe('Boonies');
  });

  it('lights locations named by play_location moves and informants by ordinal', () => {
    const moves = [
      { move_id: 'pl', description: 'Play Dark City Central Station', move: { type: 'play_location', location_name: 'Dark City Central Station' } },
      { move_id: 'ri', description: 'Reveal the first informant', move: { type: 'reveal_informant', target_informant: 'first' } },
    ];
    const inp = input(CN_VIEW, moves, { reference: CN_REFERENCE });
    expect(g.litParts(inp)).toEqual(['cn:loc:dark-city-central-station', 'cn:informant:first']);
    expect(g.moveForSelect({ component: 'map', id: 'cn:loc:dark-city-central-station', label: '' }, inp)?.move_id).toBe('pl');
  });

  it('lets the Hacker pick the hideout at setup: the whole city is lit and a tap names it back before it is sent', () => {
    const memory = new Map<string, unknown>();
    const inp = input(CN_SETUP_VIEW, [CN_HIDEOUT_MOVE], { reference: CN_REFERENCE, memory });
    expect(g.plan(inp)!.prompt!.title).toBe('Choose your hideout');
    expect(g.litParts(inp)).toEqual([
      'cn:loc:dark-city-central-station', 'cn:loc:xistential-club', 'cn:loc:shipyard', 'cn:loc:the-junction',
    ]);
    // The tap sends nothing on its own: it opens the sheet for that location.
    const tap = g.moveForSelect({ component: 'map', id: 'cn:loc:the-junction', label: '' }, inp);
    expect(tap?.move_id).toBe('report_hideout');
    const sheet = g.formFor!(tap!, inp)!;
    expect(sheet.title).toBe('Hide in The Junction?');
    expect(sheet.help).toContain('Boonies · 2 residents · Iceden Collective');
    expect(sheet.help).toContain('Blackice, Anansi the Spider live here');
    expect(sheet.fields).toEqual([]);
    expect(sheet.build({})).toEqual({ type: 'report_hideout', location_name: 'The Junction' });
    expect(sheet.editableKeys).toEqual(['location_name']);
    // And the door lets the finished move through, as a form the person sent.
    expect(isSubmissionAllowed('form', sheet.build({})!, [CN_HIDEOUT_MOVE], {
      template: sheet.template.move, editableKeys: sheet.editableKeys,
    })).toBe(true);
  });

  it('asks the whole city when the Hacker reaches the hideout through the move menu instead of the map', () => {
    const inp = input(CN_SETUP_VIEW, [CN_HIDEOUT_MOVE], { reference: CN_REFERENCE });
    const sheet = g.formFor!(CN_HIDEOUT_MOVE, inp)!;
    expect(sheet.title).toBe('Choose your hideout');
    expect(sheet.fields.map((f) => f.key)).toEqual(['location_name']);
    const options = (sheet.fields[0] as { options: Array<{ value: string; hint?: string }> }).options;
    expect(options.map((o) => o.value)).toHaveLength(4);
    expect(options.find((o) => o.value === 'Shipyard')!.hint).toBe('Boonies · 0 residents · OmniSuperUltra Corp');
    // Nothing is preselected, and a location the engine never named is refused.
    expect(sheet.build({})).toBeNull();
    expect(sheet.build({ location_name: 'Nowhere' })).toBeNull();
    expect(sheet.build({ location_name: 'Shipyard' })).toEqual({ type: 'report_hideout', location_name: 'Shipyard' });
  });

  it('reads a tap once, so a later press with no fresh tap asks the whole question again', () => {
    const memory = new Map<string, unknown>();
    const inp = input(CN_SETUP_VIEW, [CN_HIDEOUT_MOVE], { reference: CN_REFERENCE, memory });
    g.moveForSelect({ component: 'map', id: 'cn:loc:shipyard', label: '' }, inp);
    expect(g.formFor!(CN_HIDEOUT_MOVE, inp)!.title).toBe('Hide in Shipyard?');
    expect(g.formFor!(CN_HIDEOUT_MOVE, inp)!.title).toBe('Choose your hideout');
  });

  it('tells the Detective to wait while the Hacker hides, and lights nothing', () => {
    const waiting = { ...CN_SETUP_VIEW, role: 'detective', location_hand: [] };
    const inp = input(waiting, [], { reference: CN_REFERENCE });
    expect(g.plan(inp)!.prompt).toEqual({
      title: 'The Hacker is choosing a hideout', sub: 'The city opens once they have hidden.', actions: [],
    });
    expect(g.litParts(inp)).toEqual([]);
  });

  it("names the Hacker's own safehouse on the map and in their panel, and marks nothing when the view will not name it", () => {
    const named = g.plan(input(CN_VIEW, [], { reference: CN_REFERENCE }))!;
    const namedMap = named.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(namedMap.nodes.find((n) => n.id === 'cn:loc:the-junction')!.pieces).toEqual([{ label: 'safehouse', colorKey: 'safehouse' }]);
    const panel = (z: TablePlan) => (z.bench.find((b) => b.id === 'cn:hacker')!.data as TableauData).stats!;
    expect(panel(named).find((st) => st.label === 'Safehouse')!.value).toBe('The Junction');

    // A view that gives only the three printed facts marks no node: two
    // locations share them, so a mark would be a guess.
    const factsOnly = { ...CN_VIEW, hideout: { location_name: null, borough: 'boonies', population: 2, affiliation: 'gang_1' } };
    const quiet = g.plan(input(factsOnly, [], { reference: CN_REFERENCE }))!;
    const quietMap = quiet.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(quietMap.nodes.every((n) => (n.pieces ?? []).length === 0)).toBe(true);
    expect(panel(quiet).find((st) => st.label === 'Safehouse')!.value).toBe('Boonies · Iceden Collective');

    // The Detective's view carries no hideout at all: no mark, no stat.
    const det = g.plan(input({ ...CN_VIEW, role: 'detective', hideout: null, location_hand: [] }, [], { reference: CN_REFERENCE }))!;
    const detMap = det.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(detMap.nodes.every((n) => (n.pieces ?? []).length === 0)).toBe(true);
    expect((det.side.find((z) => z.id === 'cn:hacker')!.data as TableauData).stats!.some((st) => st.label === 'Safehouse')).toBe(false);
  });

  it("leaves an AI Hacker's nameless hideout move alone — that one the engine picks secretly", () => {
    const nameless = { move_id: 'report_hideout', description: 'AI Hacker chooses its hideout secretly', move: { type: 'report_hideout' } };
    const inp = input(CN_SETUP_VIEW, [nameless], { reference: CN_REFERENCE });
    expect(g.formFor!(nameless, inp)).toBeNull();
    expect(g.litParts(inp)).toEqual([]);
    expect(g.plan(inp)!.prompt!.title).toBe('The Hacker is choosing a hideout');
  });
});

describe('the generic template form', () => {
  it('asks for every field of a move the engine says to fill in, typed from the template, with nothing preselected', () => {
    const skeleton = {
      move_id: 'setup', description: "Set up the R1 encounter — FILL IN the player's choices: crew_names, start_location (r9c1 or r9c9), threat_level (1-3), attacker_placements (exactly 3).",
      move: { type: 'setup_encounter', crew_names: [], include_character: true, start_location: 'r9c1', threat_level: 1, attacker_placements: [] },
    };
    const form = templateForm(skeleton)!;
    expect(form.fields.map((f) => [f.key, f.kind])).toEqual([
      ['crew_names', 'text'], ['include_character', 'choice'], ['start_location', 'text'], ['threat_level', 'number'], ['attacker_placements', 'text'],
    ]);
    expect((form.fields[2] as { placeholder?: string }).placeholder).toBe('r9c1');
    // The template's defaults are not answers: every field must be answered
    // (a list may be answered with nothing, on purpose).
    expect(form.build({})).toBeNull();
    expect(form.build({ crew_names: '', include_character: 'yes', start_location: 'r9c9', threat_level: '2' })).toBeNull();
    expect(form.build({ crew_names: '', include_character: 'yes', start_location: 'r9c9', threat_level: '2', attacker_placements: 'r1c2, r3c3, r5c1' }))
      .toEqual({ type: 'setup_encounter', crew_names: [], include_character: true, start_location: 'r9c9', threat_level: 2, attacker_placements: ['r1c2', 'r3c3', 'r5c1'] });
    expect(form.editableKeys).toEqual(['crew_names', 'include_character', 'start_location', 'threat_level', 'attacker_placements']);
  });
  it('asks only for the blanks of a move with empty strings, and nothing for a complete move', () => {
    const blanks = { move_id: 'n', description: 'Name it.', move: { type: 'rename', name: '', keep: 'x' } };
    expect(templateForm(blanks)!.fields.map((f) => f.key)).toEqual(['name']);
    expect(templateForm({ move_id: 'p', description: 'Pass.', move: { type: 'pass' } })).toBeNull();
    expect(templateForm({ move_id: 'r', description: 'Recall ALL your units.', move: { type: 'recall', units: ['leader'] } })).toBeNull();
  });
});

describe('cybernoir-2127 setup', () => {
  const g = GLUES['cybernoir-2127']!;
  const ref: GameReferenceResponse = {
    gameId: 'cybernoir-2127', rules: '', moveSchema: {}, referenceData: {},
    optionsSchema: { type: 'object', properties: {
      detective: { type: 'string', description: 'player_id of the Detective' },
      overclock_draw_timing: { enum: ['immediate', 'next_turn', 'optional'], description: 'When Overclock grants the draws.' },
    } },
  };
  const seats = [{ position: 0, kind: 'human' as const, host: true }, { position: 1, kind: 'ai' as const, host: false }];
  it("asks which role the host plays and turns it into the engine's detective option, beside the rules choice", () => {
    const fields = g.setupFields(ref, seats);
    expect(fields.map((f) => f.key)).toEqual(['role', 'overclock_draw_timing']);
    expect(g.setupOptions!({ role: 'hacker', overclock_draw_timing: 'optional' }, seats)).toEqual({ detective: 'p2', overclock_draw_timing: 'optional' });
    expect(g.setupOptions!({ role: 'detective', overclock_draw_timing: 'immediate' }, seats)).toEqual({ detective: 'p1', overclock_draw_timing: 'immediate' });
    // Unanswered: the engine's own default stands rather than a guess.
    expect(g.setupOptions!({}, seats)).toEqual({});
    // Without the option in the schema, no role field.
    expect(g.setupFields({ ...ref, optionsSchema: { type: 'object', properties: {} } }, seats)).toEqual([]);
  });
});

describe('guards', () => {
  it('every glue refuses unknown view shapes and falls back to the JSON inspector', () => {
    const junk = { nonsense: true };
    for (const g of Object.values(GLUES)) {
      expect(g.plan(input(junk))).toBeNull();
    }
  });
});
