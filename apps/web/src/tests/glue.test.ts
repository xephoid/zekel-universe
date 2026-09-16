// Glue mapping tests with fixture views matching the engine's REAL view
// shape for each game (zekel src/games/<id>/views.ts). Legal move fixtures
// follow the engine's LegalMove shape: { move_id, description, move }.

import { describe, expect, it } from 'vitest';
import type { GameReferenceResponse } from '@universe/shared';
import type { CardZoneData, MapData, TrackData } from '@universe/primitives';
import { GLUES } from '../glue';
import type { GlueInput, Zone } from '../glue';
import { SPACES, JUNCTION_ROADS } from '../glue/sweetlands-board';

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
      { id: 'quicken', name: 'Quicken', type: 'TECHNIQUE', cost: 2, description: '+2 Draw.' },
      { id: 'center', name: 'Center', type: 'TECHNIQUE', cost: 2, description: '+2 Spirit.' },
      { id: 'attack', name: 'Attack', type: 'TECHNIQUE', cost: 4, description: '+1 Damage.' },
      { id: 'block', name: 'Block', type: 'TECHNIQUE', cost: 3, description: '+1 Defense.' },
      { id: 'momentum', name: 'Momentum', type: 'RESOURCE', cost: 3, value: 2, description: '2 spirit.' },
      { id: 'grand-finale', name: 'Grand Finale', type: 'TECHNIQUE', cost: 10, description: '+5 Damage.', faction: 'Titan Entertainment' },
    ],
    max_missteps: 10,
  },
  moveSchema: {},
  optionsSchema: { type: 'object', properties: { loadout: { type: 'array', description: 'Seven techniques. ASK THE PLAYER.' } } },
};

describe('fractured-fist glue', () => {
  const g = GLUES['fractured-fist']!;
  it('plans the bench (hand, deck, discard), the side (tableaux) and the board (played rows, supplies)', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(plan).not.toBeNull();
    expect(ids(plan.bench)).toEqual(['p:p1:hand', 'p:p1:deck', 'p:p1:discard']);
    expect(ids(plan.side)).toContain('p:p2:tableau');
    expect(ids(plan.side)).toContain('p:p1:tableau');
    expect(ids(plan.side)).toContain('p:p2:hand');
    // Both supplies sit near the centre, each still its owner's.
    expect(ids(plan.board)).toEqual(['ff:phase', 'p:p1:played', 'p:p1:supply', 'p:p2:played', 'p:p2:supply']);
    expect(plan.status).toBe('Round 2 · Technique phase');
  });
  it('names cards from the reference data and shows the misstep cap from it, never from a constant', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    const hand = cards(plan.bench[0]);
    expect(hand.map((c) => c.label)).toEqual(['Focus', 'Misstep', 'Quicken', 'Center', 'Focus']);
    expect(hand[2]!.badges).toContain('cost 2');
    const tableau = plan.side.find((z) => z.id === 'p:p1:tableau')!;
    const stats = (tableau.data as { stats: Array<{ label: string; value: unknown; max?: number }> }).stats;
    expect(stats.find((s) => s.label === 'Missteps')).toEqual({ label: 'Missteps', value: 3, max: 10 });
    expect(stats.find((s) => s.label === 'Stamina')).toEqual({ label: 'Stamina', value: 6, max: 7 });
    // Without reference data the cap is simply absent.
    const bare = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1' }))!;
    const bareStats = (bare.side.find((z) => z.id === 'p:p1:tableau')!.data as { stats: Array<{ label: string; max?: number }> }).stats;
    expect(bareStats.find((s) => s.label === 'Missteps')!.max).toBeUndefined();
  });
  it('gives cards stable instance ids that carry across events', () => {
    const memory = new Map<string, unknown>();
    const first = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE, seq: 1, memory }))!;
    const quicken = cards(first.bench[0])[2]!.id!;
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
    expect(cards(second.bench[0]).map((c) => c.id)).not.toContain(quicken);
  });
  it('lights playable hand cards by instance and buyable supply piles', () => {
    const memory = new Map<string, unknown>();
    const inp = input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE, memory });
    const plan = g.plan(inp)!;
    const lit = g.litParts(inp);
    const quicken = cards(plan.bench[0])[2]!.id!;
    expect(lit).toContain(quicken);
    expect(lit).toContain('p:p1:supply:attack');
    expect(lit).not.toContain('advance-phase');
    expect(lit).toHaveLength(2);
  });
  it('maps a tap back to the move', () => {
    const memory = new Map<string, unknown>();
    const inp = input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE, memory });
    const plan = g.plan(inp)!;
    const quicken = cards(plan.bench[0])[2]!.id!;
    expect(g.moveForSelect({ component: 'card', id: quicken, label: 'Quicken' }, inp)?.move_id).toBe('play-2-quicken');
    expect(g.moveForSelect({ component: 'card', id: 'p:p1:supply:attack', label: 'Attack' }, inp)?.move_id).toBe('buy-attack');
    expect(g.moveForSelect({ component: 'card', id: cards(plan.bench[0])[0]!.id!, label: 'Focus' }, inp)).toBeNull();
  });
  it('has no resolve_report (no dice in this game)', () => {
    expect(g.resolveReportMove(FF_MOVES)).toBeNull();
  });
  it('presents the loadout as a seven-pick with nothing preselected', () => {
    const fields = g.setupFields(FF_REFERENCE);
    expect(fields).toHaveLength(1);
    expect(fields[0]!.kind).toBe('multi');
    expect(fields[0]!.pick).toBe(7);
    expect(fields[0]!.options.map((o) => o.value)).toEqual(['quicken', 'center', 'attack', 'block', 'grand-finale']);
    expect(fields[0]!.options.find((o) => o.value === 'grand-finale')!.hint).toContain('Titan Entertainment');
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
});

