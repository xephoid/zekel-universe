// The NGnG screen drawn from views the engine actually produced: every
// captured decision renders for the seat that owes it and for a seat that
// watches, and nothing is ever sent without a press.

import { describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
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
});
