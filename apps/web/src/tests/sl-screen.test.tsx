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

describe('the hand', () => {
  const LEGAL: LegalMove[] = [
    { move_id: 'r1', description: 'Play red: move knight and take the red action.', move: { type: 'play_intel', cardId: 'c1', unit: 'knight', viaRoad: false, takeAction: true } },
    { move_id: 'b1', description: 'Play double blue (acts twice): move ambassador only (no action).', move: { type: 'play_intel', cardId: 'c2', unit: 'ambassador', viaRoad: false, takeAction: false } },
    { move_id: 't1', description: 'Discard 4 Intel to gain one purple Intel.', move: { type: 'discard_for_color', cardIds: ['c1', 'c2', 'c3', 'c4'], color: 'purple' } },
    { move_id: 't2', description: 'Discard 4 Intel to gain one red Intel.', move: { type: 'discard_for_color', cardIds: ['c1', 'c2', 'c3', 'c4'], color: 'red' } },
  ];

  it('draws each card as a named wrapper: the action, who it helps, ×2 on a double, the treat’s picture', () => {
    render(<SlScreen {...slProps({ legalMoves: LEGAL })} />);
    const hand = screen.getByRole('region', { name: 'Your hand' });
    const red = within(hand).getByRole('button', { name: 'Red card: Battle' });
    expect(red.textContent).toContain('Best with your Knight');
    const blue = within(hand).getByRole('button', { name: 'Blue double card: Intel' });
    expect(blue.textContent).toContain('×2');
    expect(blue.textContent).toContain('Twice, same piece');
    const treat = within(hand).getByRole('button', { name: 'Gummy Bear treat card' });
    expect(treat.querySelector('img')!.getAttribute('src')).toBe('/art/sweetlands/treat-jellybean-2.png');
    expect(within(hand).getByText('Deck 52')).toBeTruthy();
    expect(within(hand).getByText('Discard 13')).toBeTruthy();
    expect(within(hand).getByText(/Blue Intel token/)).toBeTruthy();
  });

  it('lifts a picked card and sends nothing; a card the engine lists no move for cannot be picked', () => {
    const props = slProps({ legalMoves: LEGAL });
    render(<SlScreen {...props} />);
    const red = screen.getByRole('button', { name: 'Red card: Battle' });
    fireEvent.click(red);
    expect(red.getAttribute('aria-pressed')).toBe('true');
    expect(red.classList.contains('picked')).toBe(true);
    fireEvent.click(red);
    expect(red.getAttribute('aria-pressed')).toBe('false');
    expect((screen.getByRole('button', { name: 'Green card: Free play' }) as HTMLButtonElement).disabled).toBe(true);
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('names the trade-in from the engine’s own move: how many cards, and only when it is listed', () => {
    const { unmount } = render(<SlScreen {...slProps({ legalMoves: LEGAL })} />);
    expect(screen.getByRole('button', { name: 'Trade 4 cards for any color' })).toBeTruthy();
    unmount();
    render(<SlScreen {...slProps({ legalMoves: LEGAL.slice(0, 2) })} />);
    expect(screen.queryByRole('button', { name: /^Trade/ })).toBeNull();
  });

  it('trades in only the cards and color the player picks, as the engine’s listed template', () => {
    const props = slProps({ legalMoves: LEGAL });
    render(<SlScreen {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Trade 4 cards for any color' }));
    fireEvent.click(screen.getByRole('button', { name: /Red · Battle/ }));
    const form = screen.getByRole('dialog', { name: 'Discard 4 Intel for Red' });
    const boxes = within(form).getAllByRole('checkbox');
    expect(boxes.every((b) => !(b as HTMLInputElement).checked)).toBe(true);
    for (const b of boxes) fireEvent.click(b);
    fireEvent.click(within(form).getByRole('button', { name: 'Send' }));
    expect(props.onForm).toHaveBeenCalledTimes(1);
    const [template, move] = (props.onForm as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(template.move_id).toBe('t2');
    expect(move).toEqual({ type: 'discard_for_color', cardIds: ['c1', 'c2', 'c3', 'c4'], color: 'red' });
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('dims the rest of the hand once the card is played', () => {
    render(<SlScreen {...slProps({ view: { ...SL_SCREEN_VIEW, your_turn_step: 'influence' } })} />);
    expect(screen.getByRole('button', { name: 'Red card: Battle' }).classList.contains('dim')).toBe(true);
  });

  it('shows the secret goal in the engine’s words', () => {
    render(<SlScreen {...slProps({ reference: slReference({ secret_objectives: [{ id: 'defeat_knight', description: 'Defeat a knight in battle.' }] }) })} />);
    expect(screen.getByText('Defeat a knight in battle.')).toBeTruthy();
  });
});
