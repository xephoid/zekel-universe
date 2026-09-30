// The map primitive's hex mode (MapData.hex): nodes are drawn on their hex,
// a tap on a lit hex reports that hex, ghosts and the picked hex are marked,
// and pieces keep one flip id from hex to hex so a move slides them.

import { describe, expect, it, afterEach, beforeAll, afterAll } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Map as MapPart } from '@universe/primitives';
import type { MapData, SelectEvent } from '@universe/primitives';

afterEach(cleanup);

// jsdom lays nothing out; give every element a size so the board can scale.
const widthDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
const heightDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 });
});
afterAll(() => {
  if (widthDesc) Object.defineProperty(HTMLElement.prototype, 'clientWidth', widthDesc);
  if (heightDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', heightDesc);
});

const board = (extra: Partial<MapData> = {}): MapData => ({
  hex: { orientation: 'flat' },
  fill: { minHeight: 100 },
  nodes: [
    { id: 'c', label: 'Centre', x: 0, y: 0, hex: { q: 0, r: 0 } },
    { id: 'se', label: 'South-east', x: 0, y: 0, hex: { q: 1, r: 0 }, pieces: [{ label: 'standee:p1', artUrl: 'data:,x' }] },
    { id: 'n', label: 'North', x: 0, y: 0, hex: { q: 0, r: -1 } },
    { id: 'slot', label: 'A slot', x: 0, y: 0, hex: { q: 1, r: 2 }, ghost: true },
  ],
  ...extra,
});

const hexOf = (label: string) => screen.getByLabelText(label);

describe('a hex board', () => {
  it('draws each node on its hex: neighbours sit one hex apart', () => {
    render(<MapPart id="m" data={board()} />);
    const c = hexOf('Centre'), se = hexOf('South-east'), n = hexOf('North');
    const pos = (el: HTMLElement) => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height) });
    const pc = pos(c), pse = pos(se), pn = pos(n);
    const s = pc.w / 2;
    expect(pc.h).toBeCloseTo(Math.sqrt(3) * s);
    // flat-topped: the south-east neighbour is 1.5 radii right and half a hex down
    expect(pse.x - pc.x).toBeCloseTo(1.5 * s);
    expect(pse.y - pc.y).toBeCloseTo((Math.sqrt(3) / 2) * s);
    // the north neighbour is one hex height straight up
    expect(pn.x).toBeCloseTo(pc.x);
    expect(pc.y - pn.y).toBeCloseTo(Math.sqrt(3) * s);
  });

  it('a tap on a lit hex reports it; an unlit hex does nothing', () => {
    const got: SelectEvent[] = [];
    render(<MapPart id="m" data={board()} lit={['slot', 'n']} onSelect={(e) => got.push(e)} />);
    fireEvent.click(hexOf('A slot'));
    fireEvent.click(hexOf('Centre'));
    fireEvent.keyDown(hexOf('North'), { key: 'Enter' });
    expect(got.map((e) => e.id)).toEqual(['slot', 'n']);
  });

  it('marks ghosts and the picked hex', () => {
    const data = board();
    data.nodes[3] = { ...data.nodes[3]!, selected: true };
    render(<MapPart id="m" data={data} />);
    expect(hexOf('A slot').className).toMatch(/ghost/);
    expect(hexOf('A slot').className).toMatch(/selected/);
    expect(hexOf('Centre').className).not.toMatch(/ghost/);
  });

  it('a piece keeps its flip id wherever it stands, and a new hex says where it flies from', () => {
    const data = board();
    data.nodes[2] = { ...data.nodes[2]!, arriveFrom: 'stack' };
    const { container, rerender } = render(<MapPart id="m" data={data} />);
    expect(container.querySelectorAll('[data-flip-id="m:piece:standee:p1"]')).toHaveLength(1);
    expect(hexOf('North').getAttribute('data-flip-from')).toBe('stack');
    // the standee steps to the north hex: the same piece, somewhere else
    const moved = board();
    moved.nodes[1] = { ...moved.nodes[1]!, pieces: [] };
    moved.nodes[2] = { ...moved.nodes[2]!, pieces: [{ label: 'standee:p1', artUrl: 'data:,x' }] };
    rerender(<MapPart id="m" data={moved} />);
    expect(container.querySelectorAll('[data-flip-id="m:piece:standee:p1"]')).toHaveLength(1);
  });

  it('a board without hex coordinates is still the plain map', () => {
    const { container } = render(<MapPart id="m" data={{ nodes: [{ id: 'a', label: 'A', x: 50, y: 50 }] }} />);
    expect(container.querySelector('.zk-hexmap')).toBeNull();
    expect(container.querySelector('.zk-map-node')).not.toBeNull();
  });
});
