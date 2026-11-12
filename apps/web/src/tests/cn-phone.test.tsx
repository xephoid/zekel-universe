// The phone parts Cybernoir's layout uses (build item 8): the map
// primitive's list view draws an overview, tabs and rows, and a card opens up
// close with the engine's moves. The glue's own phone layout is tested with
// the game, in zekel-games.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Map as MapPart } from '@zekel/primitives';
import type { MapData, SelectEvent } from '@zekel/primitives';
import type { TablePlan } from '@zekel/glue-kit';
import { CardUpClose, findCard } from '../table/parts';

afterEach(cleanup);

describe('station list view', () => {
  const data: MapData = {
    nodeShape: 'station', inspectable: true, listView: { first: 'b' },
    areas: [{ key: 'a', label: 'Alpha', y: 0, height: 100, x: 0, width: 50 }, { key: 'b', label: 'Beta', y: 0, height: 100, x: 50, width: 50 }],
    nodes: [
      { id: 'n1', label: 'One', x: 20, y: 20, area: 'a', note: 'Still possible', glow: true },
      { id: 'n2', label: 'Two', x: 70, y: 40, area: 'b', note: 'Canvassed', mark: 'diamond', code: 'OSU', faces: [{ label: 'Pat', artUrl: '/p.jpg' }] },
      { id: 'n3', label: 'Three', x: 80, y: 70, area: 'b', note: 'Ruled out', dim: true },
    ],
  };
  it('opens on the first tab, lists its stations, and a row is the station', () => {
    const seen: SelectEvent[] = [];
    const { container } = render(<MapPart id="m" data={data} onSelect={(e) => seen.push(e)} />);
    // The overview has every station and no names.
    expect(container.querySelectorAll('.overview .zk-station')).toHaveLength(3);
    expect(container.querySelector('.overview .zk-station-name')).toBeNull();
    const rows = () => [...container.querySelectorAll('.zk-station-row')];
    expect(rows().map((r) => r.querySelector('.zk-station-name')!.textContent)).toEqual(['Two', 'Three']);
    expect(rows()[0]!.querySelector('.zk-station-note')!.textContent).toBe('Canvassed');
    expect(rows()[0]!.querySelector('.zk-card-code')!.textContent).toBe('OSU');
    expect(rows()[1]!.className).toContain('dim');
    fireEvent.click(rows()[0]!);
    expect(seen).toEqual([{ component: 'map', id: 'n2', label: 'Two' }]);
    fireEvent.click(screen.getByRole('tab', { name: /Alpha/ }));
    expect(rows().map((r) => r.querySelector('.zk-station-name')!.textContent)).toEqual(['One']);
  });
});

describe('a card up close', () => {
  it('finds a card wherever the plan put it, and offers only the engine moves for it', () => {
    const plan: TablePlan = {
      board: [], bench: [{ kind: 'card-zone', id: 'z', data: { mode: 'row', cards: [{ id: 'c1', label: 'Wyrm', subtitle: 'Discard a Location.' }] } }],
      side: [], palette: {}, title: 't',
      points: { kind: 'tableau', id: 'case', data: { label: 'Case' }, children: [{ kind: 'card-zone', id: 'r', data: { mode: 'row', cards: [{ id: 'c2', label: 'Rust' }] } }] },
    };
    expect(findCard(plan, 'c1')!.label).toBe('Wyrm');
    expect(findCard(plan, 'c2')!.label).toBe('Rust');
    expect(findCard(plan, 'nope')).toBeNull();

    const picked: unknown[] = [];
    render(<CardUpClose card={findCard(plan, 'c1')!} lines={['Lives at The Junction']} disabled={false}
      options={[{ move_id: 'p', description: 'Play Wyrm (2 AP)', cost: '2 AP', move: { type: 'play' } }, { move_id: 'e', description: 'Add Wyrm to a Motive set', cost: 'free', move: { type: 'ev' } }]}
      onPick={(m) => picked.push(m.move_id)} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Wyrm' })).toBeTruthy();
    expect(screen.getByText('Lives at The Junction')).toBeTruthy();
    // The price is said once: not again when the engine's words already say it.
    expect(screen.getByRole('button', { name: 'Play Wyrm (2 AP)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add Wyrm to a Motive set/ }).textContent).toBe('Add Wyrm to a Motive set · free');
    fireEvent.click(screen.getByRole('button', { name: 'Play Wyrm (2 AP)' }));
    expect(picked).toEqual(['p']);
  });
});
