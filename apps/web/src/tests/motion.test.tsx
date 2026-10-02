// The motion root's origins: a new part flies from the first of its named
// origins that was on the table, a part marked data-flip-ghost flies as a
// copy over the table (as cards do), and a part with no origin drops in.

import { describe, expect, it, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { FlipRoot } from '@universe/primitives';

afterEach(cleanup);

// jsdom reports every document as hidden and lays nothing out; the root skips
// animation for a hidden document, so say it is visible, and give each part
// a place from its data-x attribute.
const hiddenDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
const rectDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect');
beforeAll(() => {
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => false });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const x = Number((this as HTMLElement).dataset?.x ?? 0);
    return { left: x, top: 0, width: 10, height: 10, right: x + 10, bottom: 10, x, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterAll(() => {
  if (hiddenDesc) Object.defineProperty(Document.prototype, 'hidden', hiddenDesc);
  if (rectDesc) Object.defineProperty(Element.prototype, 'getBoundingClientRect', rectDesc);
  vi.unstubAllGlobals();
});

const ghosts = (c: HTMLElement) => c.querySelectorAll('.zk-flights .zk-ghost');

describe('motion origins', () => {
  it('flies a new mark as a ghost from the first named origin that was on the table', () => {
    const { container, rerender } = render(
      <FlipRoot viewKey={1}><div className="zk-card" data-flip-id="hand:2:Tower Furnace" data-x="40" /></FlipRoot>,
    );
    // The card left the hand; the diamond names every place it could have been.
    rerender(
      <FlipRoot viewKey={2}>
        <span data-flip-id="map:mark:tower-furnace" data-flip-from="hand:0:Tower Furnace|hand:1:Tower Furnace|hand:2:Tower Furnace" data-flip-ghost="" data-x="400" />
      </FlipRoot>,
    );
    expect(ghosts(container)).toHaveLength(1);
    // It starts where the card was (40) relative to where it lands (400).
    expect((ghosts(container)[0] as HTMLElement).style.transform).toContain('translate(-360px');
  });

  it('slides a plain part in its own box, and drops one with no origin on the table', () => {
    const { container, rerender } = render(
      <FlipRoot viewKey={1}><div data-flip-id="a" data-x="0" /></FlipRoot>,
    );
    rerender(
      <FlipRoot viewKey={2}>
        <div data-flip-id="b" data-flip-from="nowhere|a" data-x="100" />
        <div data-flip-id="c" data-flip-from="nowhere" data-x="200" />
      </FlipRoot>,
    );
    expect(ghosts(container)).toHaveLength(0);
    const b = container.querySelector('[data-flip-id="b"]') as HTMLElement;
    const c = container.querySelector('[data-flip-id="c"]') as HTMLElement;
    expect(b.style.transform).toContain('translate(-100px');
    expect(c.style.animation).toContain('zk-drop');
  });
});
