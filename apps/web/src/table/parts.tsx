// The table's furniture: the top bar controls, the numbered move menu, the
// rules lessons, the rejection notice, the log, the sheets, and the
// end-of-game panel.

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameOverResult, LegalMove, LogLine, MoveMenu, MoveMenuEntry, RulesBriefing, SeatSummary, TableEventWire } from '@universe/shared';
import type { MoveForm, PlanPrompt, PlanStep, PromptAction } from '../glue';
import { PACES, type Pace } from '../playback/PlaybackQueue';
import { Avatar } from '../ui';

export function PaceControl({ pace, setPace }: { pace: Pace; setPace: (p: Pace) => void }) {
  return (
    <span className="pace" role="group" aria-label="Playback pace">
      {PACES.map((p) => (
        <button key={p} className={`btn secondary small${pace === p ? ' active' : ''}`} onClick={() => setPace(p)} aria-pressed={pace === p}>
          {p}×
        </button>
      ))}
    </span>
  );
}

/**
 * The action bar (docs/design/Fractured Fist Table.dc.html): the turn's
 * steps as chips, what you can do now in words, and the buttons that move
 * the turn. Each button is a legal move the engine listed, or a batch the
 * player presses once; none appears unless the glue found its move.
 */
export function ActionBar({ steps, prompt, onAction, disabled }: {
  steps?: PlanStep[]; prompt?: PlanPrompt; onAction: (a: PromptAction) => void; disabled: boolean;
}) {
  if (!steps?.length && !prompt) return null;
  return (
    <div className={`action-bar${prompt?.actions.length ? ' live' : ''}${prompt?.urgent ? ' urgent' : ''}`} role="region" aria-label="Your turn">
      {steps && steps.length > 0 && (
        <div className="steps" aria-label="Steps">
          {steps.map((st) => <span key={st.id} className={`step${st.current ? ' current' : ''}`} aria-current={st.current ? 'step' : undefined}>{st.label}</span>)}
        </div>
      )}
      {prompt && (
        <>
          <span className="divider" />
          <div className="words">
            <div className="title">{prompt.title}</div>
            {prompt.sub && <div className="sub">{prompt.sub}</div>}
          </div>
          {prompt.actions.map((a) => (
            <button key={a.id} className={`btn${a.primary ? '' : ' secondary'} small`} disabled={disabled} title={a.title} onClick={() => onAction(a)}>
              {a.label}{a.note && <span className="note">{a.note}</span>}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/** A tap that could mean several moves: the engine's own descriptions, one
 *  button each. The player picks; nothing is chosen for them. */
export function MoveChooser({ moves, onPick, onClose, disabled }: {
  moves: LegalMove[]; onPick: (m: LegalMove) => void; onClose: () => void; disabled: boolean;
}) {
  return (
    <Sheet title="Which move?" onClose={onClose}>
      <ol className="chooser">
        {moves.map((m, i) => (
          <li key={m.move_id ?? i}>
            <button className="btn secondary" disabled={disabled} onClick={() => onPick(m)}>{m.description ?? m.move_id ?? 'move'}</button>
          </li>
        ))}
      </ol>
    </Sheet>
  );
}

/** A template move's questions. The Send button is live only once every
 *  answer is in; the answers start empty, whatever the template held. */
export function MoveFormSheet({ form, onSend, onClose, disabled }: {
  form: MoveForm; onSend: (move: Record<string, unknown>) => void; onClose: () => void; disabled: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const built = form.build(answers);
  const set = (key: string, value: unknown) => setAnswers((a) => ({ ...a, [key]: value }));
  const toggle = (key: string, value: string, pick: number) => setAnswers((a) => {
    const cur = Array.isArray(a[key]) ? (a[key] as string[]) : [];
    if (cur.includes(value)) return { ...a, [key]: cur.filter((x) => x !== value) };
    if (cur.length >= pick) return a;
    return { ...a, [key]: [...cur, value] };
  });
  return (
    <Sheet title={form.title} onClose={onClose}>
      {form.help && <p className="muted form-help">{form.help}</p>}
      <form className="move-form" onSubmit={(e) => { e.preventDefault(); if (built) onSend(built); }}>
        {(form.fieldsFor?.(answers) ?? form.fields).map((f) => {
          if (f.kind === 'text') {
            return (
              <label key={f.key} className="field">
                <span className="label">{f.label}</span>
                <input type="text" maxLength={f.maxLength} placeholder={f.placeholder} value={typeof answers[f.key] === 'string' ? (answers[f.key] as string) : ''} onChange={(e) => set(f.key, e.target.value)} />
                {f.help && <span className="muted">{f.help}</span>}
              </label>
            );
          }
          if (f.kind === 'number') {
            return (
              <label key={f.key} className="field">
                <span className="label">{f.label}</span>
                <input type="number" min={f.min} max={f.max} value={typeof answers[f.key] === 'string' ? (answers[f.key] as string) : ''} onChange={(e) => set(f.key, e.target.value)} />
                {f.help && <span className="muted">{f.help}</span>}
              </label>
            );
          }
          if (f.kind === 'choice') {
            return (
              <fieldset key={f.key} className="field">
                <legend className="label">{f.label}</legend>
                <div className="radio-row">
                  {f.options.map((o) => (
                    <label key={o.value} title={o.hint}>
                      <input type="radio" name={f.key} aria-label={o.label} checked={answers[f.key] === o.value} onChange={() => set(f.key, o.value)} /> {o.label}
                    </label>
                  ))}
                </div>
                {f.help && <span className="muted">{f.help}</span>}
              </fieldset>
            );
          }
          const picked = Array.isArray(answers[f.key]) ? (answers[f.key] as string[]) : [];
          return (
            <fieldset key={f.key} className="field">
              <legend className="label">{f.label} ({picked.length} of {f.pick})</legend>
              <div className="radio-row">
                {f.options.map((o) => (
                  <label key={o.value} title={o.hint}>
                    <input type="checkbox" aria-label={o.label} checked={picked.includes(o.value)} onChange={() => toggle(f.key, o.value, f.pick)} /> {o.label}
                  </label>
                ))}
              </div>
              {f.help && <span className="muted">{f.help}</span>}
            </fieldset>
          );
        })}
        {form.summarize?.(answers) && <p className="form-total">{form.summarize(answers)}</p>}
        <button className="btn" type="submit" disabled={disabled || !built}>{form.submitLabel ?? 'Send'}</button>
      </form>
    </Sheet>
  );
}

/** The engine's numbered menu; a fallback for every move and the whole
 *  interface for voice later. Categories drill down one level at a time. */
export function MoveMenuList({ menu, legalMoves, onPick, disabled, open }: {
  menu: MoveMenu | null; legalMoves: LegalMove[]; onPick: (m: LegalMove) => void; disabled: boolean; open?: boolean;
}) {
  const [path, setPath] = useState<MoveMenuEntry[]>([]);
  const entries: MoveMenuEntry[] = path.length ? (path[path.length - 1]!.submenu ?? []) : (menu?.entries ?? []);
  const byId = new globalThis.Map(legalMoves.map((m) => [m.move_id, m] as const));
  const rows: MoveMenuEntry[] = menu ? entries : legalMoves.map((m, i) => ({ key: String(i + 1), label: m.description ?? m.move_id ?? 'move', move_id: m.move_id }));
  return (
    <details className="move-menu" open={open || (legalMoves.length > 0 && !menu?.entries?.length) ? true : undefined}>
      <summary>Moves ({legalMoves.length}){menu?.prompt ? ` · ${menu.prompt}` : ''}</summary>
      {path.length > 0 && <button className="btn secondary small" onClick={() => setPath(path.slice(0, -1))}>← back</button>}
      <ol>
        {rows.map((e, i) => {
          // A leaf names its move by id; some games list moves without ids,
          // so fall back to the description, then to the row's position.
          const leaf = (e.move_id ? byId.get(e.move_id) : undefined)
            ?? (!e.submenu ? legalMoves.find((m) => m.description === e.label) : undefined)
            ?? (!e.submenu && !menu ? legalMoves[i] : undefined);
          return (
            <li key={e.key + (e.move_id ?? e.label)}>
              <button disabled={disabled} onClick={() => {
                if (e.submenu) setPath([...path, e]);
                else if (leaf) onPick(leaf);
              }}>
                {e.label}{e.submenu ? ` (${e.count ?? e.submenu.length})…` : ''}
              </button>
            </li>
          );
        })}
      </ol>
      {menu?.free_text_hint && <p className="muted" style={{ fontSize: 12 }}>{menu.free_text_hint}</p>}
    </details>
  );
}

export interface Lesson { id: string; title: string; text: string }

export function lessonsOf(b: RulesBriefing | null): Lesson[] {
  if (!b) return [];
  return b.sections.map((s) => ({ id: s.id, title: s.title, text: s.text }));
}

/**
 * One lesson at a time, beside the thing it is about.
 *
 * Every section the engine sent used to open at once, stacked down the side
 * column: a first Cybernoir turn put six long panels above the opponent, the
 * evidence and the log — displacing exactly the game information that column
 * exists to show. Now the queue shows its first card, short, with the rest of
 * the words a press away, and the ones behind it counted.
 */
export function LessonNote({ lessons, onDismiss }: { lessons: Lesson[]; onDismiss: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const lesson = lessons[0];
  useEffect(() => { setOpen(false); }, [lesson?.id]);
  if (!lesson) return null;
  // The first sentence is the lesson; the rest is the detail behind "More".
  const cut = lesson.text.search(/\.\s/);
  const gist = cut > 0 ? lesson.text.slice(0, cut + 1) : lesson.text;
  const rest = cut > 0 ? lesson.text.slice(cut + 2) : '';
  return (
    <div className="lesson-note" role="note" aria-label={`Rule: ${lesson.title}`}>
      <div className="lesson-head">
        <span className="lesson-title">{lesson.title}</span>
        {lessons.length > 1 && <span className="lesson-count">1 of {lessons.length}</span>}
      </div>
      <p className="lesson-gist">{open ? lesson.text : gist}</p>
      <div className="lesson-actions">
        {rest !== '' && (
          <button className="btn secondary small" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? 'Less' : 'More'}
          </button>
        )}
        <button className="btn secondary small" onClick={() => onDismiss(lesson.id)}>Got it</button>
      </div>
    </div>
  );
}

export interface Notice { kind: 'rule' | 'fault'; reason: string; lesson?: string; at?: { x: number; y: number } }

export function NoticeToast({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const [showLesson, setShowLesson] = useState(false);
  if (!notice) return null;
  const style = notice.at ? { left: notice.at.x, top: notice.at.y } : undefined;
  return (
    <div className={`toast${notice.kind === 'fault' ? ' fault' : ''}${notice.at ? ' at' : ''}`} role="alert" style={style}>
      <strong>{notice.kind === 'rule' ? 'Not allowed: ' : 'Something went wrong: '}</strong>{notice.reason}
      {notice.lesson && (
        showLesson
          ? <p style={{ margin: '6px 0 0', fontSize: 14 }} className="muted">{notice.lesson}</p>
          : <> <button className="btn secondary small" onClick={() => setShowLesson(true)}>Why?</button></>
      )}
      <div><button className="btn secondary small" style={{ marginTop: 8 }} onClick={onClose}>OK</button></div>
    </div>
  );
}

/**
 * The engine's narration for the move on screen, held to a few lines.
 *
 * A summary is as long as the move was busy: a jail that advanced four
 * prisoners names each of them, and one of these ran to nine lines and 217
 * pixels. The card grew with it and pushed the board down by more than a
 * hundred pixels from one move to the next, which is the same jitter the card
 * already draws its controls to avoid, only larger.
 *
 * Nothing is lost by cutting it short. The Log beside the table carries every
 * event in full, and when this one is cut the card says so and opens it.
 */
export function CaptionWords({ text, onClamped }: { text: string; onClamped: (clamped: boolean) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => onClamped(el.scrollHeight - el.clientHeight > 1);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [text, onClamped]);
  return <div className="caption-words" ref={ref}>{text}</div>;
}

export function Log({ events, currentSeq, me = null }: { events: TableEventWire[]; currentSeq: number | null; me?: string | null }) {
  // An Undo rewinds the table to an earlier event: the lines of the moves it
  // took back leave the log (their engine entries were rewound too).
  const lines: Array<{ line: LogLine; seq: number }> = [];
  for (const e of events) {
    if (e.rewindToSeq !== null && e.rewindToSeq !== undefined) {
      const keep = e.rewindToSeq;
      for (let i = lines.length - 1; i >= 0; i--) if (lines[i]!.seq > keep) lines.splice(i, 1);
    }
    for (const line of e.log ?? []) lines.push({ line, seq: e.seq });
  }
  // A game whose engine marks its key entries gets the short log; any other
  // shows one line per event, as before.
  if (lines.some((x) => x.line.headline)) return <KeyLog lines={lines} currentSeq={currentSeq} me={me} />;
  return (
    <div className="side-section">
      <h3>Log</h3>
      <ul className="log">
        {[...events].reverse().slice(0, 40).map((e) => (
          <li key={e.seq} className={e.seq === currentSeq ? 'current' : undefined}>{e.summary}</li>
        ))}
      </ul>
    </div>
  );
}

interface LogGroup {
  /** the key entry; null for the details after the last key entry */
  key: { line: LogLine; seq: number } | null;
  /** every entry up to and including the key one: what the key line opens to */
  details: Array<{ line: LogLine; seq: number }>;
}

/** The engine's key entries, newest first, one short line each; a line opens
 *  to the engine's full sentences for everything that led up to it (a
 *  purchase's payment, a battle's rolls). A line about you reads as yours. */
function KeyLog({ lines, currentSeq, me }: { lines: Array<{ line: LogLine; seq: number }>; currentSeq: number | null; me: string | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const groups: LogGroup[] = [];
  let pending: LogGroup['details'] = [];
  for (const x of lines) {
    pending.push(x);
    if (x.line.headline) { groups.push({ key: x, details: pending }); pending = []; }
  }
  if (pending.length > 0) groups.push({ key: null, details: pending });
  const shown = [...groups].reverse().slice(0, 80);
  return (
    <div className="side-section">
      <h3>Log</h3>
      <ul className="log key-log">
        {shown.map((g, i) => {
          const id = g.details[0]!.line.seq;
          const round = (g.key ?? g.details[g.details.length - 1]!).line.round;
          // Newest first: a round's label heads its first (newest) line.
          const newerRound = i > 0 ? (shown[i - 1]!.key ?? shown[i - 1]!.details[shown[i - 1]!.details.length - 1]!).line.round : null;
          const mine = !!g.key && !!me && g.key.line.subject === me;
          const text = g.key
            ? (mine && g.key.line.subjectHeadline ? g.key.line.subjectHeadline : g.key.line.headline!)
            : `${g.details.length} more ${g.details.length === 1 ? 'line' : 'lines'}`;
          const current = g.details.some((x) => x.seq === currentSeq);
          const cls = [current ? 'current' : '', !g.key ? 'more' : '', g.key?.line.category === 'phase' ? 'phase' : '', mine && g.key?.line.loss ? 'loss' : '', mine ? 'yours' : ''].filter(Boolean).join(' ');
          const expanded = open === id;
          return (
            <Fragment key={id}>
              {round > 0 && newerRound !== round && <li className="log-round" aria-hidden="true">Round {round}</li>}
              <li className={cls || undefined}>
                <button type="button" className="log-line" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : id)}>
                  {text}
                </button>
                {expanded && (
                  <ul className="log-detail">
                    {g.details.map((x) => <li key={x.line.seq}>{x.line.summary}</li>)}
                  </ul>
                )}
              </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A sheet is a modal dialog, and behaves like one: focus moves into it when
 * it opens, Tab stays inside while it is open, Escape closes it, and focus
 * goes back to whatever opened it. Without the trap, Tab reached the table's
 * own buttons behind the sheet — which on this table means spending action
 * points by accident while a question is still on screen.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    // The first thing worth acting on, else the dialog itself.
    const first = box.current?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not(.close), [href], [tabindex]:not([tabindex="-1"])',
    );
    (first ?? box.current)?.focus();
    return () => {
      const back = opener.current;
      if (back instanceof HTMLElement && document.contains(back)) back.focus();
    };
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const focusable = [...(box.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) { e.preventDefault(); return; }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const here = document.activeElement;
    if (e.shiftKey && (here === first || here === box.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && here === last) { e.preventDefault(); first.focus(); }
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        ref={box}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="btn secondary small close" onClick={onClose} aria-label="Close">✕</button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function EndPanel({ result, seats, myPlayerId, gameId, gameName, onPlayAgain, playAgainBusy }: {
  result: GameOverResult; seats: SeatSummary[]; myPlayerId: string | null; gameId: string; gameName?: string; onPlayAgain: () => void; playAgainBusy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const nameFor = (pid: string) => {
    const m = /^p(\d+)$/.exec(pid);
    const seat = m ? seats.find((s) => s.position === Number(m[1]) - 1) : undefined;
    return seat?.displayName ?? pid;
  };
  const iWon = myPlayerId !== null && result.winners.includes(myPlayerId);
  const headline = result.winners.length === 0 ? 'A tie.' : iWon ? 'You win.' : `${result.winners.map(nameFor).join(' and ')} ${result.winners.length > 1 ? 'win' : 'wins'}.`;
  const rows = Object.entries(result.scores)
    .map(([pid, score]) => ({ pid, score: Number(score), name: nameFor(pid), winner: result.winners.includes(pid) }))
    .sort((a, b) => Number(b.winner) - Number(a.winner) || b.score - a.score);
  return (
    <div className="end-panel">
      <div>
        <div className="kicker">{gameName}</div>
        <h2>{headline}</h2>
        {result.summary && <div className="sub">{result.summary}</div>}
      </div>
      <div className="results">
        {rows.map((r, i) => (
          <div key={r.pid} className={`result${i === 0 ? ' first' : ''}`}>
            <span className="place">{i + 1}</span>
            <Avatar name={r.name} size={30} />
            <div className="grow"><div className="name">{r.name}{r.pid === myPlayerId ? ' (you)' : ''}</div><div className="sub">{r.winner ? 'winner' : r.pid === myPlayerId ? 'your seat' : ''}</div></div>
            <span className="pts" style={{ color: r.winner ? 'var(--accent)' : undefined }}>{r.score}</span>
          </div>
        ))}
      </div>
      <div className="actions">
        <button className="btn" onClick={onPlayAgain} disabled={playAgainBusy}>{playAgainBusy ? 'Setting up…' : 'Play again, same table'}</button>
        <button className="btn secondary" onClick={() => { void navigator.clipboard?.writeText(window.location.href); setCopied(true); }}>{copied ? 'Link copied' : 'Share the result'}</button>
        <Link className="btn quiet" to={`/games/${gameId}`}>Game page</Link>
      </div>
    </div>
  );
}
