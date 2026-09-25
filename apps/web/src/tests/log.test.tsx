// The table's log: when the engine marks its key entries, one short line per
// key event, newest first, each opening to the engine's full sentences for
// everything that led up to it; a line about you reads as yours, and a loss
// of yours stands out. A game without marked entries keeps one line per event.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { LogLine } from '@universe/shared';
import { Log } from '../table/parts';
import { ev } from './fixtures';

afterEach(cleanup);

const line = (seq: number, summary: string, more: Partial<LogLine> = {}): LogLine =>
  ({ seq, round: 1, category: 'x', actor: null, summary, ...more });

describe('Log', () => {
  const events = [
    ev(1, 'one', { log: [
      line(1, 'The Covenant commits 2 collectors: Surf on C4 (water); Surf on C5 (water)', { category: 'payment' }),
      line(2, 'The Covenant builds Subject', { category: 'build', headline: 'The Covenant recruited a Subject', subject: 'p1', subjectHeadline: 'You recruited a Subject' }),
    ] }),
    ev(2, 'two', { log: [
      line(3, "The Ledger's base at C4 is destroyed", { round: 2, category: 'destroyed', headline: "The Covenant's base at C4 was destroyed", subject: 'p1', subjectHeadline: 'Your base at C4 was destroyed!', loss: true }),
      line(4, 'The Ledger places an action card face down', { round: 2, category: 'planning' }),
    ] }),
  ];

  it('shows the key lines newest first, in your words when they are about you', () => {
    render(<Log events={events} currentSeq={2} me="p1" />);
    const items = screen.getAllByRole('button').map((b) => b.textContent);
    expect(items).toEqual(['1 more line', 'Your base at C4 was destroyed!', 'You recruited a Subject']);
    const loss = screen.getByRole('button', { name: 'Your base at C4 was destroyed!' }).closest('li')!;
    expect(loss.classList.contains('loss')).toBe(true);
    expect(screen.getByText('Round 2')).toBeTruthy();
  });

  it('reads in the third person for anyone else', () => {
    render(<Log events={events} currentSeq={2} me="p2" />);
    expect(screen.getByRole('button', { name: 'The Covenant recruited a Subject' })).toBeTruthy();
    const loss = screen.getByRole('button', { name: "The Covenant's base at C4 was destroyed" }).closest('li')!;
    expect(loss.classList.contains('loss')).toBe(false);
  });

  it('opens a line to the full sentences that led up to it, the spend included', () => {
    render(<Log events={events} currentSeq={2} me="p1" />);
    const buy = screen.getByRole('button', { name: 'You recruited a Subject' });
    expect(buy.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(buy);
    const detail = within(buy.closest('li')!).getByRole('list');
    expect(detail.textContent).toContain('Surf on C4 (water)');
    expect(detail.textContent).toContain('The Covenant builds Subject');
  });

  it('keeps one line per event for a game whose engine marks no key entries', () => {
    render(<Log events={[ev(1, 'Seat 1 plays a card.'), ev(2, 'Seat 2 passes.')]} currentSeq={2} />);
    expect(screen.getByText('Seat 2 passes.')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
