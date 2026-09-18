// The lobby, as the canvas draws it: the seats as rows with a tag each,
// Ready and Start, and on the right the invite link and the friends to
// invite. Anyone with the link takes an open seat, even as a guest.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FriendsResponse, TableInvite, TableResponse } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { Avatar } from '../ui';

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

  useEffect(() => {
    if (!session.signedIn || data?.table.status !== 'lobby' || data.mySeats.length === 0) return;
    api.friends().then((r) => setFriends(r.friends)).catch(() => setFriends(null));
    api.tableInvites(id).then((r) => setTableInvites(r.invites)).catch(() => {});
  }, [session.signedIn, data?.table.status, data?.mySeats.length, id, data]);

  const seatedNames = new Set(data?.seats.filter((s) => s.taken).map((s) => s.displayName) ?? []);
  const pendingTo = new Set(tableInvites.filter((i) => i.status === 'pending').map((i) => i.toDisplayName));

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
  const open = humans.filter((s) => !s.taken).length;
  const allReady = humans.length > 0 && humans.every((s) => s.taken && s.ready);
  const turns = data?.table.mode === 'turns';

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); setData(await api.table(id)); setErr(null); } catch (e) { setErr(e instanceof ApiRequestError ? e.message : String(e)); }
  }

  const sub = !data ? '' : turns
    ? (open > 0 ? `${open} open seat${open === 1 ? '' : 's'}. The game starts itself when every seat is taken.` : 'Every seat is taken; the game is starting.')
    : (open > 0 ? `${open} open seat${open === 1 ? '' : 's'}. Ready up; the host starts when everyone is.` : allReady ? 'Everyone is ready.' : 'Ready up; the host starts when everyone is.');

  return (
    <div>
      <Nav />
      <div className="page two-col wide-side" style={{ paddingTop: 28 }}>
        <div className="stack" style={{ gap: 24, maxWidth: 720 }}>
          <div>
            {data ? <Link to={`/games/${data.table.gameId}/setup`} className="crumb">‹ Table setup</Link> : null}
            <h1 style={{ marginTop: 10 }}>Waiting for the table to fill</h1>
            <p className="muted" style={{ fontSize: 15, marginTop: 6 }}>{data ? `${data.table.gameName} · ${sub}` : 'Loading…'}</p>
          </div>
          {err && <p className="error">{err}</p>}
          <section aria-labelledby="seats-heading">
            <h2 id="seats-heading" style={{ fontSize: 18 }}>Seats</h2>
            {data?.seats.map((s) => {
              const name = s.kind === 'ai' ? s.displayName ?? 'AI' : s.taken ? (s.displayName ?? 'Player') : 'Open seat';
              const tag = s.kind === 'ai' ? 'AI' : !s.taken ? 'waiting for a player' : turns ? 'seated' : s.ready ? 'ready' : 'not ready';
              return (
                <div className={`card lined seat-card${!s.taken && s.kind === 'human' ? ' muted' : ''}`} key={s.position}
                  style={!s.taken && s.kind === 'human' ? { borderStyle: 'dashed', background: 'transparent' } : undefined}>
                  <Avatar name={name} size={40} color={!s.taken && s.kind === 'human' ? 'var(--chip)' : undefined} />
                  <div className="grow">
                    <div className="name">{name}{s.mine ? ' (you)' : ''}</div>
                    <div className="sub">Seat {s.position + 1}{s.kind === 'ai' && s.aiDifficulty ? ` · ${s.aiDifficulty}` : ''}</div>
                  </div>
                  <span className={`badge${s.kind === 'human' && s.taken && (s.ready || turns) ? ' green' : ''}`}>{tag}</span>
                </div>
              );
            })}
          </section>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {mine && !turns && (
              <button className="btn secondary" onClick={() => act(() => api.setReady(id, !mine.ready))}>{mine.ready ? 'Not ready yet' : "I'm ready"}</button>
            )}
            {data?.table.hostIsMe && !turns && (
              <button className="btn" disabled={!allReady} onClick={() => act(() => api.startTable(id))}>
                {allReady ? 'Everyone is ready: start' : 'Start the game'}
              </button>
            )}
            <span className="muted" style={{ fontSize: 13 }}>
              {turns ? 'No start button by turns: the table starts itself.' : data?.table.hostIsMe ? (allReady ? '' : 'Waiting for everyone to be ready.') : 'The host starts the game.'}
            </span>
          </div>
        </div>

        <aside className="stack" style={{ gap: 16 }}>
          <div className="card lined side-card">
            <h3>Invite link</h3>
            <div className="inline-row">
              <input className="input mono" readOnly value={inviteLink} onFocus={(e) => e.target.select()} aria-label="Invite link" style={{ height: 38, fontSize: 12 }} />
              <button className="btn green" style={{ height: 38, padding: '0 14px', fontSize: 13 }} onClick={() => { void navigator.clipboard?.writeText(inviteLink); setCopied(true); }}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <div className="note">Anyone with the link takes an open seat. They can play as a guest.</div>
          </div>
          {session.signedIn && data?.mySeats.length ? (
            <div className="card lined side-card">
              <h3>Invite friends</h3>
              {(friends ?? []).length === 0 && <div className="note">No friends yet; invite by the address they sign in with, or share the link.</div>}
              {(friends ?? []).map((f) => {
                const seated = seatedNames.has(f.displayName);
                const pending = pendingTo.has(f.displayName);
                return (
                  <div key={f.userId} className="person-row">
                    <Avatar name={f.displayName} size={32} />
                    <div className="grow"><div className="name">{f.displayName}</div><div className="sub">{seated ? 'at this table' : pending ? 'invited' : 'friend'}</div></div>
                    <button className="btn small secondary" disabled={seated || pending} onClick={() => invite({ userId: f.userId }, f.displayName)}>{seated ? 'Seated' : pending ? 'Invited' : 'Invite'}</button>
                  </div>
                );
              })}
              <form onSubmit={(e) => { e.preventDefault(); void invite({ email: inviteEmail.trim().toLowerCase() }, inviteEmail.trim()); }} className="inline-row" style={{ marginTop: 6 }}>
                <input className="input" type="email" placeholder="their sign-in email" aria-label="Invite by email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ height: 38, fontSize: 13 }} />
                <button className="btn small secondary" type="submit" style={{ height: 38 }}>Invite</button>
              </form>
              {inviteMsg && <div className="note">{inviteMsg}</div>}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
