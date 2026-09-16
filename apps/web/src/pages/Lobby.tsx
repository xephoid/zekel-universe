import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TableResponse } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';

export function LobbyPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const [data, setData] = useState<TableResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session.me) return;
    let stop = false;
    const load = async () => {
      try {
        let d = await api.table(id);
        // Anyone with the link takes an open seat, no account needed.
        if (d.mySeats.length === 0 && d.table.status === 'lobby') {
          await api.joinTable(id).catch(() => {});
          d = await api.table(id);
        }
        if (!stop) { setData(d); setErr(null); }
      } catch (e) {
        if (!stop) setErr(e instanceof ApiRequestError ? e.message : String(e));
      }
    };
    void load();
    const t = setInterval(load, 2500);
    return () => { stop = true; clearInterval(t); };
  }, [id, session.me]);

  useEffect(() => {
    if (data?.table.status === 'playing' || data?.table.status === 'finished') nav(`/table/${id}`);
  }, [data?.table.status, id, nav]);

  const inviteLink = `${window.location.origin}/table/${id}/lobby`;
  const mine = data?.seats.find((s) => s.mine);
  const humans = data?.seats.filter((s) => s.kind === 'human') ?? [];
  const allReady = humans.length > 0 && humans.every((s) => s.taken && s.ready);

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); setData(await api.table(id)); setErr(null); } catch (e) { setErr(e instanceof ApiRequestError ? e.message : String(e)); }
  }

  return (
    <div>
      <Nav />
      <div className="page" style={{ maxWidth: 620 }}>
        <h1>Lobby · {data?.table.gameName ?? '…'}</h1>
        {data && <p className="muted">{data.table.mode === 'turns' ? 'By turns: the game starts itself when every seat is taken.' : 'Live: the host starts when everyone is ready.'}</p>}
        {err && <p className="error">{err}</p>}
        <div className="field">
          <label>Invite link</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={inviteLink} onFocus={(e) => e.target.select()} style={{ flex: 1 }} />
            <button className="btn secondary" onClick={() => { void navigator.clipboard?.writeText(inviteLink); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
        <h2>Seats</h2>
        {data?.seats.map((s) => (
          <div className="seat-row" key={s.position}>
            <strong>Seat {s.position + 1}</strong>
            <span style={{ flex: 1 }}>
              {s.kind === 'ai' ? s.displayName : s.taken ? `${s.displayName ?? 'Player'}${s.mine ? ' (you)' : ''}` : <span className="muted">open</span>}
            </span>
            <span className="muted">{s.kind === 'ai' ? '' : !s.taken ? 'waiting for a player' : s.ready ? 'ready' : 'not ready'}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {mine && data?.table.mode === 'live' && (
            <button className="btn secondary" onClick={() => act(() => api.setReady(id, !mine.ready))}>
              {mine.ready ? 'Not ready yet' : "I'm ready"}
            </button>
          )}
          {data?.table.hostIsMe && data.table.mode === 'live' && (
            <button className="btn" disabled={!allReady} onClick={() => act(() => api.startTable(id))}>
              {allReady ? 'Everyone is ready: start' : 'Waiting for everyone'}
            </button>
          )}
          <Link className="btn secondary" to="/">Back home</Link>
        </div>
      </div>
    </div>
  );
}
