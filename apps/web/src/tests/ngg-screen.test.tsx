// The NGnG screen drawn from views the engine actually produced: every
// captured decision renders for the seat that owes it and for a seat that
// watches, and nothing is ever sent without a press.

import { describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/react';
import type { GameReferenceResponse, LegalMove } from '@universe/shared';
import type { GlueInput } from '../glue';
import { NggScreen } from '../glue/ngg/NggScreen';
import nggGlue from '../glue/ngg';
import REFERENCE from './fixtures/ngg-reference.json';

interface Fixture {
  key: string;
  viewer: string;
  view: unknown;
  legalMoves: LegalMove[];
  watcher: string;
  watcherView: unknown;
  watcherLegalMoves: LegalMove[];
}

const FIXTURES = Object.entries(import.meta.glob<Fixture>('./fixtures/ngg/*.json', { eager: true, import: 'default' }))
  .map(([path, f]) => ({ name: path.replace(/^.*\//, '').replace(/\.json$/, ''), f }));

function inputFor(view: unknown, playerId: string, legalMoves: LegalMove[]): GlueInput {
  return {
    view, previous: null, legalMoves, playerId, reference: REFERENCE as GameReferenceResponse, seq: 1,
    engineMove: null, actorPlayerId: null, memory: new Map(),
  };
}

describe('NGnG screen', () => {
  for (const { name, f } of FIXTURES) {
    it(`${name}: draws for the deciding seat and a watcher, and sends nothing on its own`, () => {
      const onMove = vi.fn();
      const onForm = vi.fn();
      const common = { busy: false, interactive: true, onMove, onForm, nameFor: (pid: string) => pid };
      const a = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn {...common} />);
      expect(a.container.querySelector('.ngg-root')).not.toBeNull();
      cleanup();
      const b = render(<NggScreen input={inputFor(f.watcherView, f.watcher, f.watcherLegalMoves)} yourTurn={false} {...common} />);
      expect(b.container.querySelector('.ngg-root')).not.toBeNull();
      // A watcher never has a live control for the decision.
      expect(b.container.querySelectorAll('button.ngg-option:not(:disabled)')).toHaveLength(0);
      cleanup();
      expect(onMove).not.toHaveBeenCalled();
      expect(onForm).not.toHaveBeenCalled();
    });
  }

  it('prints a shut option with the engine\'s own reason', () => {
    const f = FIXTURES.find((x) => x.name === 'pending-treaty_break_decision-blocked')!.f;
    const pending = (f.view as { pending: { options: Array<{ blocked_reason?: string }> } }).pending;
    const reason = pending.options.find((o) => o.blocked_reason)!.blocked_reason!;
    const r = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    expect(r.container.textContent).toContain(reason);
    cleanup();
  });
  it("gives the whole page the seat's own faction theme, and a watcher the plain one", () => {
    const f = FIXTURES[0]!.f;
    expect(nggGlue.themeFor!(inputFor(f.view, f.viewer, f.legalMoves))).toMatch(/^ngg-theme ngg-theme-(wizard|robot)$/);
    expect(nggGlue.themeFor!(inputFor(null, 'nobody', []))).toBeNull();
  });

  it("places the table's move list in the column and the faction strip in the bench", () => {
    const f = FIXTURES[0]!.f;
    const bench = document.createElement('div');
    document.body.appendChild(bench);
    const r = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p}
      menu={<div data-testid="menu">Moves</div>} benchSlot={bench} />);
    expect(r.container.querySelector('.ngg-column .ngg-menu [data-testid="menu"]')).not.toBeNull();
    expect(bench.querySelector('.ngg-strip')).not.toBeNull();
    expect(r.container.querySelector('.ngg-strip')).toBeNull();
    cleanup();
    bench.remove();
  });

  it('zooms the map by three stops, and pans only when zoomed in', () => {
    const f = FIXTURES[0]!.f;
    const r = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    const stop = (name: string) => r.getByRole('button', { name });
    expect(stop('Whole map').getAttribute('aria-pressed')).toBe('true');
    expect(r.container.querySelector('.ngg-map-scroll.panned')).toBeNull();
    fireEvent.click(stop('Hex'));
    expect(stop('Hex').getAttribute('aria-pressed')).toBe('true');
    expect(r.container.querySelector('.ngg-map-scroll.panned')).not.toBeNull();
    fireEvent.keyDown(r.container.querySelector('.ngg-map-scroll')!, { key: '0' });
    expect(stop('Whole map').getAttribute('aria-pressed')).toBe('true');
    cleanup();
  });
  it('opens any seat\'s board from the seats, with a rival\'s hand face down', () => {
    const f = FIXTURES.find((x) => x.name === 'action-build-robot-mid')!.f;
    const view = structuredClone(f.view) as { players: Array<Record<string, unknown>>; your_hand?: unknown };
    // A list of owned collectors, as a newer engine publishes it.
    const rival = view.players.find((p) => p['player_id'] !== f.viewer)!;
    rival['collectors'] = [
      { collector: 'surf-1', type: 'Surf', placed_at: null },
      { collector: 'surf-2', type: 'Surf', placed_at: null },
      { collector: 'surf-3', type: 'Surf', placed_at: '3,5' },
    ];
    const r = render(<NggScreen input={inputFor(view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    const open = [...r.container.querySelectorAll<HTMLButtonElement>('button.ngg-seat')].find((b) => !b.classList.contains('you'))!;
    fireEvent.click(open);
    const sheet = r.getByRole('dialog', { name: /faction board$/ });
    expect(sheet.getAttribute('aria-label')).not.toBe('Your faction board');
    const surf = [...sheet.querySelectorAll('.ngg-fb-unit')].find((u) => u.textContent?.includes('Surf'))!;
    expect(surf.querySelector('.ngg-fb-count')!.textContent).toBe('×3');
    expect(surf.textContent).toContain('1 on the map');
    // Only card backs: a rival's hand is never named.
    expect(sheet.querySelectorAll('.ngg-fb-card')).toHaveLength(0);
    cleanup();
  });

  it('names a piece on hover and opens its details on a press where the hex is not part of the decision', () => {
    const f = FIXTURES.find((x) => x.name === 'action-build-robot-mid')!.f;
    const onMove = vi.fn();
    const r = render(<NggScreen input={inputFor(f.watcherView, f.watcher, f.watcherLegalMoves)} yourTurn={false} busy={false} interactive onMove={onMove} onForm={vi.fn()} nameFor={(p) => p} />);
    const piece = r.container.querySelector<HTMLButtonElement>('button.ngg-piece-btn')!;
    expect(piece.querySelector('[title]')!.getAttribute('title')).toMatch(/ · /);
    fireEvent.click(piece);
    expect(r.getByRole('dialog', { name: /^Pieces at / })).toBeTruthy();
    fireEvent.click(r.getByRole('button', { name: 'Close' }));
    expect(r.queryByRole('dialog', { name: /^Pieces at / })).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
    cleanup();
  });
  it("shows a seat its own planned cards and a rival's only as a face-down count", () => {
    const f = FIXTURES.find((x) => x.name === 'phase-planning')!.f;
    const view = f.view as { players: Array<Record<string, unknown>>; your_action_cards_played?: unknown };
    expect(Array.isArray(view.your_action_cards_played)).toBe(true);
    expect(view.players.every((p) => !('action_cards_played_this_round' in p))).toBe(true);
    const r = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    const rival = [...r.container.querySelectorAll<HTMLButtonElement>('button.ngg-seat')].find((b) => !b.classList.contains('you'))!;
    fireEvent.click(rival);
    const sheet = r.getByRole('dialog', { name: /faction board$/ });
    expect(sheet.textContent).toContain('face down');
    expect(sheet.textContent).not.toContain('on the stack');
    cleanup();
  });
  it('draws the culture race to the target and milestones for this many players', () => {
    for (const name of ['phase-planning', 'phase-planning-multi']) {
      const f = FIXTURES.find((x) => x.name === name)!.f;
      const players = (f.view as { players: Array<{ culture_target?: number }> }).players;
      const target = players[0]!.culture_target!;
      expect(target).toBe(50 * players.length);
      const r = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
      const marks = [...r.container.querySelectorAll('.ngg-race-axis span')].map((s) => Number(s.textContent));
      expect(marks[marks.length - 1]).toBe(target);
      const ref = (REFERENCE as { referenceData: { victory: { milestones_by_player_count: Record<string, number[]> } } }).referenceData.victory;
      expect(marks.slice(0, -1)).toEqual(ref.milestones_by_player_count[String(players.length)]);
      expect(r.container.textContent).toContain(`${target} wins`);
      cleanup();
    }
  });
  it('tracks Economic progress for every seat: collectors owned against the count the spend takes', () => {
    const f = FIXTURES.find((x) => x.name === 'action-build-robot-mid')!.f;
    // The count scales with the map: the catalogue gives it by layout.
    const byLayout = (REFERENCE as { referenceData: { victory: { economic_collectors_by_layout: Record<string, number> } } }).referenceData.victory.economic_collectors_by_layout;
    const need = byLayout[(f.view as { layout: string }).layout];
    expect(need).toBeGreaterThan(0);
    const r = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    const players = (f.view as { players: Array<{ player_id: string; collectors?: unknown[] }> }).players;
    const rows = [...r.container.querySelectorAll('button.ngg-seat')];
    expect(rows).toHaveLength(players.length);
    players.forEach((p, i) => {
      const econ = [...rows[i]!.querySelectorAll('.ngg-stat')].find((s) => s.textContent?.endsWith('ECON'))!;
      expect(econ.textContent).toBe(`${p.collectors ? p.collectors.length : '—'}/${need}ECON`);
    });
    cleanup();
  });
  it("shows on the faction board what a battle card costs and what unlocks it, from the engine's catalogue", () => {
    const f = FIXTURES.find((x) => x.name === 'phase-planning')!.f;
    const r = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    fireEvent.click(r.container.querySelector<HTMLButtonElement>('button.ngg-seat.you')!);
    const price = r.getByRole('dialog', { name: 'Your faction board' }).querySelector('.ngg-fb-card-cost')!;
    const purchase = (REFERENCE as { referenceData: { battle_card_purchase: { cost: Record<string, number>; either: string[]; unlocked_by: Record<string, string> } } }).referenceData.battle_card_purchase;
    const species = (f.view as { players: Array<{ player_id: string; species: string }> }).players.find((p) => p.player_id === f.viewer)!.species;
    expect(price.textContent).toContain('Buy one on a Research action');
    // Whether this seat can buy one, from the engine's own list.
    const me = (f.view as { players: Array<{ player_id: string; locked: { battle_cards: string | null } }> }).players.find((p) => p.player_id === f.viewer)!;
    if (me.locked.battle_cards) expect(price.textContent).toMatch(new RegExp(`Locked · needs an? ${purchase.unlocked_by[species]}`));
    else expect(price.textContent).toContain('Unlocked');
    // One chip per fixed resource, then one per either-or resource.
    expect(price.querySelectorAll('.ngg-res')).toHaveLength(Object.keys(purchase.cost).length + purchase.either.length);
    expect(price.textContent).toContain('+ either');
    cleanup();
  });
  it("marks on the faction board what the seat has and has not unlocked, from the engine's own list", () => {
    const f = FIXTURES.find((x) => x.name === 'phase-planning')!.f;
    const view = structuredClone(f.view) as { players: Array<Record<string, unknown>> };
    const me = view.players.find((p) => p['player_id'] === f.viewer)!;
    const species = me['species'] as string;
    const units = (REFERENCE as unknown as { referenceData: Record<string, Array<{ name: string }>> }).referenceData[`${species}_units`]!;
    const [lockedUnit, openUnit] = [units[units.length - 1]!.name, units[0]!.name];
    me['locked'] = { units: { [lockedUnit]: 'needs a Temple' }, research: {}, treaties: 'needs an Embassy', battle_cards: null };
    const r = render(<NggScreen input={inputFor(view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    fireEvent.click(r.container.querySelector<HTMLButtonElement>('button.ngg-seat.you')!);
    const board = r.getByRole('dialog', { name: 'Your faction board' });
    const card = (name: string) => [...board.querySelectorAll('.ngg-fb-unit')].find((u) => u.querySelector('b')?.textContent === name)!;
    expect(card(lockedUnit).classList.contains('locked')).toBe(true);
    expect(card(lockedUnit).textContent).toContain('Locked · needs a Temple');
    expect(card(openUnit).textContent).toContain('Unlocked');
    expect(board.querySelector('.ngg-fb-treaty-lock')!.textContent).toContain('Locked · needs an Embassy');
    expect(board.querySelector('.ngg-fb-card-cost')!.textContent).toContain('Unlocked');
    cleanup();
  });

  it('opens a board item for everything the catalogue says about it', () => {
    const f = FIXTURES.find((x) => x.name === 'phase-planning')!.f;
    const r = render(<NggScreen input={inputFor(f.view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    fireEvent.click(r.container.querySelector<HTMLButtonElement>('button.ngg-seat.you')!);
    const board = r.getByRole('dialog', { name: 'Your faction board' });
    const unit = board.querySelector<HTMLElement>('.ngg-fb-unit')!;
    const name = unit.querySelector('b')!.textContent!;
    fireEvent.click(unit);
    const detail = r.getByRole('dialog', { name });
    expect(detail.textContent).toContain('Cost');
    expect(detail.textContent).toContain('Owned');
    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
    expect(r.queryByRole('dialog', { name })).toBeNull();
    // Buildings, technologies and heroes open the same way, by keyboard too.
    const building = board.querySelector<HTMLElement>('.ngg-fb-list li.pressable')!;
    fireEvent.keyDown(building, { key: 'Enter' });
    expect(r.getByRole('dialog', { name: building.querySelector('b')!.textContent! }).textContent).toContain('Cost');
    cleanup();
  });
  it('opens a list of every treaty, who with whom, from the Treaties link under Seats', () => {
    const f = FIXTURES.find((x) => x.name === 'phase-planning')!.f;
    const view = structuredClone(f.view) as { treaties: unknown[]; players: Array<{ player_id: string }> };
    const [a, b] = view.players.map((p) => p.player_id);
    view.treaties = [{ treaty: 'Peace', partners: [a, b], culture_income: 2 }];
    const r = render(<NggScreen input={inputFor(view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    fireEvent.click(r.getByRole('button', { name: 'Treaties (1)' }));
    const sheet = r.getByRole('dialog', { name: 'Treaties' });
    expect(sheet.textContent).toContain('Peace');
    expect(sheet.textContent).toContain('+2 culture each a round');
    expect(sheet.querySelectorAll('.ngg-chip')).toHaveLength(2);
    cleanup();
  });

  it('marks a seat holding an unrevealed spy, without naming the hero', () => {
    const f = FIXTURES.find((x) => x.name === 'phase-planning')!.f;
    const view = structuredClone(f.view) as { players: Array<Record<string, unknown>> };
    const rival = view.players.find((p) => p['player_id'] !== f.viewer)!;
    rival['unrevealed_spies'] = 1;
    const r = render(<NggScreen input={inputFor(view, f.viewer, f.legalMoves)} yourTurn busy={false} interactive onMove={vi.fn()} onForm={vi.fn()} nameFor={(p) => p} />);
    const row = [...r.container.querySelectorAll('button.ngg-seat')].find((b) => !b.classList.contains('you'))!;
    const mark = row.querySelector('.ngg-spy-mark')!;
    expect(mark.getAttribute('title')).toMatch(/unrevealed .* spy — which hero carries it is secret/);
    expect(r.container.querySelector('button.ngg-seat.you .ngg-spy-mark')).toBeNull();
    cleanup();
  });
});
