// Choosers and forms on the real table page, with a Sweetlands table: a tap
// on a card that could mean several moves asks which and sends nothing until
// the player picks; a template move on the menu asks its questions and sends
// only when every answer is in and the player presses the form's button.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MoveAck, TableEventWire } from '@universe/shared';
import { useFakeSocket } from '../socket';
import { submissionLog } from '../glue';
import { SessionProvider } from '../session';
import { TablePage } from '../pages/Table';
import { ev } from './fixtures';

type Handler = (...args: unknown[]) => void;
class FakeSocket {
  connected = true;
  handlers = new Map<string, Handler[]>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  moveAck: MoveAck = { ok: true, lastSeq: 2 };
  on(event: string, h: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), h]); return this; }
  off(event: string, h: Handler) { this.handlers.set(event, (this.handlers.get(event) ?? []).filter((x) => x !== h)); return this; }
  timeout() { return this; }
  emit(event: string, payload: unknown, ack?: (...a: unknown[]) => void) {
    this.emitted.push({ event, payload });
    if (event === 'join_table') ack?.({ ok: true, seats: [0], status: 'playing' });
    if (event === 'move') ack?.(null, this.moveAck);
    return this;
  }
  receive(event: string, payload: unknown) { for (const h of this.handlers.get(event) ?? []) h(payload); }
}

const VIEW = {
  game_id: 'sweetlands-imperium', phase: 'play', round: 1, active_player_id: 'p1', first_player_id: 'p1',
  taxes: { '1': 0, '2': 0, '3': 0, '4': 0 }, foe: { type: 'orc', defeated: false }, castle_occupant_id: null,
  intel_deck_count: 70, intel_discard_count: 0, random_treat_placement: { '1': 'ice_cream', '2': 'chocolate_bar', '3': 'gummy_bear', '4': 'cupcake' },
  players: [
    { player_id: 'p1', kind: 'human', faction: 'fudge', faction_name: 'General Fudge', home_region: 2, points: 0, influence: 1, sugar_cubes: 2, intel_tokens: [], hand_count: 4, units: {}, unit_locations: { leader: { zone: 'start', region: 2 }, knight: { zone: 'start', region: 2 }, ambassador: { zone: 'start', region: 2 } } },
    { player_id: 'p2', kind: 'ai', faction: 'jellybean', faction_name: 'Princess Jellybean', home_region: 3, points: 0, influence: 0, sugar_cubes: 2, intel_tokens: [], hand_count: 3, units: {}, unit_locations: {} },
  ],
  your_hand: [
    { card_id: 'c1', kind: 'single', color: 'red' },
    { card_id: 'c2', kind: 'single', color: 'blue' },
    { card_id: 'c3', kind: 'single', color: 'green' },
    { card_id: 'c4', kind: 'treat', treat: 'fudge' },
  ],
  your_secret_objectives: [], your_turn_step: 'play',
};
const LEGAL = [
  { move_id: 'r-leader', description: 'Play red: move leader and take the red action.', move: { type: 'play_intel', cardId: 'c1', unit: 'leader', viaRoad: false, takeAction: true } },
  { move_id: 'r-knight', description: 'Play red: move knight only (no action).', move: { type: 'play_intel', cardId: 'c1', unit: 'knight', viaRoad: false, takeAction: false } },
  { move_id: 'discard', description: 'Discard 2 Intel to gain one purple Intel.', move: { type: 'discard_for_color', cardIds: ['c1', 'c2'], color: 'purple' } },
  { move_id: 'pass', description: 'Pass your turn to gain 1 influence.', move: { type: 'pass' } },
];
const opening: TableEventWire = ev(1, 'The table is set.', {
  kind: 'setup', actorSeatPosition: null, view: VIEW, legalMoves: LEGAL,
  moveMenu: { prompt: 'Your move', entries: LEGAL.map((m, i) => ({ key: String(i + 1), label: m.description, move_id: m.move_id })) },
  yourTurn: true, playerId: 'p1', nextActorPosition: 0,
});
const REFERENCE = {
  gameId: 'sweetlands-imperium', rules: 'rules', moveSchema: {}, optionsSchema: {},
  referenceData: { points_to_win: 5, factions: [{ id: 'fudge', name: 'General Fudge', region: 2, color: 'brown', ability: '' }] },
};
const TABLE = {
  table: { id: 't1', gameId: 'sweetlands-imperium', gameName: 'Sweetlands Imperium', mode: 'live', status: 'playing', createdAt: '', finishedAt: null, hostIsMe: true, nextActorPosition: 0, waitingOnMe: true },
  seats: [{ position: 0, kind: 'human', aiDifficulty: null, ready: true, mine: true, taken: true, displayName: 'Guest' }, { position: 1, kind: 'ai', aiDifficulty: 'easy', ready: true, mine: false, taken: true, displayName: 'AI (easy)' }],
  mySeats: [0],
};

