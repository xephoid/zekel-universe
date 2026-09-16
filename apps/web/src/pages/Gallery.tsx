// Primitives gallery: every primitive in its resting/selected/lit states,
// light and dark, with a theme toggle. Checked by eye per the plan.

import { useEffect, useState } from 'react';
import { Card, CardZone, Tableau, Bag, Track, Pool, Grid, Map } from '@universe/primitives';

export function GalleryPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  const palette = { red: '#d63031', gold: '#fdcb6e', green: '#3e7c4f' };

  return (
    <div style={{ padding: 24 }}>
      <h1>Primitives gallery</h1>
      <button className="btn secondary" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Theme: {theme} → {theme === 'light' ? 'dark' : 'light'}
      </button>

      <h2>Card</h2>
      <div style={{ display: 'flex', gap: 10 }}>
        <Card data={{ id: 'g1', title: 'Attack', subtitle: 'TECHNIQUE · cost 4', colorKey: 'red' }} palette={palette} />
        <Card data={{ id: 'g2', title: 'Lit card' }} lit={['g2']} palette={palette} onSelect={() => {}} />
        <Card data={{ id: 'g3', title: 'back', faceDown: true, count: 10 }} palette={palette} />
      </div>

      <h2>Card zones</h2>
      <CardZone data={{ id: 'gz1', kind: 'fan', label: 'Hand', cards: [
        { id: 'c1', title: 'Focus' }, { id: 'c2', title: 'Momentum' }, { id: 'c3', title: 'Attack' },
      ] }} lit={['c2']} palette={palette} onSelect={() => {}} />
      <CardZone data={{ id: 'gz2', kind: 'row', label: 'Played', cards: [{ id: 'c4', title: 'Block' }] }} palette={palette} />
      <CardZone data={{ id: 'gz3', kind: 'stack', label: 'Deck (10)', cards: [{ id: 'c5', title: 'Deck', faceDown: true, count: 10 }] }} palette={palette} />

      <h2>Tableau</h2>
      <Tableau data={{ id: 'gt', label: 'You', colorKey: 'green', zones: [
        { id: 'gtz', kind: 'row', cards: [{ id: 'tc', title: 'In-zone card' }] },
      ] }} palette={palette} />

      <h2>Bag</h2>
      <div style={{ display: 'flex', gap: 10 }}>
        <Bag data={{ id: 'gb', count: 9, label: 'Luck bag' }} lit={['gb']} onSelect={() => {}} />
        <Bag data={{ id: 'gb2', count: 0, label: 'Empty' }} />
      </div>

      <h2>Track</h2>
      <Track data={{ id: 'gtr', label: 'Round', length: 10, markers: { gold: 3, green: 7 } }} palette={palette} />

      <h2>Pool</h2>
      <Pool data={{ id: 'gp', label: 'Supply', tokens: { red: 3, gold: 5, green: 8 } }} palette={palette} />

      <h2>Grid</h2>
      <Grid data={{ id: 'gg', width: 5, height: 4, cells: [
        { x: 1, y: 1, occupant: '1' }, { x: 3, y: 2, occupant: 'a', colorKey: 'red' },
      ] }} lit={['gg:2,2']} onSelect={() => {}} palette={palette} />

      <h2>Map</h2>
      <Map data={{ id: 'gm', regions: [
        { id: 'r1', label: 'Ring', x: 20, y: 30, colorKey: 'red', roadsTo: ['r2'] },
        { id: 'r2', label: 'Junction', x: 50, y: 50, colorKey: 'gold', occupant: 'you', roadsTo: ['r3'] },
        { id: 'r3', label: 'Castle', x: 75, y: 30, colorKey: 'green' },
      ] }} palette={palette} lit={['r3']} onSelect={() => {}} />
    </div>
  );
}
