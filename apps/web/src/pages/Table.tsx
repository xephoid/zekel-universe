// THE TABLE. Bench layout from the brief: slim top bar (game name, pace
// control, undo, menu), center board, your hand along the bottom as a bench,
// opponents stacked in the ~420px side column. A per-game glue module maps
// the seat view onto primitives; unknown views render a JSON inspector.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { GameTable } from '@universe/shared';
import type { Socket } from 'socket.io-client';
import { api } from '../api';
import { connectTable } from '../socket';
import { usePlaybackQueue } from '../playback/usePlaybackQueue';
import type { Pace } from '../playback/PlaybackQueue';
import { glueFor, type LegalMove, type SelectEvent } from '../glue';
import { ZoneRenderer, JsonInspector } from '../glue/ZoneRenderer';

interface Briefing { id: string; title: string; body: string }
interface Toast { reason: string; lesson?: string }

export function TablePage() {
  const { id = '' } = useParams();
  const [table, setTable] = useState<GameTable | null>(null);
  const [legalMoves, setLegalMoves] = useState<LegalMove[]>([]);
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const socketRef = useRef<Socket | null>(null);

  const playback = usePlaybackQueue(1);
  const { state } = playback;

  useEffect(() => { api.table(id).then(setTable).catch(() => {}); }, [id]);

  // On (re)connect/resume: fetch events after the last seq we showed and
  // resume the queue, then subscribe to the live socket.
  useEffect(() => {
    let cancelled = false;
    api.tableEvents(id, state.lastSeq).then((events) => {
      if (!cancelled && events.length) playback.resumeFrom(events);
    }).catch(() => {});
    const socket = connectTable(id, {
      onEvent: (e) => {
        playback.push(e);
        // Rules briefings ride on events (engine briefing field).
        const briefing = (e as unknown as Record<string, unknown>)['briefing'] as { id?: string; title?: string; body?: string } | undefined;
        if (briefing?.id) {
          setBriefings((b) => b.some((x) => x.id === briefing.id) ? b : [...b, { id: briefing.id!, title: briefing.title ?? 'Rule', body: briefing.body ?? '' }]);
        }
      },
      onRejected: (r) => setToast(r),
    });
    socketRef.current = socket;
    return () => { cancelled = true; socket.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const gameId = table?.gameId ?? '';
  const glue = gameId ? glueFor(gameId) : null;
  const plan = glue?.plan({ view: state.view, previous: state.previousView, legalMoves, onSelect: () => {} });

  // Legal moves arrive with table state / turn changes (server push or fetch).
  useEffect(() => {
    if (state.current) {
      const lm = (state.current as unknown as Record<string, unknown>)['legal_moves'];
      if (Array.isArray(lm)) setLegalMoves(lm as LegalMove[]);
    }
  }, [state.current]);

  const submitMove = useCallback((move: LegalMove) => {
    socketRef.current?.emit('move', { seat: 0, move: move.move });
  }, []);

  const onSelect = useCallback((sel: SelectEvent) => {
    if (!glue) return;
    const mv = glue.moveForSelect(sel, legalMoves);
    if (mv) submitMove(mv);
  }, [glue, legalMoves, submitMove]);

  const lit = glue?.litParts(state.view, legalMoves) ?? [];
  const resolveReport = glue?.resolveReportMove(legalMoves) ?? null;

  return (
    <div className="table-shell">
      {/* top bar */}
      <div className="table-topbar">
        <strong style={{ fontFamily: 'var(--font-display)' }}>{plan?.title ?? gameId ?? 'Table'}</strong>
        <span style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
          {state.current ? `#${state.current.seq} — ${state.current.summary}` : 'waiting for the first event…'}
        </span>
        <span style={{ flex: 1 }} />
        <PaceControl pace={playback.pace} setPace={playback.setPace} />
        <button className="btn secondary" onClick={playback.replayFromStart} title="Replay from start">⟲</button>
        <button className="btn secondary" onClick={() => socketRef.current?.emit('move', { seat: 0, move: { type: 'undo' } })}>Undo</button>
        <button className="btn secondary" onClick={() => setSideOpen((v) => !v)}>☰</button>
      </div>

      {/* center board + side column */}
      <div className="table-main">
        <div className="table-board">
          {state.current && <div className="caption">{state.current.summary}</div>}
          {plan
            ? plan.board.map((z) => <ZoneRenderer key={String(z.data['id'])} zone={z} lit={lit} palette={plan.palette} onSelect={onSelect} />)
            : state.view
              ? <JsonInspector value={state.view} />
              : <p style={{ color: 'var(--fg-muted)' }}>Connecting to the table…</p>}
          {resolveReport && (
            <button className="btn big" style={{ alignSelf: 'center' }} onClick={() => submitMove(resolveReport)}>
              🎲 Roll / Draw
            </button>
          )}
          {/* the numbered move menu, always available; voice reads this later */}
          <details className="move-menu" open={plan == null}>
            <summary>Moves ({legalMoves.length})</summary>
            <ol>
              {legalMoves.map((m, i) => (
                <li key={m.move_id ?? String(i)} onClick={() => submitMove(m)}>{m.description ?? m.move_id}</li>
              ))}
            </ol>
          </details>
        </div>
        {sideOpen && (
          <div className="table-side">
            {briefings.map((b) => (
              <div key={b.id} className="briefing-card">
                <strong>{b.title}</strong>
                <p style={{ margin: '4px 0', fontSize: 14 }}>{b.body}</p>
                <button className="btn secondary" onClick={() => setBriefings((x) => x.filter((y) => y.id !== b.id))}>Got it</button>
              </div>
            ))}
            {plan?.side.map((z) => <ZoneRenderer key={String(z.data['id'])} zone={z} lit={lit} palette={plan.palette} onSelect={onSelect} />)}
          </div>
        )}
      </div>

      {/* the bench: your hand along the bottom */}
      <div className="table-bench">
        {plan?.bench.map((z) => <ZoneRenderer key={String(z.data['id'])} zone={z} lit={lit} palette={plan.palette} onSelect={onSelect} />)}
      </div>

      {toast && (
        <div className="toast" role="alert">
          <strong>Not a legal move:</strong> {toast.reason}
          {toast.lesson && <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--fg-muted)' }}>{toast.lesson}</p>}
          <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setToast(null)}>OK</button>
        </div>
      )}
    </div>
  );
}

function PaceControl({ pace, setPace }: { pace: Pace; setPace: (p: Pace) => void }) {
  return (
    <span>
      {([0.5, 1, 2, 'instant'] as const).map((p) => (
        <button
          key={String(p)}
          className="btn secondary"
          style={{ marginRight: 4, padding: '4px 8px', fontWeight: pace === p ? 700 : 400 }}
          onClick={() => setPace(p)}
        >
          {p === 'instant' ? '⏩' : `${p}×`}
        </button>
      ))}
    </span>
  );
}
