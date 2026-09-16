// Primitives gallery: every primitive in its resting and lit states, light
// and dark, with reduced motion on and off, and buttons that move cards
// between zones, drop tokens and roll dice so the motion can be checked by
// eye.

import { useState } from 'react';
import { Bag, Card, CardZone, Die, FlipRoot, Grid, Map, Pool, Tableau, Track, paletteVars } from '@universe/primitives';
import type { CardData } from '@universe/primitives';
import { Nav } from './Nav';

const PALETTE = { red: '#d63031', gold: '#c9a227', green: '#3e7c4f', blue: '#3f7cc9', you: '#3E7C4F', them: '#b4452f', wall: '#2b2620', hive: '#7a4a12' };

const DECK: CardData[] = ['Attack', 'Block', 'React', 'Quicken', 'Center', 'Distract', 'Assess'].map((label, i) => ({
  id: `g:card:${i}`, label, subtitle: 'Technique', badges: [`cost ${i + 2}`], colorKey: i % 2 ? 'blue' : 'red',
}));

export function GalleryPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>((document.documentElement.dataset['theme'] as 'light' | 'dark') ?? 'light');
  const [reduced, setReduced] = useState(false);
  const [hand, setHand] = useState<CardData[]>(DECK.slice(0, 3));
  const [played, setPlayed] = useState<CardData[]>([]);
  const [deckCount, setDeckCount] = useState(DECK.length - 3);
  const [tokens, setTokens] = useState(3);
  const [dice, setDice] = useState<[number, number]>([3, 5]);
  const [rollKey, setRollKey] = useState(0);
  const [pawnAt, setPawnAt] = useState(2);
  const [pieceAt, setPieceAt] = useState({ x: 1, y: 1 });
  const [unitAt, setUnitAt] = useState('a');
  const [faceDown, setFaceDown] = useState(false);
  const [tick, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const setThemeAndStore = (t: 'light' | 'dark') => {
    setTheme(t);
    document.documentElement.dataset['theme'] = t;
    try { localStorage.setItem('universe:theme', t); } catch { /* ignore */ }
  };

  const play = () => {
    const [first, ...rest] = hand;
    if (!first) return;
    setHand(rest); setPlayed([...played, first]); bump();
  };
  const draw = () => {
    const next = DECK.find((c) => !hand.some((h) => h.id === c.id) && !played.some((p) => p.id === c.id));
    if (!next || deckCount <= 0) return;
    setHand([...hand, next]); setDeckCount(deckCount - 1); bump();
  };
  const sweep = () => { setPlayed([]); bump(); };
  const roll = () => { setDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]); setRollKey(rollKey + 1); bump(); };

  return (
    <div>
      <Nav />
      <div className="page gallery" style={{ ...paletteVars(PALETTE) }}>
        <h1>Primitives gallery</h1>
        <p className="muted">Every primitive, its lit state, and its motion. Check by eye in both themes with reduced motion on and off.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secondary" onClick={() => setThemeAndStore(theme === 'light' ? 'dark' : 'light')}>Theme: {theme}</button>
          <button className={`btn secondary${reduced ? ' active' : ''}`} onClick={() => setReduced(!reduced)}>Reduced motion: {reduced ? 'on' : 'off'}</button>
        </div>

        <FlipRoot viewKey={tick} reducedMotion={reduced}>
          <section>
            <h2>Card and card zones</h2>
            <p className="muted">Cards leave the deck and arrive in the hand; a played card flies from the hand to the played row; a sweep sends the row away.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <button className="btn secondary small" onClick={draw}>Draw a card</button>
              <button className="btn secondary small" onClick={play}>Play the first card</button>
              <button className="btn secondary small" onClick={sweep}>Sweep the played row</button>
              <button className="btn secondary small" onClick={() => { setFaceDown(!faceDown); bump(); }}>Flip the lone card</button>
            </div>
            <div className="row">
              <CardZone id="g:deck" data={{ label: 'Deck', mode: 'pile', countOnly: deckCount }} />
              <CardZone id="g:hand" data={{ label: 'Hand (fan)', mode: 'fan', cards: hand }} lit={hand[0] ? [hand[0].id!] : []} onSelect={play} arriveFrom="g:deck" />
              <CardZone id="g:played" data={{ label: 'Played (row)', mode: 'row', cards: played }} arriveFrom="g:hand" />
              <CardZone id="g:discard" data={{ label: 'Discard (pile)', mode: 'pile', cards: [{ id: 'g:disc:1', label: 'Misstep', colorKey: 'gold' }, { id: 'g:disc:2', label: 'Focus', colorKey: 'green' }] }} />
              <Card id="g:lone" data={{ id: 'g:lone', label: 'Devastating Blow', subtitle: '+1 Draw, +3 Damage', badges: ['cost 8'], colorKey: 'red', face: faceDown ? 'down' : 'up' }} />
              <Card id="g:tapped" data={{ id: 'g:tapped', label: 'Tapped', rotation: 90, colorKey: 'blue' }} />
            </div>
          </section>

          <section>
            <h2>Tableau</h2>
            <div className="row">
              <Tableau id="g:t1" data={{ label: 'You', owner: 'you', active: true, stats: [{ label: 'Stamina', value: 5, max: 7 }, { label: 'Spirit', value: 2 }] }}>
                <CardZone id="g:t1:hand" data={{ label: 'Nested hand', mode: 'fan', cards: DECK.slice(4, 6).map((c) => ({ ...c, id: `${c.id}:nested` })) }} />
              </Tableau>
              <Tableau id="g:t2" data={{ label: 'Opponent', owner: 'them', stats: [{ label: 'Stamina', value: 7, max: 7 }, { label: 'Missteps', value: 3, max: 10 }] }} />
            </div>
          </section>

          <section>
            <h2>Bag</h2>
            <div className="row">
              <Bag id="g:bag" data={{ label: 'Luck bag', owner: 'red', contents: [{ label: 'hit', count: 4, colorKey: 'red' }, { label: 'miss', count: 2, colorKey: 'blue' }], revealRow: [{ id: 'g:bag:p1', label: 'hit', colorKey: 'red' }], status: 'drawing' }} lit={['g:bag']} onSelect={() => {}} />
              <Bag id="g:bag2" data={{ label: 'Hidden', count: 9, status: 'busted' }} />
            </div>
          </section>

          <section>
            <h2>Track</h2>
            <button className="btn secondary small" onClick={() => { setPawnAt((pawnAt + 1) % 10); bump(); }}>Advance the pawn</button>
            <Track id="g:track" data={{ label: 'Score', spaces: Array.from({ length: 10 }, (_, i) => ({ index: i, filled: i < 3, pieces: i === pawnAt ? [{ label: 'you', colorKey: 'you' }] : [] })), markers: [{ label: 'round', colorKey: 'gold', at: 6 }], cyclic: true }} lit={['g:track:4']} onSelect={() => {}} />
          </section>

          <section>
            <h2>Pool</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button className="btn secondary small" onClick={() => { setTokens(tokens + 1); bump(); }}>Gain a token</button>
              <button className="btn secondary small" onClick={() => { setTokens(Math.max(0, tokens - 1)); bump(); }}>Spend a token</button>
            </div>
            <Pool id="g:pool" data={{ label: 'Supply', items: [{ label: 'sugar', count: tokens, colorKey: 'gold' }, { label: 'influence', count: 2, colorKey: 'blue' }] }} lit={['g:pool:sugar']} onSelect={() => {}} />
          </section>

          <section>
            <h2>Grid</h2>
            <button className="btn secondary small" onClick={() => { setPieceAt({ x: (pieceAt.x + 1) % 5, y: (pieceAt.y + (pieceAt.x === 4 ? 1 : 0)) % 4 }); bump(); }}>Move the piece</button>
            <Grid id="g:grid" data={{ label: 'Ruin', extent: { minX: 0, minY: 0, maxX: 4, maxY: 3 }, cells: [{ x: 0, y: 0, terrain: 'wall' }, { x: 4, y: 3, terrain: 'wall' }, { x: pieceAt.x, y: pieceAt.y, pieces: [{ label: 'you', colorKey: 'you' }] }, { x: 3, y: 1, pieces: [{ label: 'raider', colorKey: 'them', badges: ['2'] }] }] }} lit={['g:grid:2,2']} onSelect={() => {}} />
          </section>

          <section>
            <h2>Map</h2>
            <button className="btn secondary small" onClick={() => { setUnitAt(unitAt === 'a' ? 'b' : unitAt === 'b' ? 'c' : 'a'); bump(); }}>Travel</button>
            <div style={{ maxWidth: 520 }}>
              <Map id="g:map" data={{ label: 'Regions', aspect: 55, nodes: [
                { id: 'a', label: 'Downtown', x: 20, y: 30, colorKey: 'blue', pieces: unitAt === 'a' ? [{ label: 'knight', colorKey: 'you' }] : [], roadsTo: ['b'] },
                { id: 'b', label: 'The Hive', x: 55, y: 60, colorKey: 'hive', pieces: unitAt === 'b' ? [{ label: 'knight', colorKey: 'you' }] : [], roadsTo: ['c'] },
                { id: 'c', label: 'Boonies', x: 82, y: 25, colorKey: 'green', size: 1.3, pieces: unitAt === 'c' ? [{ label: 'knight', colorKey: 'you' }] : [], badges: ['3'] },
              ] }} lit={['b']} onSelect={() => {}} />
            </div>
          </section>

          <section>
            <h2>Dice</h2>
            <button className="btn secondary small" onClick={roll}>Roll</button>
            <div className="dice-row" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
              <Die value={dice[0]} rollKey={rollKey} /><Die value={dice[1]} rollKey={rollKey} />
            </div>
          </section>
        </FlipRoot>
      </div>
    </div>
  );
}
