// The agency check on the real table page: render it with a fake socket and
// a fake API, feed it the opening event, an AI turn and a rejection, and
// assert that nothing is ever submitted without a simulated tap, that a tap
// on a lit card submits exactly the engine's move, and that a rejection is
// shown as a rule with its lesson.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MoveAck, TableEventWire } from '@universe/shared';
import { useFakeSocket } from '../socket';
import { submissionLog } from '../glue';
import { SessionProvider } from '../session';
import { TablePage } from '../pages/Table';
import { ev } from './fixtures';

// ---- a fake socket ---------------------------------------------------------------

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
    if (event === 'undo') ack?.(null, { ok: true, seq: 9 });
    return this;
  }
  receive(event: string, payload: unknown) { for (const h of this.handlers.get(event) ?? []) h(payload); }
}

// ---- fixtures ----------------------------------------------------------------------

const VIEW = {
  phase: 'technique', round: 1, active_player_id: 'p1', player_order: ['p1', 'p2'], players_done_this_round: [],
  players: {
    p1: { kind: 'tracked', stamina: 7, max_stamina: 7, deck_size: 5, hand_size: 3, discard_size: 0, discard: [], played: [], damage_queued: 0, defense_queued: 0, actions: 1, channels: 1, spirit: 0, refine_pending: 0, misstep_count: 3, starting_hand_size: 5, focus_reloads_this_turn: 0, supply: { attack: 5 }, hand: ['attack', 'focus', 'focus'] },
    p2: { kind: 'tracked', stamina: 7, max_stamina: 7, deck_size: 5, hand_size: 5, discard_size: 0, played: [], damage_queued: 0, defense_queued: 0, actions: 1, channels: 1, spirit: 0, refine_pending: 0, misstep_count: 3, starting_hand_size: 5, focus_reloads_this_turn: 0, supply: { attack: 5 } },
  },
  winners: [], scores: {}, result_summary: null,
};
const LEGAL = [
  { move_id: 'play-0-attack', description: 'Play Attack from your hand', move: { type: 'play_card', card_id: 'attack', hand_index: 0 } },
  { move_id: 'end-turn', description: 'End turn', move: { type: 'end_turn' } },
];
const opening: TableEventWire = ev(1, 'The table is set.', {
  kind: 'setup', actorSeatPosition: null, view: VIEW, legalMoves: LEGAL,
  moveMenu: { prompt: 'Your move', entries: LEGAL.map((m, i) => ({ key: String(i + 1), label: m.description, move_id: m.move_id })) },
  yourTurn: true, playerId: 'p1', nextActorPosition: 0,
});

const REFERENCE = {
  gameId: 'fractured-fist', rules: 'rules', moveSchema: {}, optionsSchema: {},
  referenceData: { cards: [{ id: 'attack', name: 'Attack', type: 'TECHNIQUE', cost: 4 }, { id: 'focus', name: 'Focus', type: 'RESOURCE', cost: 0, value: 1 }], max_missteps: 10 },
};
const TABLE = {
  table: { id: 't1', gameId: 'fractured-fist', gameName: 'Fractured Fist', mode: 'live', status: 'playing', createdAt: '', finishedAt: null, hostIsMe: true, nextActorPosition: 0, waitingOnMe: true },
  seats: [{ position: 0, kind: 'human', aiDifficulty: null, ready: true, mine: true, taken: true, displayName: 'Guest' }, { position: 1, kind: 'ai', aiDifficulty: 'easy', ready: true, mine: false, taken: true, displayName: 'AI (easy)' }],
  mySeats: [0],
};

function fakeFetch(url: string): Promise<Response> {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  if (url === '/api/me') return json({ user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } });
  if (url === '/api/tables/t1') return json(TABLE);
  if (url.startsWith('/api/tables/t1/events')) return json({ events: [opening] });
  if (url === '/api/games/fractured-fist/reference') return json(REFERENCE);
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

