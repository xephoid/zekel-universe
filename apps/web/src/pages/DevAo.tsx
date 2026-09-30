// Development only: the Adventurer Olympics table drawn from a captured
// engine view (apps/web/src/tests/fixtures/ao, written by
// scripts/ao-fixtures.mjs), as the deciding seat or a watcher, with sends
// logged instead of made. It is the game-drawn screen inside the table's own
// frame (side column included), so it can be compared with the canvas without
// playing to a moment. The fixtures load lazily and the route exists only in
// the dev server.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GameReferenceResponse, LegalMove, UnavailableMove } from '@universe/shared';
import { FlipRoot, paletteVars } from '@universe/primitives';
import type { GlueInput } from '../glue';
import { adventurerOlympicsGlue as glue } from '../glue/ao';
import { AoScreen } from '../glue/ao/AoScreen';

interface Fixture {
  key: string; viewer: string; view: unknown; legalMoves: LegalMove[]; unavailable?: UnavailableMove[];
  watcher: string; watcherView: unknown; watcherLegalMoves: LegalMove[];
}

const LOADERS = import.meta.glob<Fixture>('../tests/fixtures/ao/*.json', { import: 'default' });
const NAMES = Object.keys(LOADERS).map((p) => p.replace(/^.*\//, '').replace(/\.json$/, '')).sort();

export function DevAoPage() {
  const [params, setParams] = useSearchParams();
  const name = params.get('f') ?? NAMES[0] ?? '';
  const as = params.get('as') === 'watcher' ? 'watcher' : 'decider';
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [sent, setSent] = useState<string[]>([]);
  const [sideSlot, setSideSlot] = useState<HTMLDivElement | null>(null);
  const memory = useRef(new Map<string, unknown>());

  useEffect(() => {
    const load = LOADERS[`../tests/fixtures/ao/${name}.json`];
    if (!load) return;
    let stop = false;
    void load().then((f) => { if (!stop) { setFixture(f); memory.current = new Map(); setSent([]); } });
    return () => { stop = true; };
  }, [name]);
  useEffect(() => {
    void import('../tests/fixtures/ao-reference.json').then((m) => setReference(m.default as unknown as GameReferenceResponse));
  }, []);

  const input: GlueInput | null = useMemo(() => fixture ? {
    view: as === 'watcher' ? fixture.watcherView : fixture.view,
    previous: null,
    legalMoves: as === 'watcher' ? fixture.watcherLegalMoves : fixture.legalMoves,
    unavailable: as === 'watcher' ? [] : fixture.unavailable ?? [],
    playerId: as === 'watcher' ? fixture.watcher : fixture.viewer,
    reference, seq: 1, engineMove: null, actorPlayerId: null, memory: memory.current,
  } : null, [fixture, as, reference]);
  const plan = useMemo(() => (input ? glue.plan(input) : null), [input]);
  const log = (m: Record<string, unknown>) => setSent((s) => [...s, JSON.stringify(m)]);
  const roll = input ? glue.resolveReportMove(input.legalMoves) : null;

  return (
    <FlipRoot viewKey={name + as} className="table-shell ao-theme" style={paletteVars(plan?.palette)}>
      <div className="table-topbar" style={{ gap: 10 }}>
        <b>Adventurer Olympics preview</b>
        <select value={name} onChange={(e) => setParams({ f: e.target.value, as })} aria-label="Captured view">
          {NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={as} onChange={(e) => setParams({ f: name, as: e.target.value })} aria-label="Seat">
          <option value="decider">the seat that decides</option>
          <option value="watcher">a watching seat</option>
        </select>
        {plan?.status && <span className="round-note">{plan.status}</span>}
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ fontSize: 12, maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} data-testid="sent">{sent[sent.length - 1] ?? ''}</span>
      </div>
      <div className="table-main">
        <div className="table-play">
          <div className="table-board">
            {input && (
              <AoScreen
                input={input}
                yourTurn={as === 'decider'}
                busy={false}
                interactive
                nameFor={(pid) => pid}
                onMove={(m) => log(m.move)}
                onForm={(_t, m) => log(m)}
                onDraw={roll && as === 'decider' ? () => log(roll.move) : undefined}
                sideSlot={sideSlot}
              />
            )}
          </div>
        </div>
        <div className="table-side">
          <div className="table-side-slot" ref={setSideSlot} />
          <ol className="log"><li>The table log goes here.</li></ol>
        </div>
      </div>
    </FlipRoot>
  );
}
