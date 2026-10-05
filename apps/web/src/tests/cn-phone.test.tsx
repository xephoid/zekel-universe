// The Cybernoir phone (build item 8): the glue lays every zone out in one
// column with the map as a list, the map primitive's list view draws an
// overview, tabs and rows, and a card opens up close with the engine's moves.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Map as MapPart } from '@universe/primitives';
import type { CardZoneData, MapData, SelectEvent } from '@universe/primitives';
import type { GameReferenceResponse } from '@universe/shared';
import { GLUES, type GlueInput, type TablePlan } from '../glue';
import { CardUpClose, findCard } from '../table/parts';

afterEach(cleanup);

const REF: GameReferenceResponse = {
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
    ],
    affiliations: [{ id: 'none', name: 'None' }, { id: 'corp_1', name: 'OmniSuperUltra Corp' }, { id: 'gang_1', name: 'Iceden Collective' }, { id: 'gang_2', name: 'Crimson Clan' }],
    boroughs: [{ id: 'downtown', name: 'Downtown' }, { id: 'boonies', name: 'Boonies' }],
    evidence: { weapon: 1, witnesses: 3, motive_sets: 3, motive_set_size: 3, total: 13 },
  },
};

const VIEW = {
  phase: 'play', turn: 3, activePlayerId: 'det', playerOrder: ['det', 'hak'],
  pending: null, board: ['Xistential Club'],
  informants_facedown_count: 0, informants_revealed: [],
  jail: { slot_1_booked: [], slot_2_processing: [], slot_3_release_pending_then_freed: [] },
  truthful_clues: {}, truthful_values: {}, negative_clues: [],
  evidence: { weapon: null, witnesses: [], motive_set_1: [], motive_set_2: [], motive_set_3: [] },
  contacts_discard: [],
  detective: { location_deck_size: 9, location_hand_size: 1, location_discard: [], ap: 4 },
  hacker: { contacts_deck_size: 20, contacts_discard_size: 0, hand_size: 1, ap: 0 },
  locations_ruled_out: [{ location_name: 'Dark City Central Station', reason: 'NOT No affiliation' }],
  your_locations_ruled_out: [{ location_name: 'Dark City Central Station', reason: 'x' }, { location_name: 'Shipyard', reason: 'you have held or discarded this card' }],
  role: 'detective', location_hand: ['Shipyard'], informants: [],
};

const input = (view: unknown, phone: boolean): GlueInput => ({
  view, previous: null, legalMoves: [], playerId: 'det', reference: REF, seq: 1,
  engineMove: null, actorPlayerId: null, memory: new Map(), phone,
});

describe('cybernoir phone plan', () => {
  const g = GLUES['cybernoir-2127']!;
  it('says it has a phone layout, and on a phone puts every zone in one column', () => {
    expect(g.phone).toBe(true);
    const plan = g.plan(input(VIEW, true))!;
    expect(plan.side).toEqual([]);
    expect(plan.bench).toEqual([]);
    expect(plan.points).toBeUndefined();
    expect(plan.board.map((z) => z.id)).toEqual([
      'cn:map', 'cn:clues', 'cn:not-clues', 'cn:jail', 'cn:hand', 'cn:informants', 'cn:reach', 'cn:case', 'cn:hacker', 'cn:detective',
    ]);
    // The clues, NOT tokens and jail share a strip.
    expect(plan.board.filter((z) => z.span === 'row').map((z) => z.id)).toEqual(['cn:clues', 'cn:not-clues', 'cn:jail']);
    // The hand is a row to swipe, and any card can be opened up close.
    const hand = plan.board.find((z) => z.id === 'cn:hand')!.data as CardZoneData;
    expect(hand.mode).toBe('row');
    expect(hand.inspectable).toBe(true);
    expect(plan.statusShort).toBe('T3 · 9 left');
  });

  it("draws the city as a list, each station's state in a word, opening on the borough with most still possible", () => {
    const map = g.plan(input(VIEW, true))!.board[0]!.data as MapData;
    expect(map.listView).toEqual({ first: 'boonies' });
    expect(map.fill).toBeUndefined();
    const note = (id: string) => map.nodes.find((n) => n.id === `cn:loc:${id}`)!;
    expect(note('xistential-club').note).toBe('Canvassed');
    expect(note('dark-city-central-station').note).toBe('Ruled out');
    expect(note('shipyard').note).toBe('Seen in hand');
    expect(note('the-junction')).toMatchObject({ note: 'Still possible', code: 'ICE', faces: [{ label: 'Blackice', artUrl: '/art/cybernoir/blackice.jpg' }] });
    // The Hacker's own view says which is their hideout, and crosses nothing off.
    const hak = g.plan(input({ ...VIEW, role: 'hacker', hand: [], hideout: { location_name: 'The Junction' } }, true))!.board[0]!.data as MapData;
    expect(hak.nodes.find((n) => n.id === 'cn:loc:the-junction')!.note).toBe('Your hideout');
    expect(hak.nodes.find((n) => n.id === 'cn:loc:shipyard')!.note).toBe('Still possible');
  });

  it('keeps the desktop layout off a phone', () => {
    const plan = g.plan(input(VIEW, false))!;
    expect(plan.side.length).toBeGreaterThan(0);
    expect((plan.board[0]!.data as MapData).listView).toBeUndefined();
  });
});

