// How a hand behaves as it grows (docs/design/Cybernoir Big Hands.dc.html).
// Up to seven nothing overlaps; from eight the fan tightens but never past a
// thumb; past eleven it folds into stacks on what the cards say they stack
// with. Folding never hides a move, and Spread lays the whole hand out.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CardZone, fanOverlap } from '@universe/primitives';
import type { CardData } from '@universe/primitives';

afterEach(cleanup);

const CARD_W = 96;
const person = (i: number, group: string): CardData => ({ id: `c${i}`, label: `Card ${i}`, groupKey: group });
const hand = (n: number, groups = ['red', 'blue']): CardData[] =>
  Array.from({ length: n }, (_, i) => person(i, groups[i % groups.length]!));

describe('a hand as it grows', () => {
  it('overlaps nothing up to seven, tightens after, and never past a thumb', () => {
    for (const n of [1, 4, 7]) expect(fanOverlap(n, CARD_W)).toBe(0);
    expect(fanOverlap(8, CARD_W)).toBe(36);
    // By eleven the thumb floor is already what binds, not the taper.
    expect(fanOverlap(11, CARD_W)).toBe(52);
    // 44px is the floor for any exposed strip, however many cards there are.
    for (const n of [12, 16, 40]) expect(CARD_W - fanOverlap(n, CARD_W)).toBeGreaterThanOrEqual(44);
  });

  it('draws every card while the fan still holds them', () => {
    render(<CardZone id="h" data={{ label: 'Hand', mode: 'fan', cards: hand(7) }} />);
    expect(screen.getAllByText(/^Card \d/)).toHaveLength(7);
    // Nothing to spread yet: the fan is not overlapping.
    expect(screen.queryByRole('button', { name: 'Spread' })).toBeNull();
  });

  it('folds past eleven into stacks that say what they hold', () => {
    render(<CardZone id="h" data={{ label: 'Hand', mode: 'fan', cards: hand(13), groupNames: { red: 'Crimson Clan', blue: 'Iceden Collective' } }} />);
    // The cards are not all on screen; the stacks are.
    expect(screen.queryByText('Card 0')).toBeNull();
    expect(screen.getByText('Crimson Clan')).toBeTruthy();
    expect(screen.getByText('Iceden Collective')).toBeTruthy();
    // Opening a stack fans that stack alone.
    fireEvent.click(screen.getByText('Crimson Clan').closest('button')!);
    expect(screen.getByText('Card 0')).toBeTruthy();
    expect(screen.queryByText('Card 1')).toBeNull();
  });

  it('lights a stack that holds a card the engine is offering, and the card inside it', () => {
    render(<CardZone id="h" data={{ label: 'Hand', mode: 'fan', cards: hand(13) }} lit={['c1']} onSelect={() => {}} />);
    const blue = screen.getByText('blue').closest('button')!;
    const red = screen.getByText('red').closest('button')!;
    expect(blue.className).toContain('zk-lit');
    expect(red.className).not.toContain('zk-lit');
    fireEvent.click(blue);
    const opened = screen.getByText('Card 1').closest('.zk-card')!;
    expect(opened.className).toContain('zk-lit');
  });

  it('never folds a hand whose cards do not say what they stack with', () => {
    const plain = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, label: `Card ${i}` }));
    render(<CardZone id="h" data={{ label: 'Hand', mode: 'fan', cards: plain }} />);
    expect(screen.getAllByText(/^Card \d/)).toHaveLength(13);
  });

  it('spreads the whole hand out at once, and fans it back', () => {
    render(<CardZone id="h" data={{ label: 'Hand', mode: 'fan', cards: hand(13) }} />);
    expect(screen.queryByText('Card 0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Spread' }));
    // Every card at once, and every one of them reachable.
    expect(screen.getAllByText(/^Card \d/)).toHaveLength(13);
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }));
    expect(screen.queryByText('Card 0')).toBeNull();
  });

  it('sends nothing on its own: a stack opens, it does not play', () => {
    const picked: string[] = [];
    render(<CardZone id="h" data={{ label: 'Hand', mode: 'fan', cards: hand(13) }} lit={['c1']} onSelect={(e) => picked.push(e.id)} />);
    fireEvent.click(screen.getByText('blue').closest('button')!);
    expect(picked).toEqual([]);
    fireEvent.click(within(screen.getByText('Card 1').closest('.zk-card')!).getByText('Card 1'));
    expect(picked).toEqual(['c1']);
  });
});