function fakeFetch(url: string): Promise<Response> {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  if (url === '/api/me') return json({ user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } });
  if (url === '/api/tables/t1') return json(TABLE);
  if (url.startsWith('/api/tables/t1/events')) return json({ events: [opening] });
  if (url === '/api/games/sweetlands-imperium/reference') return json(REFERENCE);
  return Promise.resolve(new Response('{"error":"not_found"}', { status: 404 }));
}

function renderTable() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/table/t1']}>
        <Routes><Route path="/table/:id" element={<TablePage />} /></Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

describe('choosers and forms on the table page', () => {
  let socket: FakeSocket;
  beforeEach(() => {
    socket = new FakeSocket();
    useFakeSocket(socket as never);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => fakeFetch(String(input))));
    submissionLog.length = 0;
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useFakeSocket(null);
  });

  const moves = () => socket.emitted.filter((e) => e.event === 'move');

  it('a tap on a card with several moves opens the chooser; the pick is what goes out', async () => {
    renderTable();
    await screen.findByText(/^Your move/);
    const red = await screen.findByRole('button', { name: 'Red' });
    expect(red.className).toContain('zk-lit');
    await act(async () => { fireEvent.click(red); });
    const chooser = await screen.findByRole('dialog', { name: 'Which move?' });
    expect(moves()).toHaveLength(0);
    expect(submissionLog).toHaveLength(0);
    const rows = within(chooser).getAllByRole('button').filter((b) => b.textContent?.startsWith('Play red'));
    expect(rows.map((b) => b.textContent)).toEqual([
      'Play red: move leader and take the red action.',
      'Play red: move knight only (no action).',
    ]);
    await act(async () => { fireEvent.click(rows[1]!); });
    await waitFor(() => expect(moves()).toHaveLength(1));
    expect((moves()[0]!.payload as { move: unknown }).move).toEqual({ type: 'play_intel', cardId: 'c1', unit: 'knight', viaRoad: false, takeAction: false });
    expect(submissionLog[0]!.trigger).toBe('tap');
    expect(screen.queryByRole('dialog', { name: 'Which move?' })).toBeNull();
  });

  it('a template move on the menu asks its questions and sends only a completed answer', async () => {
    renderTable();
    await screen.findByText(/^Your move/);
    const menu = screen.getByText(/^Moves \(/).closest('details')!;
    const row = within(menu).getByRole('button', { name: 'Discard 2 Intel to gain one purple Intel.' });
    await act(async () => { fireEvent.click(row); });
    const form = await screen.findByRole('dialog', { name: 'Discard 2 Intel for Purple' });
    const send = within(form).getByRole('button', { name: 'Send' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect(moves()).toHaveLength(0);
    // Nothing is preselected: the template named c1 and c2, the boxes start empty.
    const boxes = within(form).getAllByRole('checkbox');
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    await act(async () => { fireEvent.click(within(form).getByLabelText(/Green/)); });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(within(form).getByLabelText(/Fudge/)); });
    expect((send as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(send); });
    await waitFor(() => expect(moves()).toHaveLength(1));
    expect((moves()[0]!.payload as { move: unknown }).move).toEqual({ type: 'discard_for_color', cardIds: ['c3', 'c4'], color: 'purple' });
    expect(submissionLog[0]!.trigger).toBe('form');
  });

  it('a form goes away when a new event arrives, since its move may no longer exist', async () => {
    renderTable();
    await screen.findByText(/^Your move/);
    const menu = screen.getByText(/^Moves \(/).closest('details')!;
    await act(async () => { fireEvent.click(within(menu).getByRole('button', { name: 'Discard 2 Intel to gain one purple Intel.' })); });
    await screen.findByRole('dialog', { name: 'Discard 2 Intel for Purple' });
    await act(async () => {
      socket.receive('table_event', ev(2, 'Play resumes.', { kind: 'system', actorSeatPosition: null, view: VIEW, legalMoves: LEGAL, yourTurn: true, playerId: 'p1', nextActorPosition: 0 }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard 2 Intel for Purple' })).toBeNull());
    expect(moves()).toHaveLength(0);
  });
});
