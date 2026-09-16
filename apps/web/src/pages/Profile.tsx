import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FriendsResponse, InvitesResponse, TableSummary } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';

export function ProfilePage() {
  const session = useSession();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [saved, setSaved] = useState(false);
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
      if (accept) {
        const r = await api.acceptInvite(id);
        nav(`/table/${r.tableId}/lobby`);
      } else {
        await api.declineInvite(id);
      }
      reloadFriends();
    } catch { /* listed invite may be stale; reload */ reloadFriends(); }
  }

  return (
    <div>
      <Nav />
      <div className="page" style={{ maxWidth: 620 }}>
        <h1>Profile</h1>
        {!session.signedIn && <p className="muted">You are playing as a guest. <Link to="/signin">Sign in</Link> to keep your history and play with friends.</p>}
        <form onSubmit={(e) => { e.preventDefault(); api.updateMe(name).then(() => { setSaved(true); void session.refresh(); }).catch(() => {}); }}>
          <div className="field">
            <label htmlFor="displayName">Display name</label>
            <input id="displayName" value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} maxLength={40} />
          </div>
          <button className="btn secondary" type="submit">{saved ? 'Saved' : 'Save'}</button>
        </form>

        <h2 style={{ marginTop: 28 }}>Games played</h2>
        {tables.length === 0 ? <p className="muted">No tables yet.</p> : (
          <ul>
            {tables.map((t) => (
              <li key={t.id}>
                <Link to={t.status === 'lobby' ? `/table/${t.id}/lobby` : `/table/${t.id}`}>{t.gameName}</Link>
                {' '}<span className="muted">· {t.status}{t.waitingOnMe ? ' · your move' : ''}</span>
              </li>
            ))}
          </ul>
        )}

        {session.signedIn && (
          <>
            <h2 style={{ marginTop: 28 }}>Invitations</h2>
            {invites.length === 0 ? <p className="muted">No pending invitations.</p> : (
              <ul>
                {invites.map((i) => (
                  <li key={i.id} style={{ marginBottom: 8 }}>
                    <strong>{i.fromDisplayName}</strong> invited you to <strong>{i.gameName}</strong>{' '}
                    <button className="btn small" onClick={() => answerInvite(i.id, true)}>Accept</button>{' '}
                    <button className="btn secondary small" onClick={() => answerInvite(i.id, false)}>Decline</button>
                  </li>
                ))}
              </ul>
            )}

            <h2 style={{ marginTop: 28 }}>Friends</h2>
            {friends ? (
              <>
                {friends.friends.length === 0 && friends.incoming.length === 0 && friends.outgoing.length === 0 && (
                  <p className="muted">No friends yet. Ask by the address they sign in with.</p>
                )}
                {friends.friends.length > 0 && (
                  <ul>
                    {friends.friends.map((f) => (
                      <li key={f.userId} style={{ marginBottom: 4 }}>
                        {f.displayName}{' '}
                        <button className="btn secondary small" onClick={() => { void api.unfriend(f.userId).then(reloadFriends).catch(() => {}); }}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
                {friends.incoming.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 15 }}>Requests for you</h3>
                    <ul>
                      {friends.incoming.map((r) => (
                        <li key={r.id} style={{ marginBottom: 4 }}>
                          {r.displayName}{' '}
                          <button className="btn small" onClick={() => { void api.acceptFriendRequest(r.id).then(reloadFriends).catch(() => {}); }}>Accept</button>{' '}
                          <button className="btn secondary small" onClick={() => { void api.deleteFriendRequest(r.id).then(reloadFriends).catch(() => {}); }}>Decline</button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {friends.outgoing.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 15 }}>Waiting on them</h3>
                    <ul>
                      {friends.outgoing.map((r) => (
                        <li key={r.id} style={{ marginBottom: 4 }}>
                          {r.displayName}{' '}
                          <button className="btn secondary small" onClick={() => { void api.deleteFriendRequest(r.id).then(reloadFriends).catch(() => {}); }}>Cancel</button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <form onSubmit={sendRequest} style={{ marginTop: 12 }}>
                  <div className="field">
                    <label htmlFor="friendEmail">Add a friend by email</label>
                    <input id="friendEmail" type="email" value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} required />
                  </div>
                  {friendErr && <p className="error">{friendErr}</p>}
                  {friendMsg && <p className="muted">{friendMsg}</p>}
                  <button className="btn secondary" type="submit">Send request</button>
                </form>
              </>
            ) : <p className="muted">Loading…</p>}
          </>
        )}

        {session.signedIn && (
          <button className="btn secondary" style={{ marginTop: 28 }} onClick={() => session.signOut().then(() => nav('/'))}>Sign out</button>
        )}
      </div>
    </div>
  );
}
