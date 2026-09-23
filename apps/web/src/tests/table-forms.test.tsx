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

// Cybernoir's setup phase on the real page: the Hacker's hideout is the one
// secret they choose, and the city map is how they say it.
const CN_SETUP_VIEW = {
  phase: 'setup', turn: 1, activePlayerId: 'hak', playerOrder: ['det', 'hak'], pending: null,
  endgame_triggered: false, endgame_reason: null, board: [],
  informants_facedown_count: 0, informants_revealed: [],
  jail: { slot_1_booked: [], slot_2_processing: [], slot_3_release_pending_then_freed: [] },
  truthful_clues: {}, truthful_values: {}, negative_clues: [],
  safehouse_burned: false, hideout_card_removed: true,
  evidence: { weapon: null, witnesses: [], motive_set_1: [], motive_set_2: [], motive_set_3: [], motive_set_4: [] },
  contacts_discard: [],
  detective: { location_deck_size: 19, location_hand_size: 0, location_discard: [], poi_deck_size: 25, mid_game_guess_spent: false, ap: 4, overclock_used: false },
  hacker: { contacts_deck_size: 26, contacts_discard_size: 0, hand_size: 0, ap: 0, overclock_used: false },
  overclock_draws_owed: 0, overclock_draw_timing: 'immediate',
  role: 'hacker', hand: [], hideout: null,
};
const CN_LEGAL = [{ move_id: 'report_hideout', description: 'Choose your hideout location', move: { type: 'report_hideout', location_name: '' } }];
const CN_REFERENCE = {
  gameId: 'cybernoir-2127', rules: 'rules', moveSchema: {}, optionsSchema: {},
  referenceData: {
    locations: [
      { name: 'The Back Alley', borough: 'downtown', population: 2, affiliation: 'gang_1' },
      { name: 'Junktown', borough: 'boonies', population: 0, affiliation: 'chimera' },
    ],
    people: [
      { name: 'Zero Kelvin', home_location: 'The Back Alley' },
      { name: 'Frostbyte', home_location: 'The Back Alley' },
    ],
    affiliations: [
      { id: 'gang_1', name: 'Iceden Collective' },
      { id: 'gang_3', name: 'Chimera' },
    ],
    boroughs: [
      { id: 'downtown', name: 'Downtown' },
      { id: 'boonies', name: 'Boonies' },
    ],
  },
};
const CN_TABLE = {
  table: { id: 't2', gameId: 'cybernoir-2127', gameName: 'Cybernoir 2127', mode: 'live', status: 'playing', createdAt: '', finishedAt: null, hostIsMe: true, nextActorPosition: 0, waitingOnMe: true },
  seats: [{ position: 0, kind: 'human', aiDifficulty: null, ready: true, mine: true, taken: true, displayName: 'Guest' }, { position: 1, kind: 'ai', aiDifficulty: 'easy', ready: true, mine: false, taken: true, displayName: 'AI (easy)' }],
  mySeats: [0],
};
const cnOpening: TableEventWire = ev(1, 'The table is set.', {
  kind: 'setup', actorSeatPosition: null, view: CN_SETUP_VIEW, legalMoves: CN_LEGAL,
  moveMenu: { prompt: 'Your move', entries: [{ key: '1', label: 'Choose your hideout location', move_id: 'report_hideout' }] },
  yourTurn: true, playerId: 'hak', nextActorPosition: 0,
});

