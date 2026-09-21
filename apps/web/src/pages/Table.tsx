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
import { glueFor, submitMove, type GlueInput, formForMove, movesForSelect } from '../glue';
import type { MoveForm, FormContext, Moment, PromptAction } from '../glue';
import { JsonInspector, ZoneRenderer } from '../glue/ZoneRenderer';
import { useTable } from '../table/useTable';
import { ActionBar, Briefings, EndPanel, Log, MoveChooser, MoveFormSheet, MoveMenuList, NoticeToast, PaceControl, Sheet, lessonsOf, type Lesson, type Notice } from '../table/parts';
import { StrikeOverlay } from '../table/StrikeMoment';
import { api } from '../api';
import { useSession } from '../session';
import { Wordmark } from '../ui';

const LESSONS_KEY = 'universe:lessons';

function hueOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Small color-dot avatar + name chip carried by the caption card, as in the
 *  canvas slideshow card. */
function ActorChip({ seat, you }: { seat?: { displayName: string | null; kind: string }; you: boolean }) {
  if (!seat) return null;
  const name = seat.displayName ?? (seat.kind === 'ai' ? 'AI' : 'Player');
  const hue = hueOf(name);
  return (
    <span className="actor-chip">
      <span className="avatar" style={{ background: `hsl(${hue}, 46%, 52%)`, color: `hsl(${hue}, 46%, 96%)` }}>{name.slice(0, 1)}</span>
      {you ? 'You' : name}
    </span>
  );
}

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
  const [chooser, setChooser] = useState<LegalMove[] | null>(null);
  const [shared, setShared] = useState(false);
  const [form, setForm] = useState<MoveForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [playAgainBusy, setPlayAgainBusy] = useState(false);
  const [showEnd, setShowEnd] = useState(true);
  /** a moment playing over the board; `resolve` lets the held event land */
  const [moment, setMoment] = useState<{ m: Moment; seq: number; resolve: () => void } | null>(null);
  /** the last event that came with a moment, so it can be replayed */
  const [momentSeq, setMomentSeq] = useState<number | null>(null);
  /** a batch in flight: the taps still to send, one per event */
  const [batch, setBatch] = useState<SelectEvent[] | null>(null);
  const batchSentFor = useRef<number | null>(null);
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

  // A moment plays before its event lands: the queue holds the event, the
  // glue reads the strike from the view on screen and the one arriving, the
  // overlay plays it, and only then does the board change underneath.
  useEffect(() => {
    if (!glue?.momentFor) { playback.setGate(null); return; }
    playback.setGate(async (next, cur) => {
      const m = glue.momentFor!({ before: cur?.view ?? null, after: next.view, summary: next.summary, engineMove: next.engineMove, playerId: next.playerId, reference: t.reference });
      if (!m) return;
      setMomentSeq(next.seq);
      await new Promise<void>((resolve) => setMoment({ m, seq: next.seq, resolve }));
    });
    return () => playback.setGate(null);
  }, [glue, playback, t.reference]);
  const momentDone = useCallback(() => {
    setMoment((cur) => { cur?.resolve(); return null; });
  }, []);

  const send = useCallback(async (trigger: 'tap' | 'resolve_report_button' | 'form' | 'batch', move: Record<string, unknown>, formContext?: FormContext) => {
    if (busy) return;
    setBusy(true);
    setChooser(null);
    setForm(null);
    try {
      const ack = await submitMove(trigger, move, legalMoves, (m) => t.move(m), formContext);
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

  // One listed move is sent on the tap; a template move asks its questions
  // first; a tap that could mean several moves asks which.
  const pick = useCallback((mv: LegalMove) => {
    const f = formForMove(glue, mv, input);
    if (f) { setChooser(null); setForm(f); return; }
    void send('tap', mv.move);
  }, [glue, input, send]);

  const onSelect = useCallback((sel: SelectEvent) => {
    if (!glue) return;
    const options = movesForSelect(glue, sel, input);
    if (options.length === 1) pick(options[0]!);
    else if (options.length > 1) setChooser(options);
  }, [glue, input, pick]);

  // A new event closes any chooser or form: their moves may no longer exist.
  useEffect(() => { setChooser(null); setForm(null); }, [current?.seq]);

  // An action-bar button: one listed move, or a batch of taps.
  const onAction = useCallback((a: PromptAction) => {
    if ('move' in a) { pick(a.move); return; }
    setBatch(a.batch);
  }, [pick]);

  // The batch sends one tap per event: after each event the glue finds the
  // move the next tap means among the engine's new legal moves, and the
  // batch stops the moment a tap means nothing or several things.
  useEffect(() => {
    if (!batch || !glue) return;
    if (!yourTurn || busy) return;
    if (batchSentFor.current === (current?.seq ?? null)) return;
    const [sel, ...rest] = batch;
    if (!sel) { setBatch(null); return; }
    const options = movesForSelect(glue, sel, input);
    if (options.length !== 1 || formForMove(glue, options[0]!, input)) { setBatch(null); return; }
    batchSentFor.current = current?.seq ?? null;
    setBatch(rest.length ? rest : null);
    void send('batch', options[0]!.move);
  }, [batch, glue, yourTurn, busy, current?.seq, input, send]);

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
  const nameFor = useCallback((pid: string) => {
    const m = /^p(\d+)$/.exec(pid);
    const seat = m ? table?.seats.find((s) => s.position === Number(m[1]) - 1) : undefined;
    return seat?.displayName ?? (seat?.kind === 'ai' ? 'AI' : pid);
  }, [table]);
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
        <Link to="/" className="brand" aria-label="zekel home" style={{ textDecoration: 'none', display: 'inline-flex' }}><Wordmark size={24} /></Link>
        <span className="divider" />
        <span className="title">{plan?.title ?? table?.table.gameName ?? 'Table'}</span>
        {plan?.status && <span className="round-note" aria-hidden="true">{plan.status}</span>}
        <span className="spacer center">
          <span className={`turn-pill${yourTurn ? ' mine' : ''}`} aria-live="polite">
            <span className="dot" />{turnLabel}
          </span>
        </span>
        <div className="actions">
          {!t.connected && table && <span className="muted" style={{ fontSize: 12 }}>reconnecting…</span>}
          <button className="chip-btn" onClick={() => void undo()} disabled={!table || table.table.status !== 'playing'}>Undo</button>
          <button className="chip-btn" onClick={() => setSheet('rules')}>Rules</button>
          <button className="chip-btn" onClick={() => setSheet('settings')}>Settings</button>
          <button className="chip-btn" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/table/${id}/watch`); setShared(true); }} title="Anyone with the link can watch this table">{shared ? 'Link copied' : 'Share'}</button>
          <button className="chip-btn" onClick={() => setSideOpen((v) => !v)} aria-label="Toggle the side column">{sideOpen ? 'Hide panel' : 'Panel'}</button>
          <Link className="chip-btn leave" to="/">Leave</Link>
        </div>
      </div>

      <div className="table-main">
        <div className="table-play">
        <div className="table-board">
          {result === null && (
            <div className={`caption-card${state.done ? '' : ' pending'}`} aria-live="polite">
              {current?.actorSeatPosition !== null && current?.actorSeatPosition !== undefined && table ? (
                <ActorChip seat={table.seats.find((s) => s.position === current.actorSeatPosition)} you={yourTurn} />
              ) : null}
              <div className="caption-text">
                {current ? current.summary : (t.error ?? 'Setting the table…')}
                {state.done && momentSeq !== null && current?.seq === momentSeq && !moment && (
                  <div className="caption-controls">
                    <button className="chip-btn" onClick={playback.replayLast}>Replay the strike</button>
                  </div>
                )}
                {!state.done && (
                  <div className="caption-controls">
                    <PaceControl pace={playback.pace} setPace={playback.setPace} />
                    <button className="chip-btn" onClick={playback.replayLast} disabled={!current}>Replay last</button>
                  </div>
                )}
              </div>
            </div>
          )}
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
          {yourTurn && <MoveMenuList menu={current?.moveMenu ?? null} legalMoves={legalMoves} onPick={pick} disabled={busy} open={lit.length === 0 && !plan?.prompt?.actions.length} />}
          {result && showEnd && table && !moment && (
            <div className="sheet-backdrop" role="presentation">
              <div className="sheet" role="dialog" aria-label="Game over">
                <button className="btn secondary small close" onClick={() => setShowEnd(false)} aria-label="Look at the final table">✕</button>
                <EndPanel result={result} seats={table.seats} myPlayerId={myPlayerId} gameId={gameId} gameName={table.table.gameName} onPlayAgain={() => void playAgain()} playAgainBusy={playAgainBusy} />
              </div>
            </div>
          )}
        </div>
        {plan && (plan.steps || plan.prompt) && <ActionBar steps={plan.steps} prompt={plan.prompt} onAction={onAction} disabled={busy || !yourTurn} />}
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

      {moment && table && (
        <StrikeOverlay key={`${moment.seq}:${state.tick}`} moment={moment.m} nameFor={nameFor} youPid={myPlayerId} pace={playback.pace} setPace={playback.setPace} onDone={momentDone} reduced={reduced} />
      )}

      {chooser && yourTurn && <MoveChooser moves={chooser} onPick={pick} onClose={() => setChooser(null)} disabled={busy} />}
      {form && yourTurn && (
        <MoveFormSheet
          form={form}
          disabled={busy}
          onClose={() => setForm(null)}
          onSend={(move) => void send('form', move, { template: form.template.move, editableKeys: form.editableKeys })}
        />
      )}

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
