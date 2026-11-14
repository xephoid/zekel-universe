// The rules page with a game's rulebook. A game listed in RULEBOOKS whose
// own reader accepts the reference data shows the rulebook page, with the
// plain text one click away under it. A game with no rulebook page, data the
// reader refuses (a games server not yet updated, or a broken rulebook), or a
// rulebook page that fails while drawing, shows the plain text as before.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import neitherGutsNorGears from '@zekel/neither-guts-nor-gears';
import { SessionProvider } from '../session';
import { RulesPage } from '../pages/Rules';
import { RULEBOOKS } from '../glue';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const RULES = '## Overview\n\nThe engine\'s own words.\n\n## Setup\n\nLay out the map.';

function stubServer(gameId: string, referenceData: unknown) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/me') return json({ user: null, guest: null });
    if (url === `/api/games/${gameId}`) return json({ game: { id: gameId, name: 'A Game', rulesUrl: null } });
    if (url === `/api/games/${gameId}/reference`) return json({ gameId, rules: RULES, referenceData, moveSchema: null, optionsSchema: null });
    return json({ error: 'not_found' }, 404);
  }));
}

function open(gameId: string) {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[`/games/${gameId}/rules`]}>
        <Routes><Route path="/games/:id/rules" element={<RulesPage />} /></Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(cleanup);

describe('the rules page and a game\'s rulebook', () => {
  it('lists Neither Guts nor Gears\' rulebook page', () => {
    expect(Object.keys(RULEBOOKS)).toContain('neither-guts-nor-gears');
  });

  it('shows the rulebook when the game has one and its data carries it, with the plain text below', async () => {
    stubServer('neither-guts-nor-gears', neitherGutsNorGears.getReferenceData());
    const { container } = open('neither-guts-nor-gears');
    await waitFor(() => expect(container.querySelector('.ngg-rulebook')).not.toBeNull());
    expect(screen.getByRole('heading', { level: 2, name: 'Four ways to win' })).toBeTruthy();
    const plain = container.querySelector('details.rules-plain-toggle')!;
    expect(plain).not.toBeNull();
    expect(plain.hasAttribute('open')).toBe(false);
    expect(plain.textContent).toContain('The engine\'s own words.');
    expect(container.querySelector('.page.rules-wide')).not.toBeNull();
  });

  it('shows the plain text when the game\'s data has no rulebook', async () => {
    stubServer('neither-guts-nor-gears', { cards: [] });
    const { container } = open('neither-guts-nor-gears');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeTruthy());
    expect(container.querySelector('.ngg-rulebook')).toBeNull();
    expect(container.querySelector('details.rules-plain-toggle')).toBeNull();
    expect(container.querySelector('.page.narrow')).not.toBeNull();
  });

  it('shows the plain text for a game with no rulebook page, whatever its data says', async () => {
    stubServer('word-debauchee', { rulebook: { title: 'x' } });
    const { container } = open('word-debauchee');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Setup' })).toBeTruthy());
    expect(container.querySelector('details.rules-plain-toggle')).toBeNull();
  });

  it('shows the plain text when the rulebook in the data is incomplete', async () => {
    stubServer('neither-guts-nor-gears', { rulebook: {} });
    const { container } = open('neither-guts-nor-gears');
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeTruthy());
    expect(container.querySelector('.ngg-rulebook')).toBeNull();
    expect(container.querySelector('details.rules-plain-toggle')).toBeNull();
  });

  it('shows the plain text when the data has a rulebook but is missing the win numbers or maps', async () => {
    const full = neitherGutsNorGears.getReferenceData() as Record<string, unknown>;
    for (const drop of ['victory', 'maps', 'treaties']) {
      const { [drop]: _gone, ...rest } = full;
      stubServer('neither-guts-nor-gears', rest);
      const { container, unmount } = open('neither-guts-nor-gears');
      await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeTruthy());
      expect(container.querySelector('.ngg-rulebook'), drop).toBeNull();
      unmount();
    }
    // Part of the win numbers broken, or the heroes gone.
    const victory = full['victory'] as Record<string, unknown>;
    const milestones = victory['milestones_by_player_count'] as Record<string, unknown[]>;
    const broken = [
      { ...full, victory: { ...victory, milestones_by_player_count: { ...milestones, 4: [null, ...milestones['4']!.slice(1)] } } },
      { ...full, victory: { ...victory, milestones_by_player_count: { ...milestones, 4: milestones['4']!.slice(0, 3) } } },
      { ...full, heroes: [] },
    ];
    for (const [i, data] of broken.entries()) {
      stubServer('neither-guts-nor-gears', data);
      const { container, unmount } = open('neither-guts-nor-gears');
      await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeTruthy());
      expect(container.querySelector('.ngg-rulebook'), `broken data ${i}`).toBeNull();
      unmount();
    }
  });

  it('shows the plain text, open, when the rulebook page fails while drawing', async () => {
    const saved = RULEBOOKS['word-debauchee'];
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    RULEBOOKS['word-debauchee'] = { Page: () => { throw new Error('bad data'); }, ready: () => true };
    try {
      stubServer('word-debauchee', {});
      const { container } = open('word-debauchee');
      await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Setup' })).toBeTruthy());
      expect(container.querySelector('details.rules-plain-toggle')).toBeNull();
    } finally {
      if (saved) RULEBOOKS['word-debauchee'] = saved; else delete RULEBOOKS['word-debauchee'];
      quiet.mockRestore();
    }
  });
});
