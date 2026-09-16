import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FriendsResponse, TableInvite, TableResponse } from '@universe/shared';
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
  const [friends, setFriends] = useState<FriendsResponse['friends'] | null>(null);
  const [tableInvites, setTableInvites] = useState<TableInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

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

  // Inviting needs an account; the list refreshes with the lobby poll.
  useEffect(() => {
    if (!session.signedIn || data?.table.status !== 'lobby' || data.mySeats.length === 0) return;
    api.friends().then((r) => setFriends(r.friends)).catch(() => setFriends(null));
    api.tableInvites(id).then((r) => setTableInvites(r.invites)).catch(() => {});
  }, [session.signedIn, data?.table.status, data?.mySeats.length, id, data]);

  const seatedNames = new Set(data?.seats.filter((s) => s.taken).map((s) => s.displayName) ?? []);
  const invitableFriends = (friends ?? []).filter(
    (f) => !seatedNames.has(f.displayName) && !tableInvites.some((i) => i.status === 'pending' && i.toDisplayName === f.displayName),
  );

  async function invite(target: { email: string } | { userId: string }, label: string) {
    setInviteMsg(null); setErr(null);
    try {
      await api.inviteToTable(id, target);
      setInviteMsg(`Invitation sent to ${label}.`);
      setInviteEmail('');
      setTableInvites((await api.tableInvites(id)).invites);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : String(e));
    }
  }

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
          <span className="muted" style={{ fontSize: 13 }}>Anyone with the link takes an open seat, even as a guest.</span>
        </div>
        {session.signedIn && data?.mySeats.length ? (
          <div className="field">
            <label>Invite friends</label>
            {invitableFriends.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {invitableFriends.map((f) => (
                  <button key={f.userId} className="btn secondary small" onClick={() => invite({ userId: f.userId }, f.displayName)}>
                    {f.displayName}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); void invite({ email: inviteEmail.trim().toLowerCase() }, inviteEmail.trim()); }} style={{ display: 'flex', gap: 8 }}>
              <input type="email" placeholder="their sign-in email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ flex: 1 }} />
              <button className="btn secondary" type="submit">Invite</button>
            </form>
            {inviteMsg && <span className="muted" style={{ fontSize: 13 }}>{inviteMsg}</span>}
            {tableInvites.filter((i) => i.status === 'pending').length > 0 && (
              <span className="muted" style={{ fontSize: 13 }}>
                Waiting on: {tableInvites.filter((i) => i.status === 'pending').map((i) => i.toDisplayName).join(', ')}
              </span>
            )}
          </div>
        ) : null}
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
