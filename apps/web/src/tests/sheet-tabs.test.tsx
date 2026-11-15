// The sheet's focus trap with a roving tab stop inside it (the Adventurer
// Olympics adventurer sheet's tabs): a control the page has taken out of the
// Tab order (tabindex="-1") is not a stop for the trap either, so Tab off the
// last real stop comes back to the first, and Shift+Tab off the first goes to
// the last real stop, never to a tab that is not selected.

import { describe, expect, it, afterEach, beforeAll, afterAll } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Sheet } from '@zekel/glue-kit';

afterEach(cleanup);
// jsdom lays nothing out, so every offsetParent is null and the trap would
// take every control for hidden; in a browser a shown control has one.
const parentDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');
beforeAll(() => { Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return document.body; } }); });
afterAll(() => { if (parentDesc) Object.defineProperty(HTMLElement.prototype, 'offsetParent', parentDesc); });

function Tabs() {
  return (
    <Sheet title="Your adventurer" onClose={() => {}}>
      <div role="tablist" aria-label="Your adventurer">
        <button role="tab" aria-selected="false" tabIndex={-1}>You</button>
        <button role="tab" aria-selected="true" tabIndex={0}>Everyone</button>
        <button role="tab" aria-selected="false" tabIndex={-1}>Quests</button>
      </div>
    </Sheet>
  );
}

describe('a sheet with a roving tab stop', () => {
  it('Tab from the selected tab wraps to Close; Shift+Tab from Close goes to the selected tab', async () => {
    render(<Tabs />);
    const sheet = screen.getByRole('dialog', { name: 'Your adventurer' });
    const close = screen.getByRole('button', { name: 'Close' });
    const selected = screen.getByRole('tab', { name: 'Everyone' });

    // Focus starts on the first real stop, not on a tab out of the Tab order.
    expect(document.activeElement).toBe(selected);

    selected.focus();
    await act(async () => { fireEvent.keyDown(sheet, { key: 'Tab' }); });
    expect(document.activeElement).toBe(close);

    await act(async () => { fireEvent.keyDown(sheet, { key: 'Tab', shiftKey: true }); });
    expect(document.activeElement).toBe(selected);
  });
});
