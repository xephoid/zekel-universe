// Table setup: seats, AI levels, live or by turns, and the game's own
// choices. Universe never defaults one of the game's setup choices: each is
// a field the player fills in, and nothing is preselected.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { GameCatalogEntry, GameReferenceResponse, SeatSpec, TableMode } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { glueFor, type SetupField } from '../glue';
import { useSession } from '../session';
import { Nav } from './Nav';

const AI_LEVELS = ['easy', 'medium', 'hard'] as const;
type SeatChoice = `ai:${(typeof AI_LEVELS)[number]}` | 'friend';

export function SetupPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const session = useSession();
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [seats, setSeats] = useState<SeatChoice[]>([]);
  const [mode, setMode] = useState<TableMode | ''>('');
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.game(id).then((r) => {
      setGame(r.game);
      const others = Math.max(0, r.game.minPlayers - 1);
      const wantFriends = params.get('friends') === '1';
      setSeats(Array.from({ length: others }, (_, i) => (wantFriends && i === 0 ? 'friend' : 'ai:medium')));
    }).catch((e) => setErr((e as Error).message));
    api.reference(id).then(setReference).catch((e) => setErr((e as Error).message));
  }, [id, params]);

  const glue = glueFor(id);
  const fields: SetupField[] = useMemo(() => (reference && glue ? glue.setupFields(reference) : []), [reference, glue]);
  const friendSeats = seats.filter((s) => s === 'friend').length;
  const aiOnly = friendSeats === 0;
  const canAddSeat = game ? seats.length + 1 < game.maxPlayers : false;
  const canRemoveSeat = game ? seats.length + 1 > game.minPlayers : false;

  const fieldsAnswered = fields.every((f) => {
    const v = values[f.key] ?? [];
    return f.kind === 'multi' ? v.length === (f.pick ?? 1) : v.length === 1;
  });

  function toggle(field: SetupField, value: string) {
    setValues((prev) => {
      const cur = prev[field.key] ?? [];
      if (field.kind === 'choice') return { ...prev, [field.key]: [value] };
      if (cur.includes(value)) return { ...prev, [field.key]: cur.filter((x) => x !== value) };
      if (cur.length >= (field.pick ?? 1)) return prev;
      return { ...prev, [field.key]: [...cur, value] };
    });
  }

  async function start() {
    if (!game) return;
    if (!aiOnly && !mode) { setErr('Choose live or by turns.'); return; }
    if (!fieldsAnswered) { setErr("Answer each of the game's own choices. They are real decisions, not defaults."); return; }
    if (!aiOnly && !session.signedIn) { setErr('Sign in to open a table with friends.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const seatSpecs: SeatSpec[] = [{ kind: 'human' }, ...seats.map((s): SeatSpec =>
        s === 'friend' ? { kind: 'human' } : { kind: 'ai', aiDifficulty: s.slice(3) })];
      const options: Record<string, unknown> = {};
      for (const f of fields) options[f.key] = f.kind === 'multi' ? values[f.key] ?? [] : (values[f.key] ?? [])[0];
      const res = await api.createTable({
        gameId: game.engineGameId,
        mode: aiOnly ? 'live' : (mode as TableMode),
        seats: seatSpecs,
        hostPosition: 0,
        options,
      });
      nav(res.status === 'lobby' ? `/table/${res.tableId}/lobby` : `/table/${res.tableId}`);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Nav />
      <div className="page" style={{ maxWidth: 680 }}>
        <h1>Set up your table</h1>
        {game && <p className="muted"><Link to={`/games/${game.engineGameId}`}>{game.name}</Link> · {game.playerCount} players</p>}
        {err && <p className="error" role="alert">{err}</p>}

        <h2 style={{ marginTop: 20 }}>Seats</h2>
        <div className="seat-row"><strong>Seat 1</strong><span>{session.displayName || 'You'} (you)</span></div>
        {seats.map((s, i) => (
          <div className="seat-row" key={i}>
            <strong>Seat {i + 2}</strong>
            <select aria-label={`Seat ${i + 2}`} value={s} onChange={(e) => setSeats(seats.map((x, j) => (j === i ? (e.target.value as SeatChoice) : x)))}>
              {game?.supportsAi && AI_LEVELS.map((l) => <option key={l} value={`ai:${l}`}>AI · {l}</option>)}
              <option value="friend">A friend (open seat)</option>
            </select>
            {canRemoveSeat && <button className="btn secondary small" onClick={() => setSeats(seats.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        {canAddSeat && <button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => setSeats([...seats, 'ai:medium'])}>Add a seat</button>}
        {!aiOnly && !session.signedIn && (
          <p className="muted">Playing with friends needs an account. <Link to={`/signin?next=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link> and come back; guests can still join your table by link.</p>
        )}

        <h2 style={{ marginTop: 24 }}>Live or by turns</h2>
        {aiOnly ? (
          <p className="muted">A table against only AI is always live.</p>
        ) : (
          <div className="radio-row" role="radiogroup" aria-label="Live or by turns">
            <label><input type="radio" name="mode" checked={mode === 'live'} onChange={() => setMode('live')} /> Live: everyone plays now</label>
            <label><input type="radio" name="mode" checked={mode === 'turns'} onChange={() => setMode('turns')} /> By turns: each player is told when it is their move</label>
          </div>
        )}

        {fields.length > 0 && <h2 style={{ marginTop: 24 }}>The game's own choices</h2>}
        {fields.map((f) => {
          const picked = values[f.key] ?? [];
          return (
            <div className="field" key={f.key}>
              <span className="label">{f.label}{f.kind === 'multi' ? ` (${picked.length} of ${f.pick})` : ''}</span>
              {f.help && <span className="muted" style={{ fontSize: 13 }}>{f.help}</span>}
              <div className="choice-grid" role="group" aria-label={f.label}>
                {f.options.map((o) => {
                  const on = picked.includes(o.value);
                  return (
                    <label key={o.value} className={`choice${on ? ' picked' : ''}`}>
                      <input type={f.kind === 'multi' ? 'checkbox' : 'radio'} name={f.key} aria-label={o.label} checked={on} onChange={() => toggle(f, o.value)} />
                      <span><strong>{o.label}</strong>{o.hint && <div className="hint">{o.hint}</div>}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        {reference === null && game && <p className="muted">Loading the game's setup choices…</p>}

        <button className="btn big" disabled={busy || !game || !reference} onClick={start} style={{ marginTop: 16 }}>
          {busy ? 'Starting…' : aiOnly ? 'Start the game' : 'Open the lobby'}
        </button>
      </div>
    </div>
  );
}
