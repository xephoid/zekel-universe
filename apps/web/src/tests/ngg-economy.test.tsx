// The NGnG purchase composer against engine views: choose, see the payment,
// place it, and exactly one listed move goes out — only on the last press.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GameReferenceResponse, LegalMove } from '@universe/shared';
import type { GlueInput } from '../glue';
import { isSubmissionAllowed } from '../glue/agency';
import { NggScreen } from '../glue/ngg/NggScreen';
import REFERENCE from './fixtures/ngg-reference.json';
import BUILD from './fixtures/ngg/action-build-base.json';
import ACCESS from './fixtures/ngg/pending-access_request-queue.json';
import SMYTH from './fixtures/ngg/pending-smyth_reward-4p.json';

interface Fixture { viewer: string; view: unknown; legalMoves: LegalMove[]; watcher: string; watcherView: unknown; watcherLegalMoves: LegalMove[] }

afterEach(cleanup);

function draw(f: Fixture, opts: { as?: 'viewer' | 'watcher'; legal?: LegalMove[] } = {}) {
  const watcher = opts.as === 'watcher';
  const legal = opts.legal ?? (watcher ? f.watcherLegalMoves : f.legalMoves);
  const onMove = vi.fn();
  const onForm = vi.fn();
  const input: GlueInput = {
    view: watcher ? f.watcherView : f.view, previous: null, legalMoves: legal,
    playerId: watcher ? f.watcher : f.viewer, reference: REFERENCE as GameReferenceResponse,
    seq: 1, engineMove: null, actorPlayerId: null, memory: new Map(),
  };
  render(<NggScreen input={input} yourTurn={!watcher} busy={false} interactive nameFor={(p) => p} onMove={onMove} onForm={onForm} />);
  return { onMove, onForm, legal };
}

const press = (name: RegExp | string) => fireEvent.click(screen.getAllByRole('button', { name })[0]!);

describe('NGnG build composer', () => {
  it('walks choose → pay and sends the listed move only on commit', () => {
    const { onMove, onForm, legal } = draw(BUILD as Fixture);
    press(/^Combat Frame Production/);
    expect(onMove).not.toHaveBeenCalled();
    press('Choose Combat Frame Production');
    expect(onMove).not.toHaveBeenCalled();
    // The payment is the engine's proposal, drawn as placements to commit.
    expect(screen.getByText('Pay for Combat Frame Production')).toBeTruthy();
    press('Commit payment');
    expect(onMove).toHaveBeenCalledTimes(1);
    const sent = onMove.mock.calls[0]![0] as LegalMove;
    expect(sent.move['item']).toBe('Combat Frame Production');
    expect(isSubmissionAllowed('tap', sent.move, legal)).toBe(true);
    expect(onForm).not.toHaveBeenCalled();
  });

  it('drops the purchase with no server call', () => {
    const { onMove, onForm } = draw(BUILD as Fixture);
    press(/^Core/);
    press('Choose Core');
    press('Drop the purchase');
    expect(screen.getByText('Buy one thing')).toBeTruthy();
    expect(onMove).not.toHaveBeenCalled();
    expect(onForm).not.toHaveBeenCalled();
  });

  it('asks where a piece goes when the engine lists one move per base, and never picks for you', () => {
    const f = BUILD as Fixture;
    // Two listed spawns for the platform, as the engine lists them per base.
    const base = f.legalMoves.find((m) => m.move['item'] === 'Immobile Combat Platform')!;
    const legal = [
      ...f.legalMoves.filter((m) => m !== base),
      { ...base, move: { ...base.move, at_base: '2,4' } },
      { ...base, move: { ...base.move, at_base: '1,3' } },
    ];
    const { onMove } = draw(f, { legal });
    press(/^Immobile Combat Platform/);
    press('Choose Immobile Combat Platform');
    press('Commit payment, then place it');
    expect(onMove).not.toHaveBeenCalled();
    expect(screen.getByText('Immobile Combat Platform is in hand')).toBeTruthy();
    press(/^F2/);
    expect(onMove).toHaveBeenCalledTimes(1);
    const sent = (onMove.mock.calls[0]![0] as LegalMove).move;
    expect(sent['at_base']).toBe('1,3');
    expect(isSubmissionAllowed('tap', sent, legal)).toBe(true);
  });

  it('skips only when Skip is pressed', () => {
    const { onMove } = draw(BUILD as Fixture);
    expect(onMove).not.toHaveBeenCalled();
    press('Skip this action');
    expect((onMove.mock.calls[0]![0] as LegalMove).move).toEqual({ type: 'skip_action' });
  });
});

describe('NGnG access request', () => {
  it('interrupts the owner with the declared purchase and sends their answer', () => {
    const { onMove, legal } = draw(ACCESS as Fixture);
    expect(screen.getByRole('dialog', { name: /out of turn/ })).toBeTruthy();
    expect(screen.getByText(/asks to stand one collector on G3/)).toBeTruthy();
    press('Allow');
    const sent = (onMove.mock.calls[0]![0] as LegalMove).move;
    expect(sent).toEqual({ type: 'respond_access_request', grant: true });
    expect(isSubmissionAllowed('tap', sent, legal)).toBe(true);
  });

  it('shows the buyer the same terms, with nothing to press', () => {
    draw(ACCESS as Fixture, { as: 'watcher' });
    expect(screen.queryByRole('dialog', { name: /out of turn/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(screen.getByText(/has to agree/)).toBeTruthy();
  });
});

describe("NGnG Smyth's reward", () => {
  it('offers each listed technology free and sends the one pressed', () => {
    const { onMove } = draw(SMYTH as Fixture);
    press(/^Take Metal Platforms/);
    expect((onMove.mock.calls[0]![0] as LegalMove).move).toEqual({ type: 'research', kind: 'tech', tech: 'Metal Platforms', payment: [] });
  });
});
