// Glue mapping tests with fixture views matching the engine's REAL view
// shape for each game (zekel src/games/<id>/views.ts). Legal move fixtures
// follow the engine's LegalMove shape: { move_id, description, move }.

import { describe, expect, it } from 'vitest';
import type { GameReferenceResponse } from '@universe/shared';
import type { CardZoneData, MapData, TrackData } from '@universe/primitives';
import { GLUES } from '../glue';
import type { GlueInput, Zone } from '../glue';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formForMove, movesForSelect, templateForm } from '../glue';
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
    const f = fields[0]!;
    if (f.kind !== 'multi') throw new Error('the loadout is a multi pick');
    expect(f.pick).toBe(7);
    expect(f.options.map((o) => o.value)).toEqual(['quicken', 'center', 'attack', 'block', 'grand-finale']);
    expect(f.options.find((o) => o.value === 'grand-finale')!.hint).toContain('Titan Entertainment');
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
