// Glue mapping tests with fixture views matching the engine's REAL view
// shape for each game (zekel src/games/<id>/views.ts). Legal move fixtures
// follow the engine's LegalMove shape: { move_id, description, move }.

import { describe, expect, it } from 'vitest';
import type { GameReferenceResponse } from '@universe/shared';
import type { CardData, CardZoneData, MapData, PoolData, TableauData, TrackData } from '@zekel/primitives';
import { GLUES } from '../glue';
import type { GlueInput, LegalMove, TablePlan, Zone } from '@zekel/glue-kit';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formForMove, isSubmissionAllowed, movesForSelect, templateForm } from '@zekel/glue-kit';
import { SPACES, JUNCTION_ROADS, TREATS, CASTLE_POS } from '../glue/sweetlands-board';
import { fightOf } from '../glue/ff/read';
import type { StrikeMoment } from '../glue/ff/StrikeMoment';
import { FF_MOVES, FF_REFERENCE, FF_VIEW } from './fixtures/ff';

function input(view: unknown, legalMoves: GlueInput['legalMoves'] = [], extra: Partial<GlueInput> = {}): GlueInput {
  return {
    view, previous: null, legalMoves, playerId: extra.playerId ?? null, reference: extra.reference ?? null,
    seq: extra.seq ?? 1, engineMove: extra.engineMove ?? null, actorPlayerId: extra.actorPlayerId ?? null,
    memory: extra.memory ?? new Map(),
  };
}

const ids = (zones: Zone[]) => zones.map((z) => z.id);
const cards = (z: Zone | undefined) => ((z?.data as CardZoneData | undefined)?.cards ?? []);

