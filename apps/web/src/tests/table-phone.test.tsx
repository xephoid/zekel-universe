// The table's phone frame for a game-drawn screen (docs/games/sweetlands-phone-build.md,
// items 1 and 2): a short title on the top bar, and a place in the menu sheet
// the screen can fill, with a way for the screen to open it. A fake glue with
// a phone layout stands in for the game; the real table page draws it.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { GameScreenProps, GlueModule } from '@zekel/glue-kit';
import { useFakeSocket } from '../socket';
import { SessionProvider } from '../session';
import { TablePage } from '../pages/Table';
import { ev } from './fixtures';
import { GLUES } from '../glue';

type Handler = (...args: unknown[]) => void;
class FakeSocket {
  connected = true;
  handlers = new Map<string, Handler[]>();
  emitted: Array<{ event: string; payload: unknown }> = [];
  on(event: string, h: Handler) { this.handlers.set(event, [...(this.handlers.get(event) ?? []), h]); return this; }
  off(event: string, h: Handler) { this.handlers.set(event, (this.handlers.get(event) ?? []).filter((x) => x !== h)); return this; }
  timeout() { return this; }
  emit(event: string, payload: unknown, ack?: (...a: unknown[]) => void) {
    this.emitted.push({ event, payload });
    if (event === 'join_table') ack?.({ ok: true, seats: [0], status: 'playing' });
    return this;
  }
}

/** What the fake screen was last given, so a test can press openMenu. */
let lastProps: GameScreenProps | null = null;

function FakeScreen(props: GameScreenProps) {
  lastProps = props;
  return (
    <div className="fake-screen">
      {props.openMenu && <button type="button" onClick={props.openMenu}>Scores</button>}
      {props.menuSlot && createPortal(<p>The game’s own part of the menu</p>, props.menuSlot)}
    </div>
  );
}

const FAKE: GlueModule = {
  gameId: 'fake-phone',
  title: 'A Very Long Game Title',
  Screen: FakeScreen,
  phone: true,
  plan: () => ({ board: [], bench: [], side: [], palette: {}, title: 'A Very Long Game Title', titleShort: 'Long Game', statusShort: 'R2' }),
  litParts: () => [],
} as unknown as GlueModule;

const opening = ev(1, 'The table is set.', { kind: 'setup', actorSeatPosition: null, view: { phase: 'play' }, legalMoves: [], yourTurn: false, playerId: 'p1', nextActorPosition: 1 });
const TABLE = {
  table: { id: 't1', gameId: 'fake-phone', gameName: 'A Very Long Game Title', mode: 'live', status: 'playing', createdAt: '', finishedAt: null, hostIsMe: true, nextActorPosition: 1, waitingOnMe: false },
  seats: [{ position: 0, kind: 'human', aiDifficulty: null, ready: true, mine: true, taken: true, displayName: 'Guest' }, { position: 1, kind: 'ai', aiDifficulty: 'easy', ready: true, mine: false, taken: true, displayName: 'AI (easy)' }],
  mySeats: [0],
};

function fakeFetch(url: string): Promise<Response> {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
  if (url === '/api/me') return json({ user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } });
  if (url === '/api/tables/t1') return json(TABLE);
  if (url.startsWith('/api/tables/t1/events')) return json({ events: [opening] });
  if (url === '/api/games/fake-phone/reference') return json({ gameId: 'fake-phone', rules: 'rules', moveSchema: {}, optionsSchema: {}, referenceData: {} });
  return Promise.resolve(new Response('{"error":"not_found"}', { status: 404 }));
}

function setPhone(on: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: on, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
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

describe('the phone frame for a game-drawn screen', () => {
  beforeEach(() => {
    useFakeSocket(new FakeSocket() as never);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => fakeFetch(String(input))));
    GLUES['fake-phone'] = FAKE;
    lastProps = null;
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    useFakeSocket(null);
    delete GLUES['fake-phone'];
  });

  it('shows the plan’s short title on a phone, and the full title off one', async () => {
    setPhone(true);
    const { container, unmount } = renderTable();
    await waitFor(() => expect(container.querySelector('.fake-screen')).not.toBeNull());
    expect(container.querySelector('.table-topbar .title')!.textContent).toBe('Long Game');
    unmount();
    setPhone(false);
    const desk = renderTable();
    await waitFor(() => expect(desk.container.querySelector('.fake-screen')).not.toBeNull());
    expect(desk.container.querySelector('.table-topbar .title')!.textContent).toBe('A Very Long Game Title');
  });

  it('lets the screen open the menu, and gives it a place at the top of the open menu', async () => {
    setPhone(true);
    renderTable();
    await screen.findByText('Scores');
    // Closed: no place in the menu yet.
    expect(lastProps!.menuSlot ?? null).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText('Scores')); });
    const menu = await screen.findByRole('dialog', { name: 'Menu' });
    await within(menu).findByText('The game’s own part of the menu');
    // The screen's part comes first, above the table's own buttons.
    const slot = menu.querySelector('.menu-game')!;
    expect(slot.nextElementSibling?.className).toContain('menu-grid');
    expect(slot.previousElementSibling?.tagName).toBe('H2');
    // Closing the menu takes the place away again.
    await act(async () => { fireEvent.click(within(menu).getByRole('button', { name: 'Close' })); });
    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
    await waitFor(() => expect(lastProps!.menuSlot ?? null).toBeNull());
  });

  it('gives the screen neither the menu nor its place off a phone', async () => {
    setPhone(false);
    const { container } = renderTable();
    await waitFor(() => expect(container.querySelector('.fake-screen')).not.toBeNull());
    expect(lastProps!.openMenu).toBeUndefined();
    expect(lastProps!.menuSlot ?? null).toBeNull();
  });
});