describe('the table page and player agency', () => {
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

  it('shows the opening board, lights the playable card, and submits nothing on its own', async () => {
    renderTable();
    await waitFor(() => expect(socket.emitted.some((e) => e.event === 'join_table')).toBe(true));
    await screen.findByText(/^Your move/);
    const attack = await screen.findByRole('button', { name: 'Attack' });
    expect(attack.className).toContain('zk-lit');
    // Nothing submitted without a person.
    expect(submissionLog).toHaveLength(0);
    expect(socket.emitted.filter((e) => e.event === 'move')).toHaveLength(0);
  });

  it('a tap on the lit card submits exactly the engine move for it', async () => {
    renderTable();
    const attack = await screen.findByRole('button', { name: 'Attack' });
    await act(async () => { fireEvent.click(attack); });
    await waitFor(() => expect(socket.emitted.filter((e) => e.event === 'move')).toHaveLength(1));
    const sent = socket.emitted.find((e) => e.event === 'move')!.payload as { tableId: string; seat: number; move: unknown };
    expect(sent).toEqual({ tableId: 't1', seat: 0, move: { type: 'play_card', card_id: 'attack', hand_index: 0 } });
    expect(submissionLog).toEqual([{ trigger: 'tap', move: { type: 'play_card', card_id: 'attack', hand_index: 0 } }]);
  });

  it('an AI turn arriving over the socket is played back without any submission', async () => {
    renderTable();
    await screen.findByRole('button', { name: 'Attack' });
    const aiView = { ...VIEW, active_player_id: 'p2', players: { ...VIEW.players, p2: { ...VIEW.players.p2, played: ['attack'] } } };
    await act(async () => {
      socket.receive('table_event', ev(2, 'You end your turn.', { view: VIEW, actorSeatPosition: 0, yourTurn: false, playerId: 'p1' }));
      socket.receive('table_event', ev(3, 'The AI plays Attack.', { kind: 'ai_move', actorSeatPosition: null, view: aiView, yourTurn: false, playerId: 'p1' }));
      socket.receive('table_event', ev(4, 'The AI ends its turn.', { kind: 'ai_move', actorSeatPosition: null, view: VIEW, legalMoves: LEGAL, yourTurn: true, playerId: 'p1', nextActorPosition: 0 }));
    });
    // The queue dwells one beat before the next event shows.
    await screen.findByText('You end your turn.', {}, { timeout: 4000 });
    // While the slideshow plays, nothing lights and nothing is submitted.
    expect(screen.queryByText(/^Your move/)).toBeNull();
    expect(submissionLog).toHaveLength(0);
    expect(socket.emitted.filter((e) => e.event === 'move')).toHaveLength(0);
  });

  it('a rejection comes back as a rule with its lesson, not as a fault', async () => {
    socket.moveAck = { error: 'move_rejected', reason: 'Can only buy in channel phase', lesson: 'Buying happens in the Channel phase.' };
    renderTable();
    const attack = await screen.findByRole('button', { name: 'Attack' });
    await act(async () => { fireEvent.click(attack); });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Not allowed');
    expect(alert.textContent).toContain('Can only buy in channel phase');
    fireEvent.click(screen.getByText('Why?'));
    expect(alert.textContent).toContain('Buying happens in the Channel phase.');
  });

  it('an engine fault reads as a server problem, not a rule', async () => {
    socket.moveAck = { error: 'engine_unavailable', reason: 'The rules engine did not answer. Try again in a moment.' };
    renderTable();
    const attack = await screen.findByRole('button', { name: 'Attack' });
    await act(async () => { fireEvent.click(attack); });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Something went wrong');
    expect(alert.textContent).not.toContain('Not allowed');
  });

  it('an action-bar button submits the listed move it stands for, as a tap', async () => {
    renderTable();
    await screen.findByRole('button', { name: 'Attack' });
    const bar = within(screen.getByRole('region', { name: 'Your turn' }));
    await act(async () => { fireEvent.click(bar.getByRole('button', { name: 'End turn' })); });
    await waitFor(() => expect(socket.emitted.filter((e) => e.event === 'move')).toHaveLength(1));
    expect(submissionLog).toEqual([{ trigger: 'tap', move: { type: 'end_turn' } }]);
    // Advance is not listed, so it is not offered.
    expect(bar.queryByRole('button', { name: 'Advance to Channel' })).toBeNull();
  });

  it('"play all resources" is one press that sends the listed plays one at a time, each after the last landed', async () => {
    const channel = { ...VIEW, phase: 'channel', players: { ...VIEW.players, p1: { ...VIEW.players.p1, hand: ['focus', 'focus', 'attack'] } } };
    const plays = [
      { move_id: 'play-0-focus', description: 'Play Focus for 1 spirit', move: { type: 'play_card', card_id: 'focus', hand_index: 0 } },
      { move_id: 'play-1-focus', description: 'Play Focus for 1 spirit', move: { type: 'play_card', card_id: 'focus', hand_index: 1 } },
      { move_id: 'end-turn', description: 'End turn', move: { type: 'end_turn' } },
    ];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/tables/t1/events')) return Promise.resolve(new Response(JSON.stringify({ events: [{ ...opening, view: channel, legalMoves: plays, moveMenu: null }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      return fakeFetch(url);
    }));
    renderTable();
    const all = await screen.findByRole('button', { name: /Play all resources · \+2/ });
    await act(async () => { fireEvent.click(all); });
    await waitFor(() => expect(socket.emitted.filter((e) => e.event === 'move')).toHaveLength(1));
    expect(submissionLog).toEqual([{ trigger: 'batch', move: { type: 'play_card', card_id: 'focus', hand_index: 0 } }]);
    // The second Focus is at index 0 now; it goes only once the engine lists it.
    const after = { ...channel, players: { ...channel.players, p1: { ...channel.players.p1, hand: ['focus', 'attack'], played: ['focus'], spirit: 1 } } };
    await act(async () => {
      socket.receive('table_event', ev(2, 'You play Focus for 1 spirit.', { view: after, legalMoves: [{ ...plays[0]! }, plays[2]!], yourTurn: true, playerId: 'p1', engineMove: plays[0]!.move, nextActorPosition: 0 }));
    });
    await waitFor(() => expect(socket.emitted.filter((e) => e.event === 'move')).toHaveLength(2), { timeout: 4000 });
    expect(submissionLog[1]).toEqual({ trigger: 'batch', move: { type: 'play_card', card_id: 'focus', hand_index: 0 } });
    // The batch is spent: one more event sends nothing.
    const last = { ...after, players: { ...after.players, p1: { ...after.players.p1, hand: ['attack'], played: ['focus', 'focus'], spirit: 2 } } };
    await act(async () => {
      socket.receive('table_event', ev(3, 'You play Focus for 1 spirit.', { view: last, legalMoves: [plays[2]!], yourTurn: true, playerId: 'p1', engineMove: plays[0]!.move, nextActorPosition: 0 }));
    });
    await waitFor(() => expect(screen.getAllByText('You play Focus for 1 spirit.').length).toBeGreaterThan(1), { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(socket.emitted.filter((e) => e.event === 'move')).toHaveLength(2);
  });

  it('the strike plays as a moment over the board as it was, and the event lands when it is done', async () => {
    renderTable();
    await screen.findByRole('button', { name: 'Attack' });
    const struck = { ...VIEW, round: 2, players: { ...VIEW.players, p1: { ...VIEW.players.p1, stamina: 6 }, p2: { ...VIEW.players.p2, stamina: 7 } } };
    await act(async () => {
      socket.receive('table_event', ev(2, 'End of round 1. Strike: p1 dealt 0, p2 dealt 1.', { kind: 'ai_move', actorSeatPosition: null, view: struck, legalMoves: LEGAL, yourTurn: true, playerId: 'p1', nextActorPosition: 0, engineMove: { type: 'end_turn' } }));
    });
    const dialog = await screen.findByRole('dialog', { name: 'Round 1 · strike' }, { timeout: 4000 });
    expect(dialog.textContent).toContain('AI (easy) hits You');
    // The board underneath still shows the round before the strike.
    expect(screen.queryAllByText('End of round 1. Strike: p1 dealt 0, p2 dealt 1.')).toHaveLength(0);
    expect(submissionLog).toHaveLength(0);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Skip to the end' })); });
    await screen.findAllByText('End of round 1. Strike: p1 dealt 0, p2 dealt 1.', {}, { timeout: 4000 });
    expect(screen.queryByRole('dialog', { name: 'Round 1 · strike' })).toBeNull();
    // The strike can be watched again.
    expect(screen.getByRole('button', { name: 'Replay the strike' })).toBeTruthy();
  });

  it('undo goes through the undo message, never as a move', async () => {
    renderTable();
    await screen.findByRole('button', { name: 'Attack' });
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(socket.emitted.some((e) => e.event === 'undo')).toBe(true));
    expect(socket.emitted.filter((e) => e.event === 'move')).toHaveLength(0);
  });
});