describe("cybernoir's hideout, chosen on the map", () => {
  let socket: FakeSocket;
  beforeEach(() => {
    socket = new FakeSocket();
    useFakeSocket(socket as never);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
      if (url === '/api/me') return json({ user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } });
      if (url === '/api/tables/t2') return json(CN_TABLE);
      if (url.startsWith('/api/tables/t2/events')) return json({ events: [cnOpening] });
      if (url === '/api/games/cybernoir-2127/reference') return json(CN_REFERENCE);
      return Promise.resolve(new Response('{"error":"not_found"}', { status: 404 }));
    }));
    submissionLog.length = 0;
    localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); useFakeSocket(null); });

  const moves = () => socket.emitted.filter((e) => e.event === 'move');

  it('lights every location, names the tapped one back, and sends nothing until the Hacker presses Hide here', async () => {
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={['/table/t2']}>
          <Routes><Route path="/table/:id" element={<TablePage />} /></Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    await screen.findByText('Choose your hideout');
    // A region is named by everything a reader needs, not just its label.
    const alley = await screen.findByRole('button', { name: /^The Back Alley, Downtown, 2 residents, Iceden Collective/ });
    expect(alley.className).toContain('zk-lit');
    expect((await screen.findByRole('button', { name: /^Junktown, Boonies/ })).className).toContain('zk-lit');

    await act(async () => { fireEvent.click(alley); });
    const sheet = await screen.findByRole('dialog', { name: 'Hide in The Back Alley?' });
    expect(sheet.textContent).toContain('Downtown · 2 residents · Iceden Collective');
    expect(sheet.textContent).toContain('Zero Kelvin, Frostbyte live here and start in your hand.');
    // The tap opened the sheet and nothing else: the secret is still unsent.
    expect(moves()).toHaveLength(0);
    expect(submissionLog).toHaveLength(0);

    await act(async () => { fireEvent.click(within(sheet).getByRole('button', { name: 'Hide here' })); });
    await waitFor(() => expect(moves()).toHaveLength(1));
    expect((moves()[0]!.payload as { move: unknown }).move).toEqual({ type: 'report_hideout', location_name: 'The Back Alley' });
    expect(submissionLog[0]!.trigger).toBe('form');
  });
});

// A verb on the action bar is a group of the engine's own moves. Pressing it
// sends nothing: with several behind it, it asks which, in the engine's words.
const CN_PLAY_VIEW = {
  ...CN_SETUP_VIEW, phase: 'play', activePlayerId: 'det', role: 'detective',
  board: ['The Back Alley'], location_hand: ['Junktown'], informants: [], hideout: null,
  detective: { ...CN_SETUP_VIEW.detective, ap: 4, location_hand_size: 1 },
};
const CN_PLAY_MOVES = [
  { move_id: 'a1', description: 'Arrest Zero Kelvin at The Back Alley', move: { type: 'arrest', target_person: 'Zero Kelvin' } },
  { move_id: 'a2', description: 'Arrest Frostbyte at The Back Alley', move: { type: 'arrest', target_person: 'Frostbyte' } },
  { move_id: 'end', description: 'End turn', move: { type: 'pass_turn' } },
];

