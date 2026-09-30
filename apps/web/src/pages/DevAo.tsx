// Development only: the Adventurer Olympics table drawn from a captured
// engine view (apps/web/src/tests/fixtures/ao, written by
// scripts/ao-fixtures.mjs), as the deciding seat or a watcher, with sends
// logged instead of made. Taps that put a choice together (a slot, a turn of
// the tile) work as on the real table. The fixtures load lazily and the
// route exists only in the dev server.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GameReferenceResponse, LegalMove, UnavailableMove } from '@universe/shared';
import { FlipRoot, paletteVars, type SelectEvent } from '@universe/primitives';
import type { GlueInput, PromptAction } from '../glue';
import { adventurerOlympicsGlue as glue } from '../glue/ao';
import { BoardZones, ZoneRenderer } from '../glue/ZoneRenderer';
import { ActionBar } from '../table/parts';

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
  const [ui, setUi] = useState<Record<string, unknown>>({});
  const memory = useRef(new Map<string, unknown>());

  useEffect(() => {
    const load = LOADERS[`../tests/fixtures/ao/${name}.json`];
    if (!load) return;
    let stop = false;
    void load().then((f) => { if (!stop) { setFixture(f); memory.current = new Map(); setSent([]); setUi({}); } });
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
    reference, seq: 1, engineMove: null, actorPlayerId: null, memory: memory.current, ui,
  } : null, [fixture, as, reference, ui]);

  const plan = useMemo(() => (input ? glue.plan(input) : null), [input]);
  const lit = useMemo(() => (input && as === 'decider' ? glue.litParts(input) : []), [input, as]);
  const log = (m: Record<string, unknown>) => setSent((s) => [...s, JSON.stringify(m)]);
  const onSelect = (sel: SelectEvent) => {
    if (!input || as !== 'decider') return;
    const change = glue.uiForSelect?.(sel, input) ?? null;
    if (change) { setUi((u) => ({ ...u, ...change })); return; }
    const moves = glue.movesForSelect!(sel, input);
    if (moves.length === 1) log(moves[0]!.move);
    else if (moves.length > 1) log({ chooser: moves.map((m) => m.move) });
  };
  const onAction = (a: PromptAction) => {
    if ('ui' in a) { setUi((u) => ({ ...u, ...a.ui })); return; }
    if ('move' in a) log(a.move.move);
    else if ('moves' in a) log({ chooser: a.moves.map((m) => m.move) });
  };
  const roll = input ? glue.resolveReportMove(input.legalMoves) : null;

  return (
    <FlipRoot viewKey={name + as + JSON.stringify(ui)} className={`table-shell ${glue.themeFor?.(input!) ?? ''}`} style={paletteVars(plan?.palette)}>
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
            {plan && <BoardZones zones={plan.board} lit={lit} onSelect={onSelect} />}
            {roll && as === 'decider' && (
              <button className="btn big roll-button" onClick={() => log(roll.move)}>
                {/draw|deal/i.test(roll.description ?? '') ? 'Draw' : 'Roll'}
              </button>
            )}
          </div>
          {plan && (plan.steps || plan.prompt) && <ActionBar steps={plan.steps} prompt={as === 'decider' ? plan.prompt : undefined} onAction={onAction} disabled={as !== 'decider'} />}
        </div>
        <div className="table-side">
          {plan?.side.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
          {plan?.points && <ZoneRenderer zone={plan.points} lit={lit} onSelect={onSelect} />}
        </div>
      </div>
      <div className="table-bench">
        {plan?.bench.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
      </div>
    </FlipRoot>
  );
}
