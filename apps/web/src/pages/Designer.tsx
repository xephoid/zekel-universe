// The designers' place: a profile per designer (their games and updates),
// and the list page the navigation points at. Publishing a game here is
// later work; the brief leaves it a place in the navigation and no more.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DesignerResponse } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { Nav } from './Nav';
import { Cover, UpdateCard } from './Home';

export function DesignersPage() {
  return (
    <div>
      <Nav />
      <div className="page" style={{ maxWidth: 720 }}>
        <h1>Designers</h1>
        <p className="muted">The people whose games are on the table here.</p>
        <ul className="plain-list">
          <li><Link to="/designers/zekel-games" className="card-title">Zekel Games</Link></li>
        </ul>
        <h2 style={{ marginTop: 28 }}>Publishing your own game</h2>
        <p className="muted">A game runs here once it runs on the open zekel engine. Uploading and testing a game from this site is coming; for now the engine's repository is the door.</p>
      </div>
    </div>
  );
}

export function DesignerPage() {
  const { slug = '' } = useParams();
  const [data, setData] = useState<DesignerResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.designer(slug).then(setData).catch((e) => setErr(e instanceof ApiRequestError ? e.message : (e as Error).message));
  }, [slug]);

  if (err) return (<div><Nav /><div className="page"><p className="error">{err}</p></div></div>);
  if (!data) return (<div><Nav /><div className="page"><p className="muted">Loading…</p></div></div>);

  return (
    <div>
      <Nav />
      <div className="page">
        <Link to="/designers" className="muted" style={{ fontSize: 13 }}>‹ Designers</Link>
        <h1>{data.designer.name}</h1>
        <p className="game-desc" style={{ maxWidth: 640 }}>{data.designer.bio}</p>
        <section>
          <div className="row-head"><h2>Games</h2></div>
          <div className="newest-grid">
            {data.games.map((g) => (
              <Link key={g.engineGameId} to={`/games/${g.engineGameId}`} className="game-card newest-card">
                <Cover game={g} size="small" />
                <div className="card-body">
                  <div className="card-title small">{g.name}</div>
                  <div className="muted card-sub small">{g.playerCount} players{g.playTime ? ` · ${g.playTime}` : ''}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section>
          <div className="row-head"><h2>Updates</h2></div>
          {data.updates.length === 0 ? <p className="muted">No updates yet.</p> : (
            <div className="updates">{data.updates.map((u) => <UpdateCard key={u.id} u={u} />)}</div>
          )}
        </section>
      </div>
    </div>
  );
}
