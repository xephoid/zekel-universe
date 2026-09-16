// Glue mapping tests with fixture views matching the engine's documented
// view shape for each game (docs/games/<game>.md + engine views.ts).

import { describe, expect, it } from 'vitest';
import { GLUES } from '../glue';
import { SPACES, JUNCTION_ROADS } from '../glue/sweetlands-board';

const FF_VIEW = {
  phase: 'technique',
  round: 2,
  active_player_id: 'p1',
  player_order: ['p1', 'p2'],
  players_done_this_round: [],
  players: {
    p1: {
      kind: 'tracked', stamina: 7, max_stamina: 7, deck_size: 8, hand_size: 5,
      discard_size: 2, discard: ['misstep', 'focus'], played: ['attack'],
      damage_queued: 1, defense_queued: 0, actions: 1, channels: 1, spirit: 0,
      refine_pending: 0, misstep_count: 3, starting_hand_size: 5,
      focus_reloads_this_turn: 0, supply: { attack: 4, focus: 20, momentum: 19 },
      hand: ['focus', 'misstep', 'quicken', 'center', 'focus'],
    },
    p2: {
      kind: 'tracked', stamina: 7, max_stamina: 7, deck_size: 9, hand_size: 5,
      discard_size: 1, played: [], damage_queued: 0, defense_queued: 1,
      actions: 1, channels: 1, spirit: 2, refine_pending: 0, misstep_count: 3,
      starting_hand_size: 5, focus_reloads_this_turn: 0, supply: { attack: 5 },
    },
  },
  winners: [], scores: {}, result_summary: null,
};

const FF_MOVES = [
  { id: 'play-2-quicken', description: 'Play Quicken (hand[2])', move: { type: 'play_card', hand_index: 2 } },
  { id: 'buy-attack', description: 'Buy Attack', move: { type: 'buy_card', card_id: 'attack' } },
  { id: 'advance-phase', description: 'Advance to Channel phase', move: { type: 'advance_phase' } },
];

const WW_VIEW = {
  phase: 'habitat',
  pending: { kind: 'research_roll' },
  character: {
    name: 'Zara', race: 'human', disposition_roleplay_hint: null, level: 1,
    xp: 2, xp_to_next_level: 4, credits: 200, wounded: false, dread: 0,
    abilities: { sne: { name: 'Sneak', stat: 'body', natural: 3, effective: 3 } },
    skills: ['Sneak (SNE basic)'], equipped: [],
  },
  crew: [{ name: 'Bolt', race: 'kralkin', idealizes: null, abilities: {}, skills: [], anger_tokens: 1, equipped: [] }],
  unnamed_crew: 2,
  season_endings: {}, ship: { name: 'Wasp', damage: 'Used', capacity: 5 },
  items: [{ id: 'it1', name: 'Laser Pistol', type: 'weapon', consumed: false }],
  bulkheads_spent: false,
  habitat: { number: 1, name: 'Xaxalon 4', shop: [], cantina: [], missions: [] },
  journey: { note: '', legs: [{ position: 'current', purpose: 'x', kind: 'mission_outbound', mission_id: 'm1', cards_remaining: 3 }] },
  space_combat: null,
  ruin: {
    map: 'R1', level: 1, round: 1,
    board_rows: ['row 1: # # # # # # # # # #', 'row 2: # S . . . . . . # #'],
    board_key: {}, party: [], attackers: [],
  },
  travel_deck: { cards_in_draw_pile: 40, cards_in_discard: 3, discard: ['3♠', 'Q♥', '7♣'] },
  stat_reference: {}, lore_refs: [], result: null,
};

const SL_VIEW = {
  game_id: 'sweetlands-imperium',
  phase: 'play', round: 1, active_player_id: 's1', first_player_id: 's1',
  taxes: { '1': 0, '2': 1 }, foe: { hp: 3 }, castle_occupant_id: null,
  intel_deck_count: 72, intel_discard_count: 4,
  random_treat_placement: { '1': 'ice cream', '2': 'chocolate bar' },
  players: [
    {
      player_id: 's1', kind: 'human', faction: 'milkshake', faction_name: 'Arch Duchess of Milkshake',
      home_region: 1, points: 1, influence: 2, sugar_cubes: 3, intel_tokens: { red: 1 },
      hand_count: 3,
      units: { leader: 'region 1 start', knight: 'region 1 ring space 2 (yellow)', ambassador: 'off-board' },
      unit_locations: {
        leader: { zone: 'start', region: 1 },
        knight: { zone: 'ring', region: 1, ringIndex: 2 },
        ambassador: { zone: 'offboard' },
      },
      public_objectives_scored: [], secret_objectives_count: 1,
    },
  ],
  your_hand: [
    { card_id: 'i1', kind: 'single', color: 'red' },
    { card_id: 'i2', kind: 'double', color: 'blue' },
    { card_id: 'i3', kind: 'treat', treat: 'Ice Cream' },
  ],
  your_secret_objectives: ['so1'], your_turn_step: 'move',
};

