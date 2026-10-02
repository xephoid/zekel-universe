// The map primitive's station mode (MapData.nodeShape 'station'), the
// Cybernoir subway map: the ring is the only thing a tap can land on, the
// lines are drawn for the eye and hidden from a reader, each mark becomes a
// class the theme draws, and the legend says what the lines are not.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Map as MapPart } from '@universe/primitives';
import type { MapData, SelectEvent } from '@universe/primitives';

afterEach(cleanup);

const board = (extra: Partial<MapData> = {}): MapData => ({
  nodeShape: 'station',
  fill: { minHeight: 200 },
  nodes: [
    { id: 'a', label: 'Alpha', x: 10, y: 20, colorKey: 'red', labelSide: 'above', meter: { value: 2, max: 3 }, glow: true, describedAs: 'Alpha Street, still possible' },
    { id: 'b', label: 'Beta', x: 50, y: 60, colorKey: 'red', labelSide: 'below', mark: 'diamond', markColorKey: 'played', badges: ['played'] },
    { id: 'c', label: 'Gamma', x: 80, y: 40, colorKey: 'blue', crossed: true },
    { id: 'd', label: 'Delta', x: 90, y: 80, colorKey: 'blue', dim: true, mark: 'frame', markColorKey: 'mine' },
  ],
  areas: [{ key: 'west', label: 'West', note: 'left side', y: 0, height: 100, x: 0, width: 45 }],
  lines: [{ key: 'red', colorKey: 'red', points: [{ x: 0, y: 20 }, { x: 10, y: 20 }, { x: 50, y: 60 }] }],
  legend: [{ colorKey: 'red', label: 'Red line' }, { colorKey: 'played', label: 'Played', shape: 'diamond' }],
  legendNote: 'Nobody travels on the lines.',
  ...extra,
});

describe('station map', () => {
  it('draws stations with their marks, and the lines as decoration nobody can tap', () => {
    const { container } = render(<MapPart id="m" data={board()} />);
    const stations = [...container.querySelectorAll('.zk-station')];
    expect(stations.map((s) => s.className)).toEqual([
      'zk-station above glow',
      'zk-station below mark-diamond',
      'zk-station above crossed',
      'zk-station above dim mark-frame',
    ]);
    expect(container.querySelector('.zk-station-diamond')).not.toBeNull();
    expect(container.querySelector('.zk-station-frame')).not.toBeNull();
    expect(container.querySelectorAll('.zk-station-pip.on')).toHaveLength(2);
    // The lines: one SVG, hidden from a reader, no button anywhere inside it.
    const svg = container.querySelector('svg.zk-station-lines')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('polyline')).toHaveLength(1);
    expect(svg.querySelector('[role="button"]')).toBeNull();
    // A station says its state through its marks; the text badges are not drawn.
    expect(container.querySelector('.zk-card-badge')).toBeNull();
    // The column area and its name.
    expect(screen.getByText('West')).toBeTruthy();
    expect(screen.getByText('left side')).toBeTruthy();
    // The legend says what the lines are not.
    expect(screen.getByText('Nobody travels on the lines.')).toBeTruthy();
  });

  it('reports a tap on a lit ring, and lets every ring be looked at when the board is inspectable', () => {
    const seen: SelectEvent[] = [];
    const { container, rerender } = render(<MapPart id="m" data={board()} lit={['b']} onSelect={(e) => seen.push(e)} />);
    const rings = [...container.querySelectorAll('.zk-station-ring')];
    expect(rings.filter((r) => r.getAttribute('role') === 'button')).toHaveLength(1);
    fireEvent.click(rings[1]!);
    expect(seen).toEqual([{ component: 'map', id: 'b', label: 'Beta' }]);
    // What a reader hears is the full description.
    expect(rings[0]!.getAttribute('aria-label')).toBe('Alpha Street, still possible');

    rerender(<MapPart id="m" data={board({ inspectable: true })} lit={[]} onSelect={(e) => seen.push(e)} />);
    expect(container.querySelectorAll('.zk-station-ring[role="button"]')).toHaveLength(4);
  });
});
