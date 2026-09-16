import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { GameTable, Seat } from '@universe/shared';
import { api } from '../api';
import { Nav } from './Home';

export function LobbyPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [table, setTable] = useState<GameTable | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);

  useEffect(() => {
    const load = () => {
      api.table(id).then(setTable).catch(() => {});
      fetch(`/api/tables/${id}/seats`).then((r) => (r.ok ? r.json() : [])).then(setSeats).catch(() => {});
    };
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    if (table?.status === 'playing') nav(`/table/${id}`);
  }, [table?.status, id, nav]);

  const inviteLink = `${window.location.origin}/table/${id}/lobby`;
  const isHost = true; // ownership comes from the session cookie; server enforces

  return (
    <div>
      <Nav />
      <div className="page" style={{ maxWidth: 620 }}>
        <h1>Lobby — {table?.gameId ?? '…'}</h1>
        <p style={{ color: 'var(--fg-muted)' }}>Mode: {table?.mode}. Share the link; friends take open seats, no account needed.</p>
        <div className="field">
          <label>Invite link</label>
          <input readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
        </div>
        <h2>Seats</h2>
        <ul>
          {seats.map((s) => (
            <li key={s.id}>
              Seat {s.position + 1} — {s.kind}{s.ready ? ' · ready' : ' · waiting'}
            </li>
          ))}
        </ul>
        {isHost && (
          <button
            className="btn big"
            disabled={!seats.every((s) => s.ready)}
            onClick={() => fetch(`/api/tables/${id}/start`, { method: 'POST' })}
          >
            Everyone's ready — start
          </button>
        )}
      </div>
    </div>
  );
}
