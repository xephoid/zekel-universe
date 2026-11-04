// Development only: Warble Way Galaxy's icons (build item 2) and portraits
// (item 3) drawn in the hologram logbook theme, to compare with the icon
// rows on Main.dc.html and the holograms on Ruin.dc.html. The fixed meanings
// first at the card kinds' size, then every shape at the inline size, then
// the crew in gold at the travel card's ring size and the attackers in red
// at the ruin's. The route exists only in the dev server.

import '../glue/ww/ww.css';
import { ICON_FILES, Icon, MEANINGS, MeaningIcon, type IconName, type Meaning } from '../glue/ww/icons';
import { ATTACKERS, RACES, REDSHIRT, faceUrl } from '../glue/ww/faces';
import { Hologram } from '../glue/ww/holo';
import { Card, CardZone } from '@universe/primitives';
import { useEffect, useState } from 'react';
import type { GameReferenceResponse } from '@universe/shared';
import { deckIds, travelCard } from '../glue/ww/cards';
import { TravelCard, TravelCardBack } from '../glue/ww/TravelCard';

const KIND_COLOURS: Partial<Record<Meaning, string>> = {
  recruit: 'var(--ww-recruit)', being: 'var(--ww-recruit)', pirate: 'var(--ww-pirate)', attacker: 'var(--ww-pirate)',
  ruin: 'var(--ww-ruin)', hazard: 'var(--ww-hazard)', job: 'var(--ww-job)', dread: 'var(--ww-dread)', damage: 'var(--ww-redshirt)',
};

const HEADING = { font: '600 12px/1 var(--ww-sign)', letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ww-muted)', marginTop: 32 };

export function DevWwPage() {
  // The whole travel deck from the engine's reference data (item 4), so it
  // can be compared with Cards.dc.html; nothing is drawn until it arrives.
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/games/warble-way-galaxy/reference')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j: GameReferenceResponse) => setReference(j))
      .catch((e: Error) => setFailed(e.message));
  }, []);
  const deck = deckIds(reference).map((id) => travelCard(id, reference)).filter((f) => f !== null);
  return (
    <div className="table-shell ww-theme" style={{ minHeight: '100vh', padding: 24, fontFamily: 'var(--font-body)' }}>
      <h1 style={{ ...HEADING, fontSize: 15, fontWeight: 700, marginTop: 0 }}>Warble Way Galaxy · icons</h1>
      <h2 style={HEADING}>Fixed meanings</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 12 }}>
        {(Object.keys(MEANINGS) as Meaning[]).map((m) => (
          <figure key={m} style={{ margin: 0, textAlign: 'center', color: KIND_COLOURS[m] ?? 'var(--ww-gold)' }}>
            <MeaningIcon meaning={m} size={52} label={m} />
            <figcaption style={{ ...HEADING, fontSize: 11, marginTop: 8 }}>{m}</figcaption>
          </figure>
        ))}
      </div>
      <h2 style={HEADING}>Holograms</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 12, alignItems: 'flex-end' }}>
        {[...RACES, REDSHIRT].map((r) => (
          <figure key={r} style={{ margin: 0, textAlign: 'center' }}>
            <Hologram src={faceUrl(r)!} size={84} label={r} style={{ border: '2px solid var(--ww-gold)', borderRadius: '50%' }} />
            <figcaption style={{ ...HEADING, fontSize: 11, marginTop: 8 }}>{r}</figcaption>
          </figure>
        ))}
        {Object.entries(ATTACKERS).map(([terrain, names]) => names.map((a) => (
          <figure key={a} style={{ margin: 0, textAlign: 'center' }}>
            <Hologram src={faceUrl(a)!} kind="red" size={40} label={a} style={{ border: '2px solid var(--ww-pirate)', borderRadius: '50%' }} />
            <figcaption style={{ ...HEADING, fontSize: 10, marginTop: 8 }}>{terrain} · {a}</figcaption>
          </figure>
        )))}
      </div>
      <h2 style={HEADING}>On the table: a crew card and a row</h2>
      <div style={{ display: 'flex', gap: 24, marginTop: 12, alignItems: 'flex-start' }}>
        <Card id="dev:crew:1" data={{ id: 'dev:crew:1', label: 'Bolt', subtitle: 'kralkin', badges: ['anger ×1'], colorKey: 'crew', artUrl: faceUrl('kralkin') }} />
        <CardZone id="dev:crew" data={{ label: 'Crew (2/3)', mode: 'row', cards: [
          { id: 'dev:crew:2', label: 'Mica', subtitle: 'grull', colorKey: 'crew', artUrl: faceUrl('grull') },
          { id: 'dev:crew:3', label: 'Aaliyah', subtitle: 'human', colorKey: 'crew', artUrl: faceUrl('human') },
        ] }} />
      </div>
      <h2 style={HEADING}>Travel cards · {deck.length} from the engine's reference data{failed ? ` · not loaded (${failed})` : ''}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
        <TravelCardBack />
        {deck.map((f) => <TravelCard key={f.id} face={f} />)}
      </div>
      <h2 style={HEADING}>Every shape</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginTop: 12 }}>
        {(Object.keys(ICON_FILES) as IconName[]).map((n) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ww-star)' }}>
            <Icon name={n} />
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ww-muted)' }}>{n}</code>
          </div>
        ))}
      </div>
    </div>
  );
}