// zekel/src/games/sweetlands-imperium/views.ts getPlayerView.
const SL_VIEW = {
  game_id: 'sweetlands-imperium',
  phase: 'play', round: 1, active_player_id: 's1', first_player_id: 's1',
  taxes: { '1': 0, '2': 1 }, foe: { hp: 3 }, castle_occupant_id: null,
  intel_deck_count: 72, intel_discard_count: 4,
  random_treat_placement: { '1': 'ice cream', '2': 'chocolate bar' },
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
  ],
  your_hand: [
    { card_id: 'i1', kind: 'single', color: 'red' },
    { card_id: 'i2', kind: 'double', color: 'blue' },
    { card_id: 'i3', kind: 'treat', treat: 'Ice Cream' },
  ],
  your_secret_objectives: ['so1'], your_turn_step: 'move',
};

describe('sweetlands-imperium glue', () => {
  const g = GLUES['sweetlands-imperium']!;
  it('board data matches the reference: 80 spaces + 4 junction roads', () => {
    expect(SPACES).toHaveLength(80);
    expect(Object.keys(JUNCTION_ROADS)).toHaveLength(4);
    expect(JUNCTION_ROADS['r1-ring-5']).toBe('r1-road-0');
  });
  it('plans the map with units as pieces, the hand in the bench, and points from the reference', () => {
    const ref: GameReferenceResponse = { gameId: 'sweetlands-imperium', rules: '', referenceData: { points_to_win: 5 }, moveSchema: {}, optionsSchema: {} };
    const plan = g.plan(input(SL_VIEW, [], { playerId: 's1', reference: ref }))!;
    const map = plan.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(map.nodes.find((n) => n.id === 'r1-start')!.pieces).toEqual([{ label: 'milkshake:leader', colorKey: 'milkshake' }]);
    expect(map.nodes.find((n) => n.id === 'r1-ring-2')!.pieces![0]!.label).toBe('milkshake:knight');
    expect(ids(plan.bench)).toEqual(['sl:p:s1', 'sl:tokens', 'sl:hand']);
    expect(cards(plan.bench[2]).map((c) => c.id)).toEqual(['sl:card:i1', 'sl:card:i2', 'sl:card:i3']);
    expect(cards(plan.bench[2])[2]!.artUrl).toBe('/art/sweetlands/treat-ice-cream-1.png');
    const points = plan.points!.data as TrackData;
    expect(points.spaces).toHaveLength(6);
    expect(points.spaces[1]!.pieces).toEqual([{ label: 'milkshake', colorKey: 'milkshake' }]);
    const stats = (plan.bench[0]!.data as { stats: Array<{ label: string; max?: number }> }).stats;
    expect(stats.find((s) => s.label === 'Points')!.max).toBe(5);
  });
  it('lights a playable Intel card and maps it back', () => {
    const moves = [{ move_id: 'pi', description: 'Play red Intel', move: { type: 'play_intel', hand_index: 0 } }];
    const inp = input(SL_VIEW, moves, { playerId: 's1' });
    expect(g.litParts(inp)).toEqual(['sl:card:i1']);
    expect(g.moveForSelect({ component: 'card', id: 'sl:card:i1', label: 'Red' }, inp)?.move_id).toBe('pi');
  });
});

