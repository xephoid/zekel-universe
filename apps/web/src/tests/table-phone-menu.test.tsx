// The phone menu sheet and the last move (docs/games/adventurer-olympics-phone-build.md,
// "The caption"). A game whose screen places the caption card itself keeps it
// out of the phone menu, unless its glue also asks for it there
// (GlueModule.captionInPhoneMenu), as the approved Adventurer Olympics menu
// shows. Warble Way Galaxy places its caption and must not change.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MoveAck, TableEventWire } from '@universe/shared';
import type { GameScreenProps, GlueModule } from '@zekel/glue-kit';
import { useFakeSocket } from '../socket';
import { submissionLog } from '@zekel/glue-kit';
import { SessionProvider } from '../session';
import { TablePage } from '../pages/Table';
import { ev } from './fixtures';
import { GLUES } from '../glue';

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

/** A game-drawn screen that puts the caption card where it likes. */
function CaptionScreen({ caption }: GameScreenProps) {
  return <div className="test-screen">{caption && <div className="test-caption">{caption}</div>}</div>;
}

describe('the phone menu and the last move', () => {
  let socket: FakeSocket;
  const whole = GLUES['fractured-fist']!;
  const asPhone = (extra: Partial<GlueModule>) => { GLUES['fractured-fist'] = { ...whole, phone: true, Screen: CaptionScreen, placesCaption: true, ...extra }; };
  beforeEach(() => {
    socket = new FakeSocket();
    useFakeSocket(socket as never);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => fakeFetch(String(input))));
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('max-width'), media: q, addEventListener() {}, removeEventListener() {} }));
    submissionLog.length = 0;
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useFakeSocket(null);
    GLUES['fractured-fist'] = whole;
  });

  async function openMenu() {
    renderTable();
    await screen.findByText('The table is set.', { selector: '.test-caption *' });
    fireEvent.click(screen.getByRole('button', { name: /^Menu/ }));
    return screen.getByRole('dialog', { name: 'Menu' });
  }

  it('a screen that places its caption keeps it out of the menu (Warble Way Galaxy)', async () => {
    asPhone({});
    const menu = await openMenu();
    expect(menu.querySelector('[aria-label="Last move"]')).toBeNull();
  });

  it('with captionInPhoneMenu the menu shows the last move too, and the screen still places its own', async () => {
    asPhone({ captionInPhoneMenu: true });
    const menu = await openMenu();
    const last = menu.querySelector('[aria-label="Last move"]');
    expect(last).not.toBeNull();
    expect(last!.textContent).toContain('The table is set.');
    expect(document.querySelector('.test-caption')).not.toBeNull();
    expect(submissionLog).toHaveLength(0);
  });
});
