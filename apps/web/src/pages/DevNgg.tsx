// Development only: the NGnG table drawn from a captured engine view
// (apps/web/src/tests/fixtures/ngg, written by scripts/ngg-fixtures.mjs), as
// the deciding seat or a watcher, with sends logged instead of made. It is
// how a screen is looked at without playing a game to reach it. The
// fixtures load lazily, so none of them are in the production bundle, and
// the route exists only in the dev server.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GameReferenceResponse, LegalMove, UnavailableMove } from '@universe/shared';
import { FlipRoot } from '@universe/primitives';
import type { GlueInput } from '../glue';
import { NggScreen } from '../glue/ngg/NggScreen';
import { api } from '../api';

interface Fixture {
  key: string; viewer: string; view: unknown; legalMoves: LegalMove[]; unavailable?: UnavailableMove[];
  watcher: string; watcherView: unknown; watcherLegalMoves: LegalMove[];
}

const LOADERS = import.meta.glob<Fixture>('../tests/fixtures/ngg/*.json', { import: 'default' });
const NAMES = Object.keys(LOADERS).map((p) => p.replace(/^.*\//, '').replace(/\.json$/, '')).sort();

export function DevNggPage() {
  const [params, setParams] = useSearchParams();
  const name = params.get('f') ?? NAMES[0] ?? '';
  const as = params.get('as') === 'watcher' ? 'watcher' : 'decider';
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const memory = useRef(new Map<string, unknown>());

  useEffect(() => {
    const load = LOADERS[`../tests/fixtures/ngg/${name}.json`];
    if (!load) return;
    let stop = false;
    void load().then((f) => { if (!stop) { setFixture(f); memory.current = new Map(); setSent([]); } });
    return () => { stop = true; };
  }, [name]);
  useEffect(() => {
    // The server's reference data when it answers; the captured copy when it does not.
    api.reference('neither-guts-nor-gears').then(setReference).catch(async () => {
      const captured = await import('../tests/fixtures/ngg-reference.json');
      setReference(captured.default as GameReferenceResponse);
    });
  }, []);

  const input: GlueInput | null = useMemo(() => fixture ? {
    view: as === 'watcher' ? fixture.watcherView : fixture.view,
    previous: null,
    legalMoves: as === 'watcher' ? fixture.watcherLegalMoves : fixture.legalMoves,
    unavailable: as === 'watcher' ? [] : fixture.unavailable ?? [],
    playerId: as === 'watcher' ? fixture.watcher : fixture.viewer,
    reference, seq: 1, engineMove: null, actorPlayerId: null, memory: memory.current,
  } : null, [fixture, as, reference]);

  return (
    <FlipRoot viewKey={name + as} className="table-shell">
      <div className="table-topbar" style={{ gap: 10 }}>
        <b>NGnG preview</b>
        <select value={name} onChange={(e) => setParams({ f: e.target.value, as })} aria-label="Captured view">
          {NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={as} onChange={(e) => setParams({ f: name, as: e.target.value })} aria-label="Seat">
          <option value="decider">the seat that decides</option>
          <option value="watcher">a watching seat</option>
        </select>
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="sent">{sent[sent.length - 1] ?? ''}</span>
      </div>
      <div className="table-main">
        <div className="table-play">
          <div className="table-board">
            {input && (
              <NggScreen
                input={input}
                yourTurn={as === 'decider'}
                busy={false}
                interactive
                nameFor={(pid) => pid}
                onMove={(m) => setSent((s) => [...s, JSON.stringify(m.move)])}
                onForm={(_t, m) => setSent((s) => [...s, JSON.stringify(m)])}
              />
            )}
          </div>
        </div>
      </div>
    </FlipRoot>
  );
}