// zekel/src/games/cybernoir-2127/views.ts hacker player view.
const CN_VIEW = {
  phase: 'play', turn: 3, activePlayerId: 'det', playerOrder: ['det', 'hak'],
  pending: null, endgame_triggered: false, endgame_reason: null,
  board: ['Dark City Central Station', 'Xistential Club'],
  informants_facedown_count: 1, informants_revealed: [{ person: 'Anansi the Spider' }],
  jail: { slot_1_booked: ['Blackice'], slot_2_processing: [], slot_3_release_pending_then_freed: [] },
  truthful_clues: { weapon: 'not revolver' }, truthful_values: {},
  negative_clues: ['not Ada'], safehouse_burned: false, hideout_card_removed: false,
  evidence: { weapon: null, witnesses: ['Eddie the Doorman'], motive_set_1: [], motive_set_2: [], motive_set_3: [], motive_set_4: [] },
  contacts_discard: ['The Weapon'],
  detective: { location_deck_size: 12, location_hand_size: 3, location_discard: ['Shipyard'], poi_deck_size: 30, mid_game_guess_spent: false, ap: 3, overclock_used: false },
  hacker: { contacts_deck_size: 20, contacts_discard_size: 1, hand_size: 2, ap: 2, overclock_used: false },
  overclock_draws_owed: 0, overclock_draw_timing: null,
  role: 'hacker',
  hand: ['Blackice', 'The Weapon'],
  hideout: 'The Junction',
  evidence_detail: {},
};

const CN_REFERENCE: GameReferenceResponse = {
  gameId: 'cybernoir-2127', rules: '', moveSchema: {}, optionsSchema: {},
  referenceData: {
    locations: [
      { name: 'Dark City Central Station', borough: 'downtown', affiliation: 'none' },
      { name: 'Xistential Club', borough: 'downtown', affiliation: 'gang_2' },
      { name: 'Shipyard', borough: 'boonies', affiliation: 'corp_1' },
      { name: 'The Junction', borough: 'boonies', affiliation: 'gang_1' },
    ],
  },
};

describe('cybernoir-2127 glue', () => {
  const g = GLUES['cybernoir-2127']!;
  it('plans the city from the reference data with played and safehouse marks, and the hacker hand', () => {
    const plan = g.plan(input(CN_VIEW, [], { reference: CN_REFERENCE }))!;
    const map = plan.board.find((z) => z.kind === 'map')!.data as MapData;
    expect(map.nodes).toHaveLength(4);
    expect(map.nodes.find((n) => n.id === 'cn:loc:dark-city-central-station')!.badges).toContain('played');
    expect(map.nodes.find((n) => n.id === 'cn:loc:the-junction')!.pieces).toEqual([{ label: 'safehouse', colorKey: 'safehouse' }]);
    expect(ids(plan.bench)).toEqual(['cn:hacker', 'cn:hand']);
    // Evidence shows a count, never a denominator the engine does not publish.
    expect((plan.board.find((z) => z.id === 'cn:evidence')!.data as CardZoneData).label).toBe('Evidence (1)');
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
});

describe('guards', () => {
  it('every glue refuses unknown view shapes and falls back to the JSON inspector', () => {
    const junk = { nonsense: true };
    for (const g of Object.values(GLUES)) {
      expect(g.plan(input(junk))).toBeNull();
    }
  });
});
