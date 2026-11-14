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

  // Each list stays nonempty but loses or breaks an entry. The game's reader
  // fills those gaps with defaults, so the page must refuse them itself.
  describe('data that keeps its lists but loses or breaks an entry', () => {
    const fresh = () => structuredClone(neitherGutsNorGears.getReferenceData()) as Record<string, any>;
    const ready = (data: unknown) => RULEBOOKS['neither-guts-nor-gears']!.ready(
      { gameId: 'neither-guts-nor-gears', rules: RULES, referenceData: data, moveSchema: null, optionsSchema: null } as never);
    const breaks: Array<[string, (d: Record<string, any>) => void]> = [
      ['a map layout reduced to [{}]', (d) => { d.maps['3-4p'] = [{}]; }],
      ['one tile emptied', (d) => { d.maps['2p'][3] = {}; }],
      ['one tile with no coordinates', (d) => { delete d.maps['5-6p'][0].c; }],
      ['one tile with no resource', (d) => { delete d.maps['2p'][0].resource; }],
      ['a start tile lost', (d) => { d.maps['5-6p'] = d.maps['5-6p'].filter((t: any) => t.start == null || t.start !== 1); }],
      ['a deck card missing copies', (d) => { delete d.battle_deck[0].copies; }],
      ['a deck card with zero copies', (d) => { d.battle_deck[2].copies = 0; }],
      ['a deck card emptied', (d) => { d.battle_deck[1] = {}; }],
      ['a unit missing dmg', (d) => { delete d.robot_units.find((u: any) => u.init !== null).dmg; }],
      ['a unit with no name', (d) => { delete d.wizard_units[0].name; }],
      ['a unit with no cost', (d) => { d.wizard_units[1].cost = {}; }],
      ['a treaty missing its culture', (d) => { delete d.treaties[0].cultureIncome; }],
      ['the Evo Angel missing its stats', (d) => { delete d.heroes.find((h: any) => h.category === 'evo-angel').stats; }],
      ['the rulebook words missing players_by_layout', (d) => { delete d.rulebook.players_by_layout; }],
      ['one layout missing from players_by_layout', (d) => { delete d.rulebook.players_by_layout['5-6p']; }],
      ['the rulebook words missing a victory paragraph', (d) => { delete d.rulebook.victory.economic; }],
      ['the round stack cards emptied', (d) => { d.rulebook.round.stack.cards = []; }],
      ['a setup piece with no count', (d) => { delete d.rulebook.setup.wizard.pieces[0].count; }],
      ['a component with no name', (d) => { delete d.rulebook.components[0].name; }],
      ['the paying example figure gone', (d) => { delete d.rulebook.paying.example.figure; }],
      ['the treaty chart with a row missing a column', (d) => { delete d.rulebook.treaties.chart[0].hands; }],
      ['a win number written as text', (d) => { d.victory.culture_target_by_player_count['3'] = '105'; }],
      ['the tech target gone', (d) => { delete d.victory.tech_target; }],
    ];

    it('accepts the game\'s own data whole', () => {
      expect(ready(fresh())).toBe(true);
    });

    it.each(breaks)('refuses %s', (_name, breakIt) => {
      const data = fresh();
      breakIt(data);
      expect(ready(data)).toBe(false);
    });

    it('refuses rather than throws on odd values', () => {
      for (const odd of [null, undefined, 7, 'x', [], { rulebook: null }, { ...fresh(), maps: [] }, { ...fresh(), wizard_units: {} }]) {
        expect(() => ready(odd)).not.toThrow();
        expect(ready(odd)).toBe(false);
      }
    });

    it('shows the plain text for a map layout reduced to [{}] or a deck card missing copies', async () => {
      for (const [name, breakIt] of breaks.slice(0, 1).concat(breaks.filter(([n]) => n === 'a deck card missing copies'))) {
        const data = fresh();
        breakIt(data);
        stubServer('neither-guts-nor-gears', data);
        const { container, unmount } = open('neither-guts-nor-gears');
        await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeTruthy());
        expect(container.querySelector('.ngg-rulebook'), name).toBeNull();
        expect(container.querySelector('details.rules-plain-toggle'), name).toBeNull();
        unmount();
      }
    });
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
