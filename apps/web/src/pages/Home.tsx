import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameCatalogEntry, GameTable } from '@universe/shared';
import { api } from '../api';

export function HomePage() {
  const [games, setGames] = useState<GameCatalogEntry[]>([]);
  const [myTables, setMyTables] = useState<GameTable[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.games().then(setGames).catch((e) => setErr(String(e)));
    api.myTables().then(setMyTables).catch(() => {}); // guests may have none
  }, []);

  const featured = games.filter((g) => g.visibility === 'public').slice(0, 4);
  const newest = [...games].reverse().slice(0, 6);

  return (
    <div>
      <Nav />
      <div className="page">
        {err && <p style={{ color: 'var(--danger)' }}>Server not reachable: {err}</p>}
        {myTables.length > 0 && (
          <>
            <h2>My tables</h2>
            <div className="cards" style={{ marginBottom: 24 }}>
              {myTables.map((t) => (
                <div key={t.id} className="game-card">
                  <strong>{t.gameId}</strong> — {t.status}
                  <br />
                  <Link to={t.status === 'lobby' ? `/table/${t.id}/lobby` : `/table/${t.id}`}>Open</Link>
                </div>
              ))}
            </div>
          </>
        )}
        <h2>Featured</h2>
        <GameRow games={featured} />
        <h2>Newest</h2>
        <GameRow games={newest} />
      </div>
    </div>
  );
}

function GameRow({ games }: { games: GameCatalogEntry[] }) {
  return (
    <div className="cards">
      {games.map((g) => (
        <Link key={g.engineGameId} to={`/games/${g.engineGameId}`} className="game-card" style={{ textDecoration: 'none', color: 'inherit' }}>
          {g.coverImage && <img src={g.coverImage} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)' }} />}
          <strong>{g.name}</strong>
          <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
            {g.designerName} · {g.playerCount} · {g.playTime}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function Nav() {
  return (
    <nav className="topnav">
      <Link to="/" className="brand">zekel</Link>
      <Link to="/gallery">Gallery</Link>
      <Link to="/profile">Profile</Link>
      <Link to="/signin">Sign in</Link>
    </nav>
  );
}
