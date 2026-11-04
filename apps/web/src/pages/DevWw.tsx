// Development only: Warble Way Galaxy's screen drawn from a captured engine
// view (apps/web/src/tests/fixtures/ww, written by scripts/ww-fixtures.mjs),
// one per moment the table draws differently, so each part can be compared
// with its board without playing the season through. Below it, the icons
// (build item 2), the holograms (item 3) and the travel cards (item 4), to
// compare with Main.dc.html, Ruin.dc.html and Cards.dc.html. The fixtures
// load lazily, so none of them are in the production bundle, and the route
// exists only in the dev server.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GameReferenceResponse, LegalMove, UnavailableMove } from '@universe/shared';
import { Card, CardZone, FlipRoot } from '@universe/primitives';
import type { GlueInput } from '../glue';
import { WwScreen } from '../glue/ww/WwScreen';
import { api } from '../api';
import '../glue/ww/ww.css';
import { ICON_FILES, Icon, MEANINGS, MeaningIcon, type IconName, type Meaning } from '../glue/ww/icons';
import { ATTACKERS, RACES, REDSHIRT, faceUrl } from '../glue/ww/faces';
import { Hologram } from '../glue/ww/holo';
import { deckIds, travelCard } from '../glue/ww/cards';
import { TravelCard, TravelCardBack } from '../glue/ww/TravelCard';

interface Fixture { key: string; viewer: string; view: unknown; legalMoves: LegalMove[]; unavailable?: UnavailableMove[] }
const LOADERS = import.meta.glob<Fixture>('../tests/fixtures/ww/*.json', { import: 'default' });
const NAMES = Object.keys(LOADERS).map((p) => p.replace(/^.*\//, '').replace(/\.json$/, '')).sort();

const KIND_COLOURS: Partial<Record<Meaning, string>> = {
  recruit: 'var(--ww-recruit)', being: 'var(--ww-recruit)', pirate: 'var(--ww-pirate)', attacker: 'var(--ww-pirate)',
  ruin: 'var(--ww-ruin)', hazard: 'var(--ww-hazard)', job: 'var(--ww-job)', dread: 'var(--ww-dread)', damage: 'var(--ww-redshirt)',
};

const HEADING = { font: '600 12px/1 var(--ww-sign)', letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'var(--ww-muted)', marginTop: 32 };

export function DevWwPage() {
  const [params, setParams] = useSearchParams();
  const name = params.get('f') ?? '';
  const phone = params.get('phone') === '1';
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const memory = useRef(new Map<string, unknown>());

  useEffect(() => {
    const load = LOADERS[`../tests/fixtures/ww/${name}.json`];
    if (!load) { setFixture(null); return; }
    let stop = false;
    void load().then((f) => { if (!stop) { setFixture(f); memory.current = new Map(); setSent([]); } });
    return () => { stop = true; };
  }, [name]);
  useEffect(() => {
    // The server's reference data when it answers; the captured copy when it does not.
    api.reference('warble-way-galaxy').then(setReference).catch(async (e: Error) => {
      setFailed(e.message);
      const captured = await import('../tests/fixtures/ww-reference.json');
      setReference(captured.default as GameReferenceResponse);
    });
  }, []);

  const input: GlueInput | null = useMemo(() => fixture ? {
    view: fixture.view, previous: null, legalMoves: fixture.legalMoves, unavailable: fixture.unavailable ?? [],
    playerId: fixture.viewer, reference, seq: 1, engineMove: null, actorPlayerId: null, memory: memory.current, phone,
  } : null, [fixture, reference, phone]);
  const deck = deckIds(reference).map((id) => travelCard(id, reference)).filter((f) => f !== null);

  return (
    <FlipRoot viewKey={name} className={`table-shell ww-theme${phone ? ' phone' : ''}`} style={{ minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
      <div className="table-topbar" style={{ gap: 10 }}>
        <b style={{ font: '700 15px var(--ww-sign)', letterSpacing: '.1em' }}>WARBLE WAY · PREVIEW</b>
        <select value={name} onChange={(e) => setParams({ f: e.target.value, ...(phone ? { phone: '1' } : {}) })} aria-label="Captured view">
          <option value="">the icons, holograms and cards</option>
          {NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={phone} onChange={(e) => setParams({ f: name, ...(e.target.checked ? { phone: '1' } : {}) })} />phone</label>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="sent">{sent[sent.length - 1] ?? ''}</span>
      </div>
      {input ? (
        <div className="table-main">
          <div className="table-play">
            <div className="table-board" style={phone ? { maxWidth: 390, margin: '0 auto', width: '100%' } : undefined}>
              <WwScreen
                input={input} yourTurn busy={false} interactive nameFor={(pid) => pid} phone={phone}
                onMove={(m) => setSent((s) => [...s, JSON.stringify(m.move)])}
                onForm={(_t, m) => setSent((s) => [...s, JSON.stringify(m)])}
                onDraw={() => setSent((s) => [...s, 'resolve_report'])}
              />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 24 }}>
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
          <h2 style={HEADING}>Travel cards · {deck.length} from the engine's reference data{failed ? ` · the captured copy (${failed})` : ''}</h2>
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
      )}
    </FlipRoot>
  );
}
