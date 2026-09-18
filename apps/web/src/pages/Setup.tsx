// Table setup, as the canvas draws it: the seats as rows (AI or a friend,
// the AI's level), the player count stepper, Live or By turns as two
// cards, the game's own choices as a grid, and a sticky summary with the
// Start button. Universe never defaults one of the game's setup choices:
// each is a field the player fills in, and nothing is preselected.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { GameCatalogEntry, GameReferenceResponse, SeatSpec, TableMode } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { glueFor, type SetupField } from '../glue';
import { useSession } from '../session';
import { Nav } from './Nav';
import { Avatar, Cover, colorFor } from '../ui';

const AI_LEVELS = ['easy', 'medium', 'hard'] as const;
type Level = (typeof AI_LEVELS)[number];
type Seat = { kind: 'ai'; level: Level } | { kind: 'friend' };

const AI_NAMES = ['Fudge', 'Jellybean', 'Cheesecake', 'Milkshake', 'Quiche'];

export function SetupPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const session = useSession();
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [mode, setMode] = useState<TableMode | ''>('');
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.game(id).then((r) => {
      setGame(r.game);
      const others = Math.max(0, r.game.minPlayers - 1);
      const wantFriends = params.get('friends') === '1';
      setSeats(Array.from({ length: others }, (_, i): Seat => (wantFriends && i === 0 ? { kind: 'friend' } : { kind: 'ai', level: 'medium' })));
    }).catch((e) => setErr((e as Error).message));
    api.reference(id).then(setReference).catch((e) => setErr((e as Error).message));
  }, [id, params]);

  const glue = glueFor(id);
  const fields: SetupField[] = useMemo(() => (reference && glue ? glue.setupFields(reference) : []), [reference, glue]);
  const friendSeats = seats.filter((s) => s.kind === 'friend').length;
  const aiOnly = friendSeats === 0;
  const canAddSeat = game ? seats.length + 1 < game.maxPlayers : false;
  const canRemoveSeat = game ? seats.length + 1 > game.minPlayers : false;
  const me = session.displayName || 'You';

  const fieldsAnswered = fields.every((f) => {
    const v = values[f.key] ?? [];
    return f.kind === 'multi' ? v.length === (f.pick ?? 1) : v.length === 1;
  });
  const modeAnswered = aiOnly || mode !== '';
  const ready = !!game && !!reference && fieldsAnswered && modeAnswered && (aiOnly || session.signedIn);

  function toggle(field: SetupField, value: string) {
    setValues((prev) => {
      const cur = prev[field.key] ?? [];
      if (field.kind === 'choice') return { ...prev, [field.key]: [value] };
      if (cur.includes(value)) return { ...prev, [field.key]: cur.filter((x) => x !== value) };
      if (cur.length >= (field.pick ?? 1)) return prev;
      return { ...prev, [field.key]: [...cur, value] };
    });
  }
  const setSeat = (i: number, s: Seat) => setSeats(seats.map((x, j) => (j === i ? s : x)));

  async function start() {
    if (!game) return;
    if (!aiOnly && !mode) { setErr('Choose live or by turns.'); return; }
    if (!fieldsAnswered) { setErr("Answer each of the game's own choices. They are real decisions, not defaults."); return; }
    if (!aiOnly && !session.signedIn) { setErr('Sign in to open a table with friends.'); return; }
    setBusy(true);
    setErr(null);
    try {
      const seatSpecs: SeatSpec[] = [{ kind: 'human' }, ...seats.map((s): SeatSpec => (s.kind === 'friend' ? { kind: 'human' } : { kind: 'ai', aiDifficulty: s.level }))];
      const options: Record<string, unknown> = {};
      for (const f of fields) options[f.key] = f.kind === 'multi' ? values[f.key] ?? [] : (values[f.key] ?? [])[0];
      const res = await api.createTable({ gameId: game.engineGameId, mode: aiOnly ? 'live' : (mode as TableMode), seats: seatSpecs, hostPosition: 0, options });
      nav(res.status === 'lobby' ? `/table/${res.tableId}/lobby` : `/table/${res.tableId}`);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const startLabel = busy ? 'Starting…' : aiOnly ? 'Start the game' : 'Open the lobby';
  const hint = !game || !reference ? 'Loading the game…'
    : !aiOnly && !session.signedIn ? 'Sign in to open a table with friends; guests can still join by link.'
    : !fieldsAnswered ? "Answer the game's own choices first."
    : !modeAnswered ? 'Choose live or by turns.'
    : aiOnly ? 'The AI seats are ready; the table starts at once.' : 'The lobby opens; friends take their seats by link or invitation.';

  return (
    <div>
      <Nav />
      <div className="page two-col wide-side" style={{ paddingTop: 28 }}>
        <div className="stack" style={{ gap: 28, maxWidth: 720 }}>
          <div>
            {game ? <Link to={`/games/${game.engineGameId}`} className="crumb">‹ {game.name}</Link> : <Link to="/" className="crumb">‹ Browse</Link>}
            <h1 style={{ marginTop: 10 }}>Set up the table</h1>
          </div>
          {err && <p className="error" role="alert">{err}</p>}

          <section>
            <div className="row-head" style={{ justifyContent: 'space-between' }}>
              <h3>Seats</h3>
              <div className="stepper" aria-label="Player count">
                <button type="button" onClick={() => canRemoveSeat && setSeats(seats.slice(0, -1))} disabled={!canRemoveSeat} aria-label="Fewer players">−</button>
                <span>{seats.length + 1} players</span>
                <button type="button" onClick={() => canAddSeat && setSeats([...seats, { kind: 'ai', level: 'medium' }])} disabled={!canAddSeat} aria-label="More players">+</button>
              </div>
            </div>
            <div className="card lined seat-card" role="group" aria-label="Seat 1">
              <Avatar name={me} size={36} />
              <div className="grow"><div className="name">{me}</div><div className="sub">You · the host</div></div>
            </div>
            {seats.map((s, i) => (
              <div className="card lined seat-card" key={i} role="group" aria-label={`Seat ${i + 2}`}>
                <Avatar name={s.kind === 'ai' ? AI_NAMES[i % AI_NAMES.length]! : `Friend ${i + 1}`} size={36} color={s.kind === 'ai' ? colorFor(AI_NAMES[i % AI_NAMES.length]!) : 'var(--chip)'} />
                <div className="grow">
                  <div className="name">{s.kind === 'ai' ? `AI · ${s.level}` : 'A friend'}</div>
                  <div className="sub">{s.kind === 'ai' ? 'Plays at once, no account' : 'Open seat: taken by link or invitation'}</div>
                </div>
                <div className="segmented" role="radiogroup" aria-label={`Seat ${i + 2} kind`}>
                  {game?.supportsAi && <button type="button" className={s.kind === 'ai' ? 'on' : ''} aria-pressed={s.kind === 'ai'} onClick={() => setSeat(i, { kind: 'ai', level: s.kind === 'ai' ? s.level : 'medium' })}>AI</button>}
                  <button type="button" className={s.kind === 'friend' ? 'on' : ''} aria-pressed={s.kind === 'friend'} onClick={() => setSeat(i, { kind: 'friend' })}>Friend</button>
                </div>
                {s.kind === 'ai' ? (
                  <div className="pills" role="radiogroup" aria-label={`Seat ${i + 2} level`}>
                    {AI_LEVELS.map((l) => <button type="button" key={l} className={`pill${s.level === l ? ' on' : ''}`} aria-pressed={s.level === l} onClick={() => setSeat(i, { kind: 'ai', level: l })}>{l}</button>)}
                  </div>
                ) : <span className="sub muted" style={{ fontSize: 13 }}>Invite from the lobby</span>}
              </div>
            ))}
          </section>

          <section>
            <h3>Live or by turns</h3>
            <div className="option-grid" role="radiogroup" aria-label="Live or by turns">
              <button type="button" className={`option-card${(aiOnly || mode === 'live') ? ' on' : ''}`} role="radio" aria-checked={aiOnly || mode === 'live'} onClick={() => setMode('live')}>
                <span className="name">Live</span>
                <span className="sub">Everyone plays now, in one sitting.</span>
              </button>
              <button type="button" className={`option-card${mode === 'turns' ? ' on' : ''}`} role="radio" aria-checked={mode === 'turns'} disabled={aiOnly} onClick={() => setMode('turns')}>
                <span className="name">By turns</span>
                <span className="sub">{aiOnly ? 'Needs a friend at the table; a game against only AI is always live.' : 'Each player takes their turn whenever, and is told when it is theirs.'}</span>
              </button>
            </div>
          </section>

          {fields.map((f) => {
            const picked = values[f.key] ?? [];
            return (
              <section key={f.key}>
                <div className="row-head">
                  <h3>{f.label}{f.kind === 'multi' ? ` · ${picked.length} of ${f.pick}` : ''}</h3>
                  {f.help && <span className="muted" style={{ fontSize: 13 }}>{f.help}</span>}
                </div>
                <div className={`option-grid ${f.options.length > 6 ? 'four' : 'three'}`} role="group" aria-label={f.label}>
                  {f.options.map((o) => {
                    const on = picked.includes(o.value);
                    return (
                      <label key={o.value} className={`option-card${on ? ' on' : ''}`}>
                        <input type={f.kind === 'multi' ? 'checkbox' : 'radio'} name={f.key} aria-label={o.label} checked={on} onChange={() => toggle(f, o.value)} />
                        <span className="name">{o.label}</span>
                        {o.hint && <span className="sub">{o.hint}</span>}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {reference === null && game && <p className="muted">Loading the game's setup choices…</p>}
        </div>

        <aside className="card summary" aria-label="Summary">
          <div className="head">
            {game && <Cover game={game} size="tile" />}
            <div>
              <div className="card-title" style={{ fontSize: 16 }}>{game?.name ?? '…'}</div>
              <div className="muted small">{seats.length + 1} players · {aiOnly ? 'against the AI' : mode === 'turns' ? 'by turns' : mode === 'live' ? 'live' : 'with friends'}</div>
            </div>
          </div>
          <div className="seats">
            <div><span className="dot" style={{ background: colorFor(me) }} /><span className="grow">{me}</span><span className="muted">host</span></div>
            {seats.map((s, i) => (
              <div key={i}>
                <span className="dot" style={{ background: s.kind === 'ai' ? colorFor(AI_NAMES[i % AI_NAMES.length]!) : 'var(--chip)' }} />
                <span className="grow">{s.kind === 'ai' ? `AI · ${s.level}` : 'A friend'}</span>
                <span className="muted">{s.kind === 'ai' ? 'ready' : 'open seat'}</span>
              </div>
            ))}
          </div>
          <button className="btn big" disabled={busy || !ready} onClick={start} style={{ width: '100%' }}>{startLabel}</button>
          <div className="hint">{hint}</div>
        </aside>
      </div>
    </div>
  );
}
