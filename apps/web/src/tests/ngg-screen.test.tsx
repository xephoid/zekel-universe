// The NGnG screen drawn from views the engine actually produced: every
// captured decision renders for the seat that owes it and for a seat that
// watches, and nothing is ever sent without a press.

import { describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { LegalMove } from '@universe/shared';
import type { GlueInput } from '../glue';
import { NggScreen } from '../glue/ngg/NggScreen';

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
    view, previous: null, legalMoves, playerId, reference: null, seq: 1,
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
});
