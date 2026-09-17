// The table's furniture: the top bar controls, the numbered move menu, the
// rules lessons, the rejection notice, the log, the sheets, and the
// end-of-game panel.

import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GameOverResult, LegalMove, MoveMenu, MoveMenuEntry, RulesBriefing, SeatSummary, TableEventWire } from '@universe/shared';
import type { MoveForm } from '../glue';
import { PACES, type Pace } from '../playback/PlaybackQueue';

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
        {form.fields.map((f) => {
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

export function Briefings({ lessons, onDismiss }: { lessons: Lesson[]; onDismiss: (id: string) => void }) {
  if (lessons.length === 0) return null;
  return (
    <div className="side-section">
      <h3>Rules that matter now</h3>
      {lessons.map((l) => (
        <div key={l.id} className="briefing-card" role="note">
          <h4>{l.title}</h4>
          <p>{l.text}</p>
          <button className="btn secondary small" onClick={() => onDismiss(l.id)}>Got it</button>
        </div>
      ))}
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

export function Log({ events, currentSeq }: { events: TableEventWire[]; currentSeq: number | null }) {
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

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button className="btn secondary small close" onClick={onClose} aria-label="Close">✕</button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function EndPanel({ result, seats, myPlayerId, gameId, onPlayAgain, playAgainBusy }: {
  result: GameOverResult; seats: SeatSummary[]; myPlayerId: string | null; gameId: string; onPlayAgain: () => void; playAgainBusy: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const nameFor = (pid: string) => {
    const m = /^p(\d+)$/.exec(pid);
    const seat = m ? seats.find((s) => s.position === Number(m[1]) - 1) : undefined;
    return seat?.displayName ?? pid;
  };
  const iWon = myPlayerId !== null && result.winners.includes(myPlayerId);
  const headline = result.winners.length === 0 ? 'A tie' : iWon ? 'You win' : `${result.winners.map(nameFor).join(' and ')} ${result.winners.length > 1 ? 'win' : 'wins'}`;
  return (
    <div className="end-panel">
      <h2 style={{ fontSize: 32 }}>{headline}</h2>
      <p>{result.summary}</p>
      <div className="scores">
        {Object.entries(result.scores).map(([pid, score]) => (
          <span key={pid}>{nameFor(pid)}{pid === myPlayerId ? ' (you)' : ''}: <strong>{score}</strong></span>
        ))}
      </div>
      <div className="actions">
        <button className="btn" onClick={onPlayAgain} disabled={playAgainBusy}>{playAgainBusy ? 'Setting up…' : 'Play again'}</button>
        <button className="btn secondary" onClick={() => { void navigator.clipboard?.writeText(window.location.href); setCopied(true); }}>{copied ? 'Link copied' : 'Share the result'}</button>
        <Link className="btn secondary" to={`/games/${gameId}`}>Back to the game page</Link>
      </div>
    </div>
  );
}
