import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Nav } from './Home';

// Setup: seats, AI difficulty, mode — plus every choice from the game's own
// checklist the engine lists. Universe NEVER defaults one of the game's setup
// choices: each is a field the player fills in. The checklist comes from the
// server (it asked the engine); while offline we show the structural fields.

interface ChecklistChoice {
  key: string;
  label: string;
  options?: string[];
  kind?: 'text' | 'number' | 'choice';
}

export function SetupPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [checklist, setChecklist] = useState<ChecklistChoice[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [seats, setSeats] = useState('2');
  const [aiDifficulty, setAiDifficulty] = useState('medium');
  const [mode, setMode] = useState<'live' | 'turns' | ''>(''); // never defaulted
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // The server relays the engine's setup checklist for this game.
    fetch(`/api/games/${id}/setup-checklist`)
      .then((r) => (r.ok ? r.json() : []))
      .then((c: ChecklistChoice[]) => setChecklist(c))
      .catch(() => setChecklist([]));
  }, [id]);

  const allAnswered = checklist.every((c) => (values[c.key] ?? '') !== '');

  async function start() {
    if (!mode) { setErr('Choose live or by turns.'); return; }
    if (!allAnswered) { setErr('Answer each of the game\'s setup choices — they are real decisions, not defaulted.'); return; }
    setBusy(true);
    try {
      await api.createGuest().catch(() => null);
      const table = await api.createTable({
        gameId: id,
        seats: Number(seats),
        aiDifficulty,
        mode,
        setupChoices: values,
      });
      nav(table.status === 'lobby' ? `/table/${table.id}/lobby` : `/table/${table.id}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Nav />
      <div className="page" style={{ maxWidth: 560 }}>
        <h1>Set up your table</h1>
        {err && <p style={{ color: 'var(--danger)' }}>{err}</p>}

        <div className="field">
          <label>Seats (including you)</label>
          <select value={seats} onChange={(e) => setSeats(e.target.value)}>
            {[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="field">
          <label>AI difficulty</label>
          <select value={aiDifficulty} onChange={(e) => setAiDifficulty(e.target.value)}>
            {['easy', 'medium', 'hard', 'search'].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Live or by turns</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as 'live' | 'turns')}>
            <option value="">— choose —</option>
            <option value="live">Live (everyone plays now)</option>
            <option value="turns">By turns (notify me when it's my move)</option>
          </select>
        </div>

        <h2 style={{ marginTop: 24 }}>The game's own choices</h2>
        {checklist.length === 0 && (
          <p style={{ color: 'var(--fg-muted)' }}>
            The engine's checklist for this game appears here when the server is up.
          </p>
        )}
        {checklist.map((c) => (
          <div className="field" key={c.key}>
            <label>{c.label}</label>
            {c.options ? (
              <select value={values[c.key] ?? ''} onChange={(e) => setValues({ ...values, [c.key]: e.target.value })}>
                <option value="">— choose —</option>
                {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input value={values[c.key] ?? ''} onChange={(e) => setValues({ ...values, [c.key]: e.target.value })} />
            )}
          </div>
        ))}

        <button className="btn big" disabled={busy} onClick={start} style={{ marginTop: 16 }}>
          {busy ? 'Starting…' : 'Start the table'}
        </button>
      </div>
    </div>
  );
}
