// Featured games (T47): home shows only the games with a featured place,
// lowest first, and draws no Featured row when none has one; the admin page
// takes a game's place away at once (the Unfeature button, or an emptied
// field) without saving the rest of the form.

import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { GameCatalogEntry } from '@universe/shared';
import { SessionProvider } from '../session';
import { HomePage, featuredGames } from '../pages/Home';
import { AdminPage } from '../pages/Admin';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const GUEST = { user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } };

const game = (id: string, name: string, featuredRank: number | null, over: Partial<GameCatalogEntry> = {}): GameCatalogEntry => ({
  engineGameId: id, name, designerName: 'Zekel Games', playerCount: '2', minPlayers: 2, maxPlayers: 2, supportsAi: true,
  playTime: '', tags: [], coverImage: null, coverFocus: null, description: '', rulesUrl: null, visibility: 'public',
  designerSlug: 'zekel-games', screenshots: [], featuredRank, ...over,
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('featuredGames', () => {
  it('lists only games with a place, lowest first, and keeps the order when a place in the middle is gone', () => {
    const games = [game('a', 'Alpha', 3), game('b', 'Bravo', null), game('c', 'Charlie', 1), game('d', 'Delta', 5)];
    expect(featuredGames(games).map((g) => g.engineGameId)).toEqual(['c', 'a', 'd']);
    // Unfeature the one in place 3: the others keep their order, places 1 and 5.
    games[0] = { ...games[0]!, featuredRank: null };
    expect(featuredGames(games).map((g) => g.engineGameId)).toEqual(['c', 'd']);
  });

  it('breaks a tie by name', () => {
    expect(featuredGames([game('z', 'Zed', 1), game('y', 'Yak', 1)]).map((g) => g.name)).toEqual(['Yak', 'Zed']);
  });
});

function renderHome(games: GameCatalogEntry[]) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/me') return json(GUEST);
    if (url === '/api/games') return json({ games });
    if (url.startsWith('/api/updates')) return json({ updates: [] });
    if (url === '/api/my-tables') return json({ tables: [] });
    return json({ error: 'not_found' }, 404);
  }));
  return render(<SessionProvider><MemoryRouter><HomePage /></MemoryRouter></SessionProvider>);
}

describe('home', () => {
  it('shows only the featured games in the Featured row, in their order', async () => {
    const { container } = renderHome([game('ff', 'Fractured Fist', 2), game('cn', 'Cybernoir 2127', null), game('ww', 'Warble Way Galaxy', 1)]);
    await screen.findByRole('heading', { name: 'Featured' });
    const row = container.querySelector('.featured-grid') as HTMLElement;
    expect([...row.querySelectorAll('.card-title')].map((t) => t.textContent)).toEqual(['Warble Way Galaxy', 'Fractured Fist']);
    expect(within(row).queryByText('Cybernoir 2127')).toBeNull();
  });

  it('draws no Featured row once the last featured game is unfeatured, and no stand-ins', async () => {
    renderHome([game('ff', 'Fractured Fist', null), game('cn', 'Cybernoir 2127', null)]);
    await screen.findByRole('heading', { name: 'Newest' });
    await screen.findAllByText('Fractured Fist');
    expect(screen.queryByRole('heading', { name: 'Featured' })).toBeNull();
  });
});

describe('the admin page', () => {
  type Call = { method: string; url: string; body?: { featuredRank: number | null; name: string } };
  function renderAdmin(calls: Call[], opts: { failClear?: boolean } = {}) {
    let games = [game('ff', 'Fractured Fist', 1), game('cn', 'Cybernoir 2127', 2)];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url === '/api/me') return json({ user: { id: 'u', displayName: 'Boss', avatarUrl: null, bio: null, createdAt: '' }, guest: null, isAdmin: true });
      if (url === '/api/admin/content') return json({ games, designers: [{ slug: 'zekel-games', name: 'Zekel Games', bio: '', avatarImage: null }], updates: [] });
      const featured = /^\/api\/admin\/games\/([^/]+)\/featured$/.exec(url);
      if (featured && method === 'DELETE') {
        calls.push({ method, url });
        if (opts.failClear) return json({ error: 'server_error', message: 'Something went wrong on the server.' }, 500);
        games = games.map((g) => (g.engineGameId === featured[1] ? { ...g, featuredRank: null } : g));
        return json({ ok: true });
      }
      if (url.startsWith('/api/admin/games/') && method === 'PUT') {
        const body = JSON.parse(String(init!.body));
        calls.push({ method, url, body });
        const id = decodeURIComponent(url.split('/').pop()!);
        games = games.map((g) => (g.engineGameId === id ? { ...g, name: body.name, featuredRank: body.featuredRank } : g));
        return json({ ok: true });
      }
      return json({ error: 'not_found' }, 404);
    }));
    return render(<SessionProvider><MemoryRouter><AdminPage /></MemoryRouter></SessionProvider>);
  }
  const listRow = (name: string) => screen.getAllByRole('button').find((b) => b.textContent?.startsWith(name))!;

  it('Unfeature saves at once, sends only the place, and leaves other edits unsaved', async () => {
    const calls: Call[] = [];
    renderAdmin(calls);
    const field = (await screen.findByLabelText(/Featured place/)) as HTMLInputElement;
    expect(field.value).toBe('1');
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Half-typed name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unfeature' }));
    await screen.findByText(/^Unfeatured\./);
    // One DELETE of the place; no Save of the form.
    expect(calls).toEqual([{ method: 'DELETE', url: '/api/admin/games/ff/featured' }]);
    expect(field.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Unfeature' })).toBeNull();
    // The list reads the cleared row back; the half-typed name stays in the form, unsaved.
    await waitFor(() => expect(listRow('Fractured Fist').textContent).toContain('Not featured'));
    expect(listRow('Cybernoir 2127').textContent).toContain('Featured 2');
    expect(name.value).toBe('Half-typed name');
  });

  it('emptying the field saves the clear at once too', async () => {
    const calls: Call[] = [];
    renderAdmin(calls);
    const field = (await screen.findByLabelText(/Featured place/)) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '' } });
    await screen.findByText(/^Unfeatured\./);
    expect(calls).toEqual([{ method: 'DELETE', url: '/api/admin/games/ff/featured' }]);
    await waitFor(() => expect(listRow('Fractured Fist').textContent).toContain('Not featured'));
  });

  it('a failed clear says so and keeps the place', async () => {
    const calls: Call[] = [];
    renderAdmin(calls, { failClear: true });
    const field = (await screen.findByLabelText(/Featured place/)) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: 'Unfeature' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Not unfeatured/);
    expect(field.value).toBe('1');
    expect(screen.getByRole('button', { name: 'Unfeature' })).toBeTruthy();
    expect(screen.queryByText(/^Unfeatured\./)).toBeNull();
    expect(listRow('Fractured Fist').textContent).toContain('Featured 1');
  });

  it('Save still sends the whole form, with the place typed', async () => {
    const calls: Call[] = [];
    renderAdmin(calls);
    const field = (await screen.findByLabelText(/Featured place/)) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fractured Fist' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.body!.featuredRank).toBe(4);
    await waitFor(() => expect(listRow('Fractured Fist').textContent).toContain('Featured 4'));
  });
});