describe("cybernoir's verb bar", () => {
  let socket: FakeSocket;
  beforeEach(() => {
    socket = new FakeSocket();
    useFakeSocket(socket as never);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
      if (url === '/api/me') return json({ user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } });
      if (url === '/api/tables/t2') return json(CN_TABLE);
      if (url.startsWith('/api/tables/t2/events')) return json({ events: [ev(1, 'Played The Back Alley.', {
        kind: 'move', actorSeatPosition: 1, view: CN_PLAY_VIEW, legalMoves: CN_PLAY_MOVES,
        moveMenu: { prompt: 'Your move', entries: CN_PLAY_MOVES.map((m, i) => ({ key: String(i + 1), label: m.description, move_id: m.move_id })) },
        yourTurn: true, playerId: 'det', nextActorPosition: 0,
      })] });
      if (url === '/api/games/cybernoir-2127/reference') return json(CN_REFERENCE);
      return Promise.resolve(new Response('{"error":"not_found"}', { status: 404 }));
    }));
    submissionLog.length = 0;
    localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); useFakeSocket(null); });

  const moves = () => socket.emitted.filter((e) => e.event === 'move');

  it('asks which arrest, and sends only the one the player picks', async () => {
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={['/table/t2']}>
          <Routes><Route path="/table/:id" element={<TablePage />} /></Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    // Scoped to the action bar: the numbered list still holds the same moves.
    const bar = await screen.findByRole('region', { name: 'Your turn' });
    const arrest = within(bar).getByRole('button', { name: /^Arrest/ });
    expect(arrest.textContent).toContain('2 to choose from');
    await act(async () => { fireEvent.click(arrest); });
    const chooser = await screen.findByRole('dialog', { name: 'Which move?' });
    expect(moves()).toHaveLength(0);
    expect(submissionLog).toHaveLength(0);
    await act(async () => { fireEvent.click(within(chooser).getByRole('button', { name: 'Arrest Frostbyte at The Back Alley' })); });
    await waitFor(() => expect(moves()).toHaveLength(1));
    expect((moves()[0]!.payload as { move: unknown }).move).toEqual({ type: 'arrest', target_person: 'Frostbyte' });
    expect(submissionLog[0]!.trigger).toBe('tap');
  });

  it('a verb with one move behind it still waits for the press', async () => {
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={['/table/t2']}>
          <Routes><Route path="/table/:id" element={<TablePage />} /></Routes>
        </MemoryRouter>
      </SessionProvider>,
    );
    const bar = await screen.findByRole('region', { name: 'Your turn' });
    const end = within(bar).getByRole('button', { name: /^End turn/ });
    expect(moves()).toHaveLength(0);
    await act(async () => { fireEvent.click(end); });
    await waitFor(() => expect(moves()).toHaveLength(1));
    expect((moves()[0]!.payload as { move: unknown }).move).toEqual({ type: 'pass_turn' });
  });
});

// A sheet is a modal dialog and behaves like one. Without this, Tab reached
// the table's own buttons behind an open question, which on the Cybernoir
// table means spending action points while a question is still on screen.
describe('a sheet keeps the keyboard', () => {
  let socket: FakeSocket;
  beforeEach(() => {
    socket = new FakeSocket();
    useFakeSocket(socket as never);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => fakeFetch(String(input))));
    submissionLog.length = 0;
    localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); useFakeSocket(null); });

  const moves = () => socket.emitted.filter((e) => e.event === 'move');

  it('takes focus, keeps Tab inside, closes on Escape and gives focus back', async () => {
    renderTable();
    await screen.findByText(/^Your move/);
    const opener = screen.getByText(/^Moves \(/).closest('details')!.querySelector('button')!;
    opener.focus();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Discard 2 Intel to gain one purple Intel.' })); });
    const sheet = await screen.findByRole('dialog', { name: 'Discard 2 Intel for Purple' });

    // It is a modal, and focus is inside it.
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.contains(document.activeElement)).toBe(true);

    // Tab off the last control comes back to the first, never out to the table.
    const inside = [...sheet.querySelectorAll<HTMLElement>('button, input')];
    inside[inside.length - 1]!.focus();
    await act(async () => { fireEvent.keyDown(sheet, { key: 'Tab' }); });
    expect(sheet.contains(document.activeElement)).toBe(true);

    // Escape closes it, nothing was sent, and focus goes back to the opener.
    await act(async () => { fireEvent.keyDown(sheet, { key: 'Escape' }); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Discard 2 Intel for Purple' })).toBeNull());
    expect(moves()).toHaveLength(0);
    expect(submissionLog).toHaveLength(0);
    expect(document.activeElement).toBe(opener);
  });

  it('the chooser closes on Escape too, and sends nothing', async () => {
    renderTable();
    await screen.findByText(/^Your move/);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Red' })); });
    const chooser = await screen.findByRole('dialog', { name: 'Which move?' });
    expect(chooser.contains(document.activeElement)).toBe(true);
    await act(async () => { fireEvent.keyDown(chooser, { key: 'Escape' }); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Which move?' })).toBeNull());
    expect(moves()).toHaveLength(0);
  });
});