describe('station list view', () => {
  const data: MapData = {
    nodeShape: 'station', inspectable: true, listView: { first: 'b' },
    areas: [{ key: 'a', label: 'Alpha', y: 0, height: 100, x: 0, width: 50 }, { key: 'b', label: 'Beta', y: 0, height: 100, x: 50, width: 50 }],
    nodes: [
      { id: 'n1', label: 'One', x: 20, y: 20, area: 'a', note: 'Still possible', glow: true },
      { id: 'n2', label: 'Two', x: 70, y: 40, area: 'b', note: 'Canvassed', mark: 'diamond', code: 'OSU', faces: [{ label: 'Pat', artUrl: '/p.jpg' }] },
      { id: 'n3', label: 'Three', x: 80, y: 70, area: 'b', note: 'Ruled out', dim: true },
    ],
  };
  it('opens on the first tab, lists its stations, and a row is the station', () => {
    const seen: SelectEvent[] = [];
    const { container } = render(<MapPart id="m" data={data} onSelect={(e) => seen.push(e)} />);
    // The overview has every station and no names.
    expect(container.querySelectorAll('.overview .zk-station')).toHaveLength(3);
    expect(container.querySelector('.overview .zk-station-name')).toBeNull();
    const rows = () => [...container.querySelectorAll('.zk-station-row')];
    expect(rows().map((r) => r.querySelector('.zk-station-name')!.textContent)).toEqual(['Two', 'Three']);
    expect(rows()[0]!.querySelector('.zk-station-note')!.textContent).toBe('Canvassed');
    expect(rows()[0]!.querySelector('.zk-card-code')!.textContent).toBe('OSU');
    expect(rows()[1]!.className).toContain('dim');
    fireEvent.click(rows()[0]!);
    expect(seen).toEqual([{ component: 'map', id: 'n2', label: 'Two' }]);
    fireEvent.click(screen.getByRole('tab', { name: /Alpha/ }));
    expect(rows().map((r) => r.querySelector('.zk-station-name')!.textContent)).toEqual(['One']);
  });
});

describe('a card up close', () => {
  it('finds a card wherever the plan put it, and offers only the engine moves for it', () => {
    const plan: TablePlan = {
      board: [], bench: [{ kind: 'card-zone', id: 'z', data: { mode: 'row', cards: [{ id: 'c1', label: 'Wyrm', subtitle: 'Discard a Location.' }] } }],
      side: [], palette: {}, title: 't',
      points: { kind: 'tableau', id: 'case', data: { label: 'Case' }, children: [{ kind: 'card-zone', id: 'r', data: { mode: 'row', cards: [{ id: 'c2', label: 'Rust' }] } }] },
    };
    expect(findCard(plan, 'c1')!.label).toBe('Wyrm');
    expect(findCard(plan, 'c2')!.label).toBe('Rust');
    expect(findCard(plan, 'nope')).toBeNull();

    const picked: unknown[] = [];
    render(<CardUpClose card={findCard(plan, 'c1')!} lines={['Lives at The Junction']} disabled={false}
      options={[{ move_id: 'p', description: 'Play Wyrm (2 AP)', cost: '2 AP', move: { type: 'play' } }, { move_id: 'e', description: 'Add Wyrm to a Motive set', cost: 'free', move: { type: 'ev' } }]}
      onPick={(m) => picked.push(m.move_id)} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Wyrm' })).toBeTruthy();
    expect(screen.getByText('Lives at The Junction')).toBeTruthy();
    // The price is said once: not again when the engine's words already say it.
    expect(screen.getByRole('button', { name: 'Play Wyrm (2 AP)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add Wyrm to a Motive set/ }).textContent).toBe('Add Wyrm to a Motive set · free');
    fireEvent.click(screen.getByRole('button', { name: 'Play Wyrm (2 AP)' }));
    expect(picked).toEqual(['p']);
  });
});
