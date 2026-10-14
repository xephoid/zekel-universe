// The Sweetlands candy screen (glue/sl), drawn from a view in the engine's
// shape. What it shows comes from the view and the reference data; what it
// sends is only ever a move the engine listed.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { GameReferenceResponse } from '@universe/shared';
import { SlScreen } from '../glue/sl/SlScreen';
import type { GameScreenProps, GlueInput, LegalMove } from '../glue/types';

const loc = {
  start: (region: number) => ({ zone: 'start', region }),
  ring: (region: number, ringIndex: number) => ({ zone: 'ring', region, ringIndex }),
};

export const SL_SCREEN_VIEW = {
  game_id: 'sweetlands-imperium', phase: 'play', round: 4, active_player_id: 'p1', first_player_id: 'p1',
  taxes: { '1': 0, '2': 2, '3': 1, '4': 0 }, foe: { type: 'orc', defeated: false }, castle_occupant_id: null,
  intel_deck_count: 52, intel_discard_count: 13,
  random_treat_placement: { '1': 'cupcake', '2': 'gummy_bear', '3': 'ice_cream', '4': 'chocolate_bar' },
  players: [
    { player_id: 'p1', kind: 'human', faction: 'milkshake', faction_name: 'Arch Duchess of Milkshake', home_region: 1, points: 2, influence: 3, sugar_cubes: 4, intel_tokens: ['blue'], hand_count: 4,
      unit_locations: { leader: loc.ring(1, 2), knight: loc.ring(2, 3), ambassador: loc.ring(4, 1) } },
    { player_id: 'p2', kind: 'ai', faction: 'fudge', faction_name: 'General Fudge', home_region: 2, points: 5, influence: 4, sugar_cubes: 3, intel_tokens: [], hand_count: 1,
      unit_locations: { leader: loc.ring(2, 1), knight: loc.ring(2, 6), ambassador: loc.start(2) } },
  ],
  your_hand: [
    { card_id: 'c1', kind: 'single', color: 'red' },
    { card_id: 'c2', kind: 'double', color: 'blue' },
    { card_id: 'c3', kind: 'treat', treat: 'gummy_bear' },
    { card_id: 'c4', kind: 'single', color: 'green' },
  ],
  your_secret_objectives: ['defeat_knight'], your_turn_step: 'play',
};

export function slReference(extra: Record<string, unknown> = {}): GameReferenceResponse {
  return {
    gameId: 'sweetlands-imperium', rules: '', moveSchema: {}, optionsSchema: {},
    referenceData: { points_to_win: 5, foes: [{ type: 'dragon', dice: 5 }, { type: 'orc', dice: 3 }, { type: 'fiend', dice: 2 }], ...extra },
  } as GameReferenceResponse;
}

export function slProps(over: { view?: unknown; legalMoves?: LegalMove[]; reference?: GameReferenceResponse | null; playerId?: string | null } = {}, props: Partial<GameScreenProps> = {}): GameScreenProps {
  const input: GlueInput = {
    view: over.view ?? SL_SCREEN_VIEW, previous: null, legalMoves: over.legalMoves ?? [], unavailable: [],
    playerId: over.playerId === undefined ? 'p1' : over.playerId, reference: over.reference === undefined ? slReference() : over.reference,
    seq: 1, engineMove: null, actorPlayerId: null, memory: new Map(),
  } as GlueInput;
  return {
    input, yourTurn: true, busy: false, interactive: true,
    onMove: vi.fn(), onForm: vi.fn(), nameFor: (pid: string) => (pid === 'p2' ? 'AI (easy)' : 'Guest'),
    ...props,
  };
}

afterEach(cleanup);

describe('the players panel', () => {
  it('shows each seat: your card first with its turn pill, points to go, and every piece’s place', () => {
    render(<SlScreen {...slProps()} />);
    const panel = screen.getByLabelText('Players and their pieces');
    const cards = within(panel).getAllByRole('region');
    expect(cards).toHaveLength(2);
    const [mine, fudge] = cards;
    expect(within(mine!).getByText('You · Milkshake')).toBeTruthy();
    expect(within(mine!).getByText('Your turn')).toBeTruthy();
    expect(within(mine!).getByRole('img', { name: '2 of 5 points, 3 to go' })).toBeTruthy();
    expect(within(fudge!).getByText('AI')).toBeTruthy();
    expect(within(fudge!).getByRole('img', { name: '5 of 5 points, Winner!' })).toBeTruthy();
    // Where each piece is: the swatch and the land, the full place as a tooltip.
    const knight = within(mine!).getByRole('button', { name: /Knight/ });
    expect(knight.getAttribute('title')).toBe('Your Knight — green space · Fudge’s land');
    expect(within(fudge!).getByRole('button', { name: /Ambassador/ }).textContent).toContain('at home');
  });

  it('writes influence against the cap only when the engine’s reference data gives one', () => {
    const { unmount } = render(<SlScreen {...slProps()} />);
    expect(screen.getAllByText((_, el) => el?.textContent === '3 influence')).toHaveLength(1);
    unmount();
    render(<SlScreen {...slProps({ reference: slReference({ influence_cap: 5 }) })} />);
    expect(screen.getAllByText((_, el) => el?.textContent === '3/5 influence')).toHaveLength(1);
  });

  it('rings a piece on the board and its row together, and sends nothing', () => {
    const props = slProps();
    render(<SlScreen {...props} />);
    const row = screen.getAllByRole('button', { name: /Knight/ }).find((b) => b.classList.contains('sl-piece-row'))!;
    fireEvent.click(row);
    expect(row.getAttribute('aria-pressed')).toBe('true');
    const onBoard = screen.getByRole('button', { name: 'Your Knight — green space · Fudge’s land' });
    expect(onBoard.classList.contains('focused')).toBe(true);
    fireEvent.click(onBoard);
    expect(row.getAttribute('aria-pressed')).toBe('false');
    expect(props.onMove).not.toHaveBeenCalled();
  });
});
