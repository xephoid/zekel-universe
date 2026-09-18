// Your profile, as the canvas draws a profile: the big avatar, the name,
// the tables you have played, and your friends riding along on the right
// with invitations and requests. Guests see a small version with the
// sign-in prompt.

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FriendsResponse, InvitesResponse, TableSummary } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { Avatar } from '../ui';

export function ProfilePage() {
  const session = useSession();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState(false);
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [friends, setFriends] = useState<FriendsResponse | null>(null);
  const [invites, setInvites] = useState<InvitesResponse['invites']>([]);
  const [friendEmail, setFriendEmail] = useState('');
  const [friendMsg, setFriendMsg] = useState<string | null>(null);
  const [friendErr, setFriendErr] = useState<string | null>(null);

  useEffect(() => { setName(session.displayName); }, [session.displayName]);
  useEffect(() => {
    if (!session.me) return;
    api.myTables().then((r) => setTables(r.tables)).catch(() => {});
  }, [session.me]);

  const reloadFriends = () => {
    if (!session.signedIn) return;
    api.friends().then(setFriends).catch(() => setFriends(null));
    api.invites().then((r) => setInvites(r.invites)).catch(() => {});
  };
  useEffect(reloadFriends, [session.signedIn]);

  async function sendRequest(e: React.FormEvent) {
    e.preventDefault();
    setFriendErr(null); setFriendMsg(null);
    try {
      const r = await api.sendFriendRequest(friendEmail.trim());
      setFriendMsg(r.accepted ? 'They already asked — you are friends now.' : 'Request sent. They will see it on their profile.');
      setFriendEmail('');
      reloadFriends();
    } catch (err) {
      setFriendErr(err instanceof ApiRequestError ? err.message : String(err));
    }
  }

  async function answerInvite(id: string, accept: boolean) {
    try {
      if (accept) { const r = await api.acceptInvite(id); nav(`/table/${r.tableId}/lobby`); return; }
      await api.declineInvite(id);
    } catch { /* stale */ }
    reloadFriends();
  }

  const played = tables.filter((t) => t.status === 'finished').length;
  const inPlay = tables.filter((t) => t.status !== 'finished');
  const displayName = session.displayName || 'You';

  return (
    <div>
      <Nav />
      <div className="page two-col wide-side" style={{ paddingTop: 28 }}>
        <div className="stack loose">
          <div className="profile-head">
            <Avatar name={displayName} size={112} style={{ fontSize: 44, fontFamily: 'var(--font-display)', fontWeight: 700, borderWidth: 3 }} />
            <div className="stack" style={{ gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                {editing ? (
                  <form onSubmit={(e) => { e.preventDefault(); api.updateMe(name).then(() => { setEditing(false); void session.refresh(); }).catch(() => {}); }} className="inline-row">
                    <input id="displayName" className="input" aria-label="Display name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} style={{ height: 40 }} />
                    <button className="btn green" type="submit" style={{ height: 40 }}>Save</button>
                    <button className="btn small quiet" type="button" onClick={() => { setEditing(false); setName(session.displayName); }}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <h1>{displayName}</h1>
                    <span className={`badge${session.signedIn ? ' green' : ''}`}>{session.signedIn ? 'Player' : 'Guest'}</span>
                    <button className="btn small secondary" onClick={() => setEditing(true)}>Rename</button>
                  </>
                )}
              </div>
              {!session.signedIn && <p className="bio">You are playing as a guest. <Link to="/signin">Sign in</Link> to keep your history and play with friends.</p>}
              <div className="stats">
                <span><b>{played}</b> tables played</span>
                <span><b>{inPlay.length}</b> in play</span>
                {session.signedIn && friends && <span><b>{friends.friends.length}</b> friends</span>}
              </div>
            </div>
            {session.signedIn && <button className="btn secondary" style={{ marginLeft: 'auto', alignSelf: 'flex-start', height: 40, borderRadius: 8, fontSize: 14 }} onClick={() => session.signOut().then(() => nav('/'))}>Sign out</button>}
          </div>

          <section>
            <div className="row-head"><h2 style={{ fontSize: 22 }}>Your tables</h2></div>
            {tables.length === 0 ? <p className="muted">No tables yet. <Link to="/">Browse the games</Link>.</p> : (
              <div className="stack" style={{ gap: 0 }}>
                {tables.map((t) => (
                  <Link key={t.id} to={t.status === 'lobby' ? `/table/${t.id}/lobby` : `/table/${t.id}`} className="person-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <Avatar name={t.gameName} size={32} />
                    <div className="grow"><div className="name">{t.gameName}</div><div className="sub">{t.status === 'lobby' ? 'in the lobby' : t.status === 'finished' ? 'finished' : t.mode === 'turns' ? 'by turns' : 'live'}</div></div>
                    {t.waitingOnMe && <span className="badge">Your move</span>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="stack" style={{ gap: 16 }}>
          {session.signedIn ? (
            <>
              {invites.length > 0 && (
                <div className="card lined side-card">
                  <h3>Invitations</h3>
                  {invites.map((i) => (
                    <div key={i.id} className="person-row">
                      <Avatar name={i.fromDisplayName} size={32} />
                      <div className="grow"><div className="name">{i.fromDisplayName} invites you to {i.gameName}</div></div>
                      <button className="btn small green" style={{ boxShadow: 'none' }} onClick={() => void answerInvite(i.id, true)}>Join</button>
                      <button className="btn small quiet" onClick={() => void answerInvite(i.id, false)}>Decline</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="card lined side-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3>Your friends</h3>
                  {friends && <span className="muted small">{friends.friends.length} friend{friends.friends.length === 1 ? '' : 's'}</span>}
                </div>
                {!friends ? <p className="muted">Loading…</p> : (
                  <>
                    {friends.friends.length === 0 && friends.incoming.length === 0 && friends.outgoing.length === 0 && (
                      <div className="note">No friends yet. Ask by the address they sign in with.</div>
                    )}
                    {friends.friends.map((f) => (
                      <div key={f.userId} className="person-row">
                        <Avatar name={f.displayName} size={32} />
                        <div className="grow"><div className="name">{f.displayName}</div><div className="sub">friend</div></div>
                        <Link className="btn small secondary" to="/">Invite to a table</Link>
                        <button className="btn small quiet" onClick={() => { void api.unfriend(f.userId).then(reloadFriends).catch(() => {}); }}>Remove</button>
                      </div>
                    ))}
                    {friends.incoming.map((r) => (
                      <div key={r.id} className="person-row">
                        <Avatar name={r.displayName} size={32} />
                        <div className="grow"><div className="name">{r.displayName} wants to be friends</div></div>
                        <button className="btn small green" style={{ boxShadow: 'none' }} onClick={() => { void api.acceptFriendRequest(r.id).then(reloadFriends).catch(() => {}); }}>Accept</button>
                        <button className="btn small quiet" onClick={() => { void api.deleteFriendRequest(r.id).then(reloadFriends).catch(() => {}); }}>Ignore</button>
                      </div>
                    ))}
                    {friends.outgoing.map((r) => (
                      <div key={r.id} className="person-row">
                        <Avatar name={r.displayName} size={32} />
                        <div className="grow"><div className="name">{r.displayName}</div><div className="sub">waiting on them</div></div>
                        <button className="btn small quiet" onClick={() => { void api.deleteFriendRequest(r.id).then(reloadFriends).catch(() => {}); }}>Cancel</button>
                      </div>
                    ))}
                    <form onSubmit={sendRequest} className="inline-row" style={{ marginTop: 8 }}>
                      <input id="friendEmail" className="input" type="email" placeholder="a friend's sign-in email" aria-label="Add a friend by email" value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} required style={{ height: 38, fontSize: 13 }} />
                      <button className="btn small secondary" type="submit" style={{ height: 38 }}>Send request</button>
                    </form>
                    {friendErr && <p className="error small">{friendErr}</p>}
                    {friendMsg && <div className="note">{friendMsg}</div>}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="card lined side-card">
              <h3>Friends</h3>
              <div className="note">Friends, invitations and tables by turns need an account. <Link to="/signin">Sign in</Link> by email link; the games you played as a guest come with you.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
