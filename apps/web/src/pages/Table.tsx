// THE TABLE. The bench layout from the brief: a slim top bar (game name,
// turn indicator, undo, settings, leave), the board in the center, the
// player's own hand along the bottom, and a side column that stacks the
// other seats, the points track and the log, with rules one tap away.
//
// A per-game glue module maps the seat's view onto primitives; the engine's
// legal moves light the parts you can touch. Every submission goes through
// submitMove() with the trigger that caused it (see glue/agency.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { LegalMove } from '@universe/shared';
import { Die, FlipRoot, paletteVars, useSystemReducedMotion, type SelectEvent } from '@universe/primitives';
import { glueFor, submitMove, type GlueInput } from '../glue';
import { JsonInspector, ZoneRenderer } from '../glue/ZoneRenderer';
import { useTable } from '../table/useTable';
import { Briefings, EndPanel, Log, MoveMenuList, NoticeToast, PaceControl, Sheet, lessonsOf, type Lesson, type Notice } from '../table/parts';
import { api } from '../api';
import { useSession } from '../session';

const LESSONS_KEY = 'universe:lessons';

export function TablePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const t = useTable(id, !!session.me);
  const { playback, table } = t;
  const state = playback.state;
  const current = state.current;

  const [notice, setNotice] = useState<Notice | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [seenLessons] = useState(() => new Set<string>());
  const [lessonsOn, setLessonsOn] = useState(() => { try { return localStorage.getItem(LESSONS_KEY) !== 'off'; } catch { return true; } });
  const [sideOpen, setSideOpen] = useState(true);
  const [sheet, setSheet] = useState<'rules' | 'settings' | null>(null);
  const [busy, setBusy] = useState(false);
  const [playAgainBusy, setPlayAgainBusy] = useState(false);
  const [showEnd, setShowEnd] = useState(true);
  const lastTap = useRef<{ x: number; y: number } | null>(null);
  const memory = useRef(new Map<string, unknown>());
  const reduced = useSystemReducedMotion();

  const gameId = table?.table.gameId ?? '';
  const glue = gameId ? glueFor(gameId) : null;
  const myPlayerId = current?.playerId ?? null;
  const legalMoves: LegalMove[] = state.done && current?.yourTurn ? current.legalMoves : [];
  const yourTurn = !!current?.yourTurn && state.done;

  // Rules lessons ride on events; the first time a rule matters it appears
  // next to the board and never again.
  useEffect(() => {
    if (!current?.briefing || !lessonsOn) return;
    const fresh = lessonsOf(current.briefing).filter((l) => !seenLessons.has(l.id));
    if (fresh.length === 0) return;
    for (const l of fresh) seenLessons.add(l.id);
    setLessons((prev) => [...prev, ...fresh]);
  }, [current?.briefing, lessonsOn, seenLessons]);

  const input: GlueInput = useMemo(() => ({
    view: state.view,
    previous: state.previousView,
    legalMoves,
    playerId: myPlayerId,
    reference: t.reference,
    seq: current?.seq ?? 0,
    engineMove: current?.engineMove ?? null,
    actorPlayerId: current?.actorSeatPosition === null || current?.actorSeatPosition === undefined
      ? null
      : `p${current.actorSeatPosition + 1}`,
    memory: memory.current,
  }), [state.view, state.previousView, legalMoves, myPlayerId, t.reference, current]);

  const plan = useMemo(() => (glue ? glue.plan(input) : null), [glue, input]);
  const lit = useMemo(() => (glue && yourTurn ? glue.litParts(input) : []), [glue, input, yourTurn]);
  const resolveReport = glue && yourTurn ? glue.resolveReportMove(legalMoves) : null;
  const dice = current && (current.kind === 'roll') && glue?.diceFor
    ? glue.diceFor({ engineMove: current.engineMove, summary: current.summary, view: current.view })
    : null;

  const send = useCallback(async (trigger: 'tap' | 'resolve_report_button', move: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      const ack = await submitMove(trigger, move, legalMoves, (m) => t.move(m));
      if (ack && 'error' in ack && ack.error) {
        setNotice({
          kind: ack.error === 'move_rejected' ? 'rule' : 'fault',
          reason: ack.reason ?? ack.error,
          lesson: ack.lesson,
          at: ack.error === 'move_rejected' && trigger === 'tap' ? lastTap.current ?? undefined : undefined,
        });
      }
    } finally {
      setBusy(false);
    }
  }, [busy, legalMoves, t]);

  const onSelect = useCallback((sel: SelectEvent) => {
    if (!glue) return;
    const mv = glue.moveForSelect(sel, input);
    if (mv) void send('tap', mv.move);
  }, [glue, input, send]);

  const undo = useCallback(async () => {
    const ack = await t.undo();
    if ('error' in ack && ack.error) setNotice({ kind: ack.error.startsWith('engine') || ack.error === 'internal' ? 'fault' : 'rule', reason: ack.message ?? ack.error });
  }, [t]);

  const playAgain = useCallback(async () => {
    if (!table) return;
    setPlayAgainBusy(true);
    try {
      const res = await api.createTable({
        gameId: table.table.gameId,
        mode: table.table.mode,
        seats: table.seats.map((s) => (s.kind === 'ai' ? { kind: 'ai' as const, aiDifficulty: s.aiDifficulty ?? undefined } : { kind: 'human' as const })),
        hostPosition: t.mySeat ?? 0,
        options: (memory.current.get('options') as Record<string, unknown> | undefined) ?? {},
      });
      nav(res.status === 'lobby' ? `/table/${res.tableId}/lobby` : `/table/${res.tableId}`);
    } catch (e) {
      setNotice({ kind: 'fault', reason: (e as Error).message });
    } finally {
      setPlayAgainBusy(false);
    }
  }, [table, t.mySeat, nav]);

  const result = current?.gameOver ?? table?.table.status === 'finished' ? (current?.gameOver ?? null) : null;
  const turnLabel = !table ? '' : table.table.status === 'finished' ? 'Game over'
    : !state.done ? 'Playing back…'
    : current?.yourTurn ? 'Your move'
    : current?.nextActorPosition === null || current?.nextActorPosition === undefined ? 'The AI is thinking…'
    : `Waiting on ${table.seats.find((s) => s.position === current.nextActorPosition)?.displayName ?? 'the other player'}`;

  if (t.error && !table) {
    return (
      <div className="page">
        <p className="error">{t.error}</p>
        <Link to="/">Back home</Link>
      </div>
    );
  }

  return (
    <FlipRoot viewKey={state.tick} className="table-shell" style={paletteVars(plan?.palette)} reducedMotion={reduced}>
      <div className="table-topbar">
        <span className="title">{plan?.title ?? table?.table.gameName ?? 'Table'}</span>
        <span className={`turn${yourTurn ? ' mine' : ''}`} aria-live="polite">{turnLabel}{plan?.status ? ` · ${plan.status}` : ''}</span>
        <span className="spacer" />
        {!t.connected && table && <span className="muted" style={{ fontSize: 12 }}>reconnecting…</span>}
        <PaceControl pace={playback.pace} setPace={playback.setPace} />
        <button className="btn secondary small" onClick={playback.replayLast} title="Replay the last move" disabled={!current}>Replay</button>
        <button className="btn secondary small" onClick={() => void undo()} disabled={!table || table.table.status !== 'playing'}>Undo</button>
        <button className="btn secondary small" onClick={() => setSheet('rules')}>Rules</button>
        <button className="btn secondary small" onClick={() => setSheet('settings')} aria-label="Settings">⚙</button>
        <button className="btn secondary small" onClick={() => setSideOpen((v) => !v)} aria-label="Toggle the side column">☰</button>
        <Link className="btn secondary small" to="/">Leave</Link>
      </div>

      <div className="table-main">
        <div className="table-board">
          {current
            ? <div className={`caption${state.done ? '' : ' pending'}`} aria-live="polite">{current.summary}</div>
            : <div className="caption pending">{t.error ?? 'Setting the table…'}</div>}
          {dice && dice.length > 0 && (
            <div className="dice-row">{dice.map((d, i) => <Die key={i} value={d} rollKey={current?.seq} />)}</div>
          )}
          {plan
            ? <div className="zones">{plan.board.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}</div>
            : state.view
              ? <JsonInspector value={state.view} />
              : null}
          {resolveReport && (
            <button className="btn big roll-button" onClick={() => void send('resolve_report_button', resolveReport.move)} disabled={busy}>
              {/draw|deal/i.test(resolveReport.description ?? '') ? 'Draw' : 'Roll'}
            </button>
          )}
          {yourTurn && <MoveMenuList menu={current?.moveMenu ?? null} legalMoves={legalMoves} onPick={(m) => void send('tap', m.move)} disabled={busy} open={lit.length === 0} />}
          {result && showEnd && table && (
            <div className="sheet-backdrop" role="presentation">
              <div className="sheet" role="dialog" aria-label="Game over">
                <button className="btn secondary small close" onClick={() => setShowEnd(false)} aria-label="Look at the final table">✕</button>
                <EndPanel result={result} seats={table.seats} myPlayerId={myPlayerId} gameId={gameId} onPlayAgain={() => void playAgain()} playAgainBusy={playAgainBusy} />
              </div>
            </div>
          )}
        </div>
        <div className={`table-side${sideOpen ? '' : ' collapsed'}`}>
          {sideOpen && (
            <>
              <Briefings lessons={lessons} onDismiss={(lid) => setLessons((ls) => ls.filter((l) => l.id !== lid))} />
              {plan?.side.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
              {plan?.points && <ZoneRenderer zone={plan.points} lit={lit} onSelect={onSelect} />}
              <Log events={state.applied} currentSeq={current?.seq ?? null} />
            </>
          )}
        </div>
      </div>

      <div className="table-bench" onClickCapture={(e) => { lastTap.current = { x: e.clientX, y: e.clientY }; }}>
        {plan?.bench.map((z) => <ZoneRenderer key={z.id} zone={z} lit={lit} onSelect={onSelect} />)}
      </div>

      <NoticeToast notice={notice} onClose={() => setNotice(null)} />

      {sheet === 'rules' && (
        <Sheet title="Rules" onClose={() => setSheet(null)}>
          {t.reference ? <div className="rules-text">{t.reference.rules}</div> : <p className="muted">Loading…</p>}
        </Sheet>
      )}
      {sheet === 'settings' && (
        <Sheet title="Settings" onClose={() => setSheet(null)}>
          <div className="field">
            <span className="label">Playback pace</span>
            <PaceControl pace={playback.pace} setPace={playback.setPace} />
          </div>
          <div className="field">
            <label><input type="checkbox" checked={lessonsOn} onChange={(e) => { setLessonsOn(e.target.checked); try { localStorage.setItem(LESSONS_KEY, e.target.checked ? 'on' : 'off'); } catch { /* ignore */ } }} /> Show rules lessons the first time a rule matters</label>
          </div>
          <div className="field">
            <span className="label">Theme</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['light', 'dark'] as const).map((th) => (
                <button key={th} className="btn secondary small" onClick={() => { document.documentElement.dataset['theme'] = th; try { localStorage.setItem('universe:theme', th); } catch { /* ignore */ } }}>{th}</button>
              ))}
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Reduced motion follows your system setting: movement becomes a fade and the timing stays the same.</p>
        </Sheet>
      )}
    </FlipRoot>
  );
}