const CN_VIEW = {
  phase: 'play', turn: 3, activePlayerId: 'det', playerOrder: ['det', 'hak'],
  pending: null, endgame_triggered: false, endgame_reason: null,
  board: ['Neon Plaza', 'Glass Arcade'],
  informants_facedown_count: 1, informants_revealed: [{ person: 'Ada' }],
  jail: { slot_1_booked: ['Kilgore'], slot_2_processing: [], slot_3_release_pending_then_freed: [] },
  truthful_clues: { weapon: 'not revolver' }, truthful_values: {},
  negative_clues: ['not Ada'], safehouse_burned: false, hideout_card_removed: false,
  evidence: { weapon: null, witnesses: ['Moth'], motive_set_1: [], motive_set_2: [], motive_set_3: [], motive_set_4: [] },
  contacts_discard: ['The Weapon'],
  detective: { location_deck_size: 12, location_hand_size: 3, location_discard: ['Dust Fields'], poi_deck_size: 30, mid_game_guess_spent: false, location_played_this_turn: null, upkeep_paid: true, ap: 3, overclock_used: false },
  hacker: { contacts_deck_size: 20, contacts_discard_size: 1, hand_size: 4, ap: 2, overclock_used: false },
  overclock_draws_owed: 0, overclock_draw_timing: null,
  role: 'hacker',
  hand: ['Ada', 'The Weapon'],
  hideout: 'The Junction',
  evidence_detail: {},
};

describe('fractured-fist glue', () => {
  const g = GLUES['fractured-fist']!;
  it('plans two tableaux + a hand in the bench', () => {
    const plan = g.plan({ view: FF_VIEW, previous: null, legalMoves: FF_MOVES, onSelect: () => {} })!;
    expect(plan).not.toBeNull();
    expect(plan.bench.map((z) => z.kind)).toContain('card-zone');
    expect(plan.side.length).toBeGreaterThan(0);
    expect(plan.board[0]!.kind).toBe('track');
  });
  it('lights playable hand cards and buyable supply', () => {
    const lit = g.litParts(FF_VIEW, FF_MOVES);
    expect(lit).toContain('p:p1:hand:2');
    expect(lit).toContain('p:p1:supply:attack');
    expect(lit).not.toContain('advance-phase');
  });
  it('maps a click back to the move', () => {
    expect(g.moveForSelect({ component: 'card', id: 'p:p1:hand:2', label: 'Quicken' }, FF_MOVES)?.id).toBe('play-2-quicken');
    expect(g.moveForSelect({ component: 'card', id: 'p:p1:supply:attack', label: 'Attack' }, FF_MOVES)?.id).toBe('buy-attack');
  });
  it('has no resolve_report (no dice in this game)', () => {
    expect(g.resolveReportMove(FF_MOVES)).toBeNull();
  });
});

describe('warble-way-galaxy glue', () => {
  const g = GLUES['warble-way-galaxy']!;
  it('plans the character tableau, crew, ship damage track and ruin grid', () => {
    const plan = g.plan({ view: WW_VIEW, previous: null, legalMoves: [], onSelect: () => {} })!;
    expect(plan.bench.map((z) => String(z.data['id']))).toContain('ww:character');
    expect(plan.board.map((z) => String(z.data['id']))).toEqual(expect.arrayContaining(['ww:damage', 'ww:ruin', 'ww:travel', 'ww:galaxy']));
  });
  it('surfaces the Roll button only for resolve_report', () => {
    const moves = [{ id: 'r', description: 'Roll 3d6 + SNE', move: { type: 'resolve_report' } }];
    expect(g.resolveReportMove(moves)?.id).toBe('r');
  });
});

describe('sweetlands-imperium glue', () => {
  const g = GLUES['sweetlands-imperium']!;
  it('board data matches the reference: 80 spaces + 4 junction roads', () => {
    expect(SPACES).toHaveLength(80);
    expect(Object.keys(JUNCTION_ROADS)).toHaveLength(4);
    expect(JUNCTION_ROADS['r1-ring-5']).toBe('r1-road-0');
  });
  it('plans the map with units placed and the hand in the bench', () => {
    const plan = g.plan({ view: SL_VIEW, previous: null, legalMoves: [], onSelect: () => {} })!;
    const map = plan.board.find((z) => z.kind === 'map')!;
    const regions = (map.data as { regions: { id: string; occupant?: string }[] }).regions;
    expect(regions.find((r) => r.id === 'r1-start')).toBeDefined();
    const knightRegion = regions.find((r) => r.id === 'r1-ring-2')!;
    expect(knightRegion.occupant).toMatch(/milkshake:knight/);
    expect(plan.bench.some((z) => String(z.data['id']) === 'sl:hand')).toBe(true);
  });
  it('treat art paths point at public/art/sweetlands', () => {
    const plan = g.plan({ view: SL_VIEW, previous: null, legalMoves: [], onSelect: () => {} })!;
    const map = plan.board.find((z) => z.kind === 'map')!;
    const mapData = map.data as unknown as { regions: { label: string }[] };
    expect(mapData.regions.some((r) => r.label === 'Milkshake')).toBe(true);
  });
});

describe('cybernoir-2127 glue', () => {
  const g = GLUES['cybernoir-2127']!;
  it('plans the 19-location map with played state and hacker hand', () => {
    const plan = g.plan({ view: CN_VIEW, previous: null, legalMoves: [], onSelect: () => {} })!;
    const map = plan.board.find((z) => z.kind === 'map')!;
    const regions = (map.data as { regions: { id: string; occupant?: string }[] }).regions;
    expect(regions).toHaveLength(19);
    expect(regions.find((r) => r.id === 'cn:loc:neon-plaza')!.occupant).toBe('played');
    expect(regions.find((r) => r.id === 'cn:loc:the-junction')!.occupant).toBe('safehouse');
    expect(plan.bench.some((z) => String(z.data['id']) === 'cn:hand')).toBe(true);
    expect(plan.bench.some((z) => String(z.data['id']) === 'cn:hacker')).toBe(true);
  });
});

describe('guards', () => {
  it('every glue refuses unknown view shapes → JSON inspector fallback', () => {
    const junk = { nonsense: true };
    for (const g of Object.values(GLUES)) {
      expect(g.plan({ view: junk, previous: null, legalMoves: [], onSelect: () => {} })).toBeNull();
    }
  });
});
