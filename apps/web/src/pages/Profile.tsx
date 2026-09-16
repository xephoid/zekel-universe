import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { TableSummary } from '@universe/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';

export function ProfilePage() {
  const session = useSession();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setName(session.displayName); }, [session.displayName]);
  useEffect(() => {
    if (!session.me) return;
    api.myTables().then((r) => setTables(r.tables)).catch(() => {});
  }, [session.me]);

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

        <h2 style={{ marginTop: 28 }}>Friends</h2>
        <p className="muted">Friends, requests and invitations arrive with the friends milestone. Until then, share a lobby link.</p>

        {session.signedIn && (
          <button className="btn secondary" style={{ marginTop: 28 }} onClick={() => session.signOut().then(() => nav('/'))}>Sign out</button>
        )}
      </div>
    </div>
  );
}