describe('fractured-fist glue', () => {
  const g = GLUES['fractured-fist']!;
  const hand = (plan: { bench: Zone[] }) => cards(plan.bench.find((z) => z.id === 'p:p1:hand'));
  it('plans your row and theirs on the board and your hand, deck and discard on the bench; no tableau panels', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(plan).not.toBeNull();
    expect(ids(plan.bench)).toEqual(['p:p1:hand', 'p:p1:deck', 'p:p1:discard']);
    expect(ids(plan.board)).toEqual(['p:p2:played', 'p:p1:played']);
    // The table draws a plan's side zones even beside a screen; the screen
    // puts the supply in the side column itself.
    expect(plan.side).toEqual([]);
    expect(plan.status).toBe('Round 2 · Technique step');
    expect(plan.steps).toEqual([{ id: 'technique', label: 'Technique', current: true }, { id: 'channel', label: 'Channel', current: false }]);
    expect(g.Screen).toBeDefined();
  });
  it('draws one shelf with both players\' counts, yours marked as your own', () => {
    const shelf = cards(fightOf(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!.supply);
    expect(shelf.map((c) => c.id)).toEqual(['p:p1:supply:attack', 'p:p1:supply:focus', 'p:p1:supply:momentum']);
    expect(shelf[0]!.counts).toEqual([{ label: 'you', value: 4, own: true }, { label: 'them', value: 5, own: false }]);
    // A card only the other player still has is on the shelf too, at zero for you.
    expect(shelf[1]!.counts).toEqual([{ label: 'you', value: 20, own: true }, { label: 'them', value: 0, own: false }]);
    // Buying lights only your own stacks; the opponent's are never selectable.
    const lit = g.litParts(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }));
    expect(lit).toContain('p:p1:supply:attack');
    expect(lit.some((id) => id.startsWith('p:p2:supply'))).toBe(false);
  });
  it('puts you on the left and the opponent on the right, every number from the view', () => {
    const f = fightOf(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(f.left.pid).toBe('p1');
    expect(f.left.self).toBe(true);
    expect(f.me).toBe(f.left);
    expect(f.right).toMatchObject({ pid: 'p2', self: false, who: 'Opponent', stamina: 7, maxStamina: 7, handSize: 5, deckSize: 9, discardSize: 1 });
    expect(f.left).toMatchObject({ who: 'You', active: true, stamina: 6, maxStamina: 7, missteps: 3 });
    expect(f.right.active).toBe(false);
    // As the second seat, you are still on the left.
    const asP2 = fightOf(input(FF_VIEW, [], { playerId: 'p2', reference: FF_REFERENCE }))!;
    expect([asP2.left.pid, asP2.right.pid]).toEqual(['p2', 'p1']);
    // A watcher sees the seats in turn order, by their engine names.
    const watch = fightOf(input(FF_VIEW, []))!;
    expect(watch.me?.pid).toBe('p1');
    const publicView = { ...FF_VIEW, players: { p1: { ...FF_VIEW.players.p1, hand: undefined }, p2: FF_VIEW.players.p2 } };
    const watcher = fightOf(input(publicView, []))!;
    expect(watcher.me).toBeNull();
    expect([watcher.left.who, watcher.right.who]).toEqual(['P1', 'P2']);
  });
  it('the gutter reads what each player queued against the other, without subtracting', () => {
    const f = fightOf(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    // You hit them for 1 into their 1 defense; they queued nothing into your 0.
    expect([f.left.damageQueued, f.right.defenseQueued]).toEqual([1, 1]);
    expect([f.right.damageQueued, f.left.defenseQueued]).toEqual([0, 0]);
  });
  it('names cards from the reference data and takes the misstep cap from it, never from a constant', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect(hand(plan).map((c) => c.label)).toEqual(['Focus', 'Misstep', 'Quicken', 'Center', 'Focus']);
    expect(hand(plan)[2]!.badges).toEqual(['+2 Draw']);
    const f = fightOf(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    expect([f.left.misstepCap, f.right.misstepCap]).toEqual([10, 10]);
    // Without reference data the cap is simply absent.
    expect(fightOf(input(FF_VIEW, FF_MOVES, { playerId: 'p1' }))!.left.misstepCap).toBeNull();
  });
  it('draws each card face from the reference data: cost in the corner, what a resource is worth, the art by engine id, the kind as its color', () => {
    const plan = g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    const [focus, misstep, quicken] = hand(plan);
    // Cost is the card's own field, not a "cost N" badge.
    expect(quicken).toMatchObject({ cost: 2, badges: ['+2 Draw'], colorKey: 'starter', artUrl: '/cards/fractured-fist/quicken.svg' });
    expect(quicken!.value).toBeUndefined();
    // A resource shows what it is worth, top right and as its chip.
    expect(focus).toMatchObject({ cost: 0, value: 1, badges: ['Worth 1'], colorKey: 'resource', artUrl: '/cards/fractured-fist/focus.svg' });
    // A Misstep has no cost; it says what it is in its own words.
    expect(misstep).toMatchObject({ badges: [], subtitle: 'Cannot be played.', colorKey: 'misstep' });
    expect(misstep!.cost).toBeUndefined();
    // A technique outside the default seven, and one with a school.
    const f = fightOf(input(FF_VIEW, FF_MOVES, { playerId: 'p1', reference: FF_REFERENCE }))!;
    const momentum = cards(f.supply).find((c) => c.id === 'p:p1:supply:momentum')!;
    expect(momentum).toMatchObject({ cost: 3, value: 2, colorKey: 'resource' });
    const withSchool = { ...FF_VIEW, players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, hand: ['grand-finale'] } } };
    const gf = hand(g.plan(input(withSchool, [], { playerId: 'p1', reference: FF_REFERENCE }))!)[0]!;
    expect(gf).toMatchObject({ cost: 10, colorKey: 'titan-entertainment' });
    // Only files that exist are named: this id has no scene under that name.
    expect(gf.artUrl).toBeUndefined();
    // Without reference data there is no number to show.
    const bare = hand(g.plan(input(FF_VIEW, FF_MOVES, { playerId: 'p1' }))!);
    expect(bare[2]).toMatchObject({ label: 'Quicken', badges: [] });
    expect(bare[2]!.cost).toBeUndefined();
  });
  it('the loadout picker shows the art of each technique and its colored corner, the cost on it in the color of its school', () => {
    const fields = g.setupFields(FF_REFERENCE);
    const opts = fields[0]!.kind === 'multi' ? fields[0]!.options : [];
    expect(opts.find((o) => o.value === 'quicken')).toMatchObject({ badge: '2', art: '/cards/fractured-fist/quicken.svg', corner: { color: '#19A58B', ink: '#111111' } });
    expect(opts.find((o) => o.value === 'grand-finale')).toMatchObject({ badge: '10', corner: { color: '#8A6BB0', ink: '#FF8A1F' } });
  });
  it('shows only the counters the current step can change, and only on your turn', () => {
    const counters = (view: unknown, pid = 'p1') => fightOf(input(view, [], { playerId: pid, reference: FF_REFERENCE }))!.counters.map((c) => `${c.label} ${c.value}`);
    expect(counters(FF_VIEW)).toEqual(['Actions 1']);
    // Not on turn: nothing this turn can change.
    expect(counters(FF_VIEW, 'p2')).toEqual([]);
    const channel = { ...FF_VIEW, phase: 'channel' };
    expect(counters(channel)).toEqual(['Spirit 0', 'Channels 1']);
    const refining = { ...FF_VIEW, players: { ...FF_VIEW.players, p1: { ...FF_VIEW.players.p1, refine_pending: 2 } } };
    expect(counters(refining)).toEqual(['Refines 2', 'Actions 1']);
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
  it('puts the arcade theme on the table for a seat and a watcher, and nothing on a view from another game', () => {
    expect(g.themeFor!(input(FF_VIEW, [], { playerId: 'p1' }))).toBe('ff-theme');
    expect(g.themeFor!(input(FF_VIEW, []))).toBe('ff-theme');
    expect(g.themeFor!(input({ game_id: 'something-else' }, []))).toBeNull();
    expect(g.themeFor!(input(null, []))).toBeNull();
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
    const m = g.momentFor!({ before, after, summary: 'End of round 2. Strike: p1 dealt 1, p2 dealt 3.', engineMove: { type: 'end_turn' }, playerId: 'p1', reference: FF_REFERENCE })! as StrikeMoment;
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
  it('puts the hologram logbook theme on the table for the captain and a watcher, and nothing on a view from another game', () => {
    expect(g.themeFor!(input(WW_VIEW, [], { playerId: 'p1' }))).toBe('ww-theme');
    expect(g.themeFor!(input(WW_VIEW, []))).toBe('ww-theme');
    expect(g.themeFor!(input({ game_id: 'something-else', phase: 'play' }, []))).toBeNull();
    expect(g.themeFor!(input(null, []))).toBeNull();
  });
  it('plans the character, crew, ship, travel deck, journey and ruin from the view', () => {
    const plan = g.plan(input(WW_VIEW))!;
    expect(ids(plan.bench)).toEqual(['ww:crew', 'ww:items']);
    // Beside the screen the side rides with the board (the screen draws its own sheet, ship and crew).
    expect(ids(plan.side)).toEqual([]);
    expect(ids(plan.board)).toEqual(['ww:travel-draw', 'ww:travel-discard', 'ww:journey', 'ww:ruin', 'ww:habitat', 'ww:character', 'ww:season', 'ww:ship']);
    // Item 3: the captain and each crew member wear their race's portrait; an unknown race gets none.
    expect((plan.board[5]!.data as { artUrl?: string }).artUrl).toBe('/art/warble-way/portraits/human.jpg');
    const crew = plan.bench[0]!.data as { cards: { artUrl?: string; label: string }[] };
    expect(crew.cards[0]).toMatchObject({ label: 'Bolt', artUrl: '/art/warble-way/portraits/kralkin.jpg' });
    // Crew capacity comes from the ship, level progress from xp_to_next_level.
    expect((plan.bench[0]!.data as CardZoneData).label).toBe('Crew (1/3) +2 unnamed');
    const stats = (plan.board[5]!.data as { stats: Array<{ label: string; value: unknown; max?: number }> }).stats;
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
  it('names the discard pile cards from the reference data, and falls back to the code without it', () => {
    const ref: GameReferenceResponse = {
      gameId: 'warble-way-galaxy', rules: '', moveSchema: {}, optionsSchema: {},
      referenceData: {
        travel_tables: { spades_hazards: { '3': { option1: { ability: 'RES', min_roll: 10 }, option2: { ability: 'SWA', min_roll: 15 } } }, hearts_recruits: { Q: { race: 'grull', idealized: 'finesse', min_roll: 12, abilities: {} } }, clubs_missions: {} },
        cards: { '3S': { title: 'Gravity snare' }, QH: { title: 'Obsidian', line: 'Grull of Pumice, brood' } },
      },
    };
    const named = (g.plan(input(WW_VIEW, [], { reference: ref }))!.board[1]!.data as CardZoneData).cards!;
    expect(named.map((c) => [c.label, c.subtitle, c.colorKey])).toEqual([
      ['Gravity snare', '♠ 3 · Hazard', 'hazard'], ['Obsidian', '♥ Q · Recruit', 'recruit'], ['7♣', undefined, 'ship'],
    ]);
    const plain = (g.plan(input(WW_VIEW))!.board[1]!.data as CardZoneData).cards!;
    expect(plain.map((c) => c.label)).toEqual(['3♠', 'Q♥', '7♣']);
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
  it('puts the candy theme on the table for a seat and a watcher, and nothing on a view from another game', () => {
    expect(g.themeFor!(input(SL_VIEW, [], { playerId: 's1' }))).toBe('sl-theme');
    expect(g.themeFor!(input(SL_VIEW, []))).toBe('sl-theme');
    expect(g.themeFor!(input({ game_id: 'something-else', players: [], phase: 'play' }, []))).toBeNull();
    expect(g.themeFor!(input(null, []))).toBeNull();
  });
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
    expect(plan.side).toEqual([]);
    expect(ids(plan.board)).toEqual(['sl:map', 'sl:intel-deck', 'sl:intel-discard', 'sl:p:s2', 'sl:taxes', 'sl:points']);
    const points = plan.board.find((z) => z.id === 'sl:points')!.data as TrackData;
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

describe('guards', () => {
  it('every glue refuses unknown view shapes and falls back to the JSON inspector', () => {
    const junk = { nonsense: true };
    for (const g of Object.values(GLUES)) {
      expect(g.plan(input(junk))).toBeNull();
    }
  });
});
