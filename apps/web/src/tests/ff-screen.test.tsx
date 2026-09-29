// The Fractured Fist screen: both fighters' plates at the top, every number
// from the view, the opponent's panels gone from the side, and nothing sent
// but a move the engine listed, on a press.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { GlueInput, LegalMove } from '../glue';
import { FfScreen } from '../glue/ff/FfScreen';
import { FF_MOVES, FF_REFERENCE, FF_VIEW } from './fixtures/ff';

function inputFor(view: unknown, legalMoves: LegalMove[], playerId: string | null = 'p1'): GlueInput {
  return {
    view, previous: null, legalMoves, playerId, reference: FF_REFERENCE, seq: 1,
    engineMove: null, actorPlayerId: null, memory: new Map(),
  };
}

function draw(opts: { view?: unknown; moves?: LegalMove[]; playerId?: string | null; yourTurn?: boolean; interactive?: boolean; sideSlot?: HTMLElement | null } = {}) {
  const onMove = vi.fn();
  const onBatch = vi.fn();
  const r = render(
    <FfScreen
      input={inputFor(opts.view ?? FF_VIEW, opts.moves ?? FF_MOVES, opts.playerId === undefined ? 'p1' : opts.playerId)}
      yourTurn={opts.yourTurn ?? true}
      busy={false}
      interactive={opts.interactive ?? true}
      onMove={onMove}
      onForm={vi.fn()}
      onBatch={onBatch}
      sideSlot={opts.sideSlot}
      nameFor={(pid) => (pid === 'p1' ? 'Ada' : 'AI')}
    />,
  );
  return { ...r, onMove, onBatch };
}

afterEach(() => cleanup());

describe('Fractured Fist screen', () => {
  it('draws both plates at the top with stamina and missteps from the view, and no opponent panels', () => {
    const { container } = draw();
    expect(screen.getByLabelText('You: stamina 6 of 7; missteps 3 of 10')).toBeTruthy();
    expect(screen.getByLabelText('Opponent: stamina 7 of 7; missteps 3 of 10')).toBeTruthy();
    // You on the left, facing the opponent on the right.
    const plates = [...container.querySelectorAll('.ff-plate')];
    expect(plates.map((p) => p.className)).toEqual(['ff-plate left active', 'ff-plate right']);
    // Seven blocks each, what is left lit.
    expect(plates[0]!.querySelectorAll('.ff-blocks .zk-track-space')).toHaveLength(7);
    expect(plates[0]!.querySelectorAll('.ff-blocks .zk-track-space.filled')).toHaveLength(6);
    expect(plates[1]!.querySelectorAll('.ff-blocks .zk-track-space.filled')).toHaveLength(7);
    // The opponent's public counts sit by their name; their discard is still drawn.
    expect(plates[1]!.textContent).toContain('Hand 5');
    expect(plates[1]!.textContent).toContain('Deck 9');
    expect(plates[1]!.textContent).toContain('Discard 1');
    expect(plates[1]!.querySelector('[data-flip-id="p:p2:discard"]')).not.toBeNull();
    expect(container.querySelector('.zk-tableau')).toBeNull();
    // Your hand, deck and discard are the bench, under the play column.
    expect(container.querySelector('.ff-bench [data-flip-id="p:p1:hand"]')).not.toBeNull();
  });

  it('shows the strike gutter as queued, without working out what gets through', () => {
    draw();
    expect(screen.getByLabelText('You hit Opponent: 1 damage against 1 defense')).toBeTruthy();
    expect(screen.getByLabelText('Opponent hits you: 0 damage against 0 defense')).toBeTruthy();
  });

  it('a tap on a lit card sends the move the engine listed; an unlit card sends nothing', () => {
    const { container, onMove } = draw();
    const lit = [...container.querySelectorAll('.ff-hand .zk-lit')];
    expect(lit).toHaveLength(1);
    fireEvent.click(lit[0]!);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![0].move_id).toBe('play-2-quicken');
    const unlit = container.querySelector('.ff-hand .zk-card:not(.zk-lit)')!;
    fireEvent.click(unlit);
    expect(onMove).toHaveBeenCalledTimes(1);
  });

  it('the action bar holds the listed moves that move the turn, and the counters for this step', () => {
    const { onMove, container } = draw();
    expect(container.querySelector('.ff-counters')!.textContent).toBe('1Actions');
    fireEvent.click(screen.getByRole('button', { name: 'Advance to Channel' }));
    expect(onMove.mock.calls[0]![0].move_id).toBe('advance-phase');
    // End turn is not listed here, so there is no button for it.
    expect(screen.queryByRole('button', { name: 'End turn' })).toBeNull();
  });

  it('"Play all resources" hands the table one tap per listed play, and sends nothing itself', () => {
    const view = { ...FF_VIEW, phase: 'channel' };
    const moves: LegalMove[] = [
      { move_id: 'play-0-focus', description: 'Play Focus', move: { type: 'play_card', card_id: 'focus', hand_index: 0 } },
      { move_id: 'play-4-focus', description: 'Play Focus', move: { type: 'play_card', card_id: 'focus', hand_index: 4 } },
      { move_id: 'end', description: 'End turn', move: { type: 'end_turn' } },
    ];
    const { onMove, onBatch } = draw({ view, moves });
    fireEvent.click(screen.getByRole('button', { name: /Play all resources/ }));
    expect(onMove).not.toHaveBeenCalled();
    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch.mock.calls[0]![0]).toHaveLength(2);
  });

  it('puts the supply in the side column when the table gives one, and on the board when not', () => {
    const slot = document.createElement('div');
    document.body.appendChild(slot);
    const { container } = draw({ sideSlot: slot });
    expect(slot.querySelector('.ff-supply [data-flip-id="p:p1:supply:attack"]')).not.toBeNull();
    expect(container.querySelector('.ff-supply')).toBeNull();
    cleanup();
    slot.remove();
    const inline = draw();
    expect(inline.container.querySelector('.ff-supply')).not.toBeNull();
  });

  it('a watcher sees both seats by name, can press nothing, and has no action bar', () => {
    const publicView = { ...FF_VIEW, players: { p1: { ...FF_VIEW.players.p1, hand: undefined }, p2: FF_VIEW.players.p2 } };
    const { container, onMove } = draw({ view: publicView, moves: [], playerId: null, yourTurn: false, interactive: false });
    expect(screen.getByLabelText('Ada: stamina 6 of 7; missteps 3 of 10')).toBeTruthy();
    expect(screen.getByLabelText('AI: stamina 7 of 7; missteps 3 of 10')).toBeTruthy();
    expect(container.querySelector('.ff-actionbar')).toBeNull();
    expect(container.querySelector('.ff-bench')).toBeNull();
    expect(container.querySelectorAll('.zk-lit')).toHaveLength(0);
    for (const c of container.querySelectorAll('.zk-card')) fireEvent.click(c);
    expect(onMove).not.toHaveBeenCalled();
  });
});
