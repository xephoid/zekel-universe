// What happened that a seat must be told of: the engine names the seats on a
// log line; those seats get one dialog for everything new, in their own words,
// and it stays until they press OK. Nobody else sees it.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { LogLine } from '@universe/shared';
import { Notices } from '../table/parts';
import { ev } from './fixtures';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

const line = (seq: number, more: Partial<LogLine>): LogLine => ({ seq, round: 1, category: 'x', actor: null, summary: `line ${seq}`, ...more });

const events = [
  ev(1, 'one', { log: [line(1, { headline: 'The Covenant recruited a Subject' })] }),
  ev(2, 'two', { log: [
    line(2, { headline: "The Covenant's base at C4 was destroyed", subject: 'p1', subjectHeadline: 'Your base at C4 was destroyed!', loss: true, notify: ['p1'] }),
    line(3, { headline: 'The Ledger recruited an Infiltrator', subject: 'p2', subjectHeadline: 'You recruited an Infiltrator', notify: ['p1', 'p3'] }),
  ] }),
];

describe('Notices', () => {
  it('tells the named seats, in their own words, until they press OK', () => {
    const r = render(<Notices events={events} me="p1" storeKey="t1" />);
    const dialog = screen.getByRole('alertdialog', { name: 'What happened' });
    expect([...dialog.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Your base at C4 was destroyed!', 'The Ledger recruited an Infiltrator']);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    r.unmount();
    // Acknowledged stays acknowledged on this device.
    render(<Notices events={events} me="p1" storeKey="t1" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows nothing to a seat nobody named', () => {
    render(<Notices events={events} me="p2" storeKey="t2" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('comes back for something new after an OK', () => {
    const r = render(<Notices events={events} me="p1" storeKey="t3" />);
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    r.rerender(<Notices events={[...events, ev(3, 'three', { log: [line(4, { headline: 'Stalemate at C4: the attackers went back', notify: ['p1', 'p2'] })] })]} me="p1" storeKey="t3" />);
    expect(screen.getByRole('alertdialog').textContent).toContain('Stalemate at C4');
  });
});
