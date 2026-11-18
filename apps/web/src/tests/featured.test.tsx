// Featured games (T47): home shows only the games with a featured place,
// lowest first, and draws no Featured row when none has one; the admin page
// can take a game's place away (the Unfeature button, or an empty field),
// and saving sends an empty place to the server.

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
  function renderAdmin(saves: unknown[]) {
    let games = [game('ff', 'Fractured Fist', 1), game('cn', 'Cybernoir 2127', 2)];
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me') return json({ user: { id: 'u', displayName: 'Boss', avatarUrl: null, bio: null, createdAt: '' }, guest: null, admin: true });
      if (url === '/api/admin/content') return json({ games, designers: [{ slug: 'zekel-games', name: 'Zekel Games', bio: '', avatarImage: null }], updates: [] });
      if (url.startsWith('/api/admin/games/') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        saves.push(body);
        const id = decodeURIComponent(url.split('/').pop()!);
        games = games.map((g) => (g.engineGameId === id ? { ...g, featuredRank: body.featuredRank } : g));
        return json({ ok: true });
      }
      return json({ error: 'not_found' }, 404);
    }));
    return render(<SessionProvider><MemoryRouter><AdminPage /></MemoryRouter></SessionProvider>);
  }

  it('Unfeature empties the place, and saving sends an empty place', async () => {
    const saves: Array<{ featuredRank: number | null }> = [];
    renderAdmin(saves);
    const field = (await screen.findByLabelText(/Featured place/)) as HTMLInputElement;
    expect(field.value).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: 'Unfeature' }));
    expect(field.value).toBe('');
    expect(screen.queryByRole('button', { name: 'Unfeature' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save Fractured Fist' }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.featuredRank).toBeNull();
    // The list beside the form reads the saved row back.
    expect(await screen.findByText(/^Not featured/)).toBeTruthy();
    expect(screen.getByText(/^Featured 2/)).toBeTruthy();
  });

  it('an emptied field saves as not featured too', async () => {
    const saves: Array<{ featuredRank: number | null }> = [];
    renderAdmin(saves);
    const field = (await screen.findByLabelText(/Featured place/)) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Fractured Fist' }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]!.featuredRank).toBeNull();
  });
});
