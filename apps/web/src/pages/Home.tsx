import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameCatalogEntry, TableSummary } from '@universe/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';

export function HomePage() {
  const session = useSession();
  const [games, setGames] = useState<GameCatalogEntry[]>([]);
  const [myTables, setMyTables] = useState<TableSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.games().then((r) => setGames(r.games)).catch((e) => setErr(String((e as Error).message)));
  }, []);
  useEffect(() => {
    if (!session.me) return;
    api.myTables().then((r) => setMyTables(r.tables)).catch(() => {});
  }, [session.me]);

  const featured = games.filter((g) => g.visibility === 'public' && g.designerName).slice(0, 4);
  const newest = [...games].reverse().slice(0, 6);
  const open = myTables.filter((t) => t.status !== 'finished');
  const waiting = open.filter((t) => t.waitingOnMe);

  return (
    <div>
      <Nav />
      <div className="page">
        {err && <p className="error">The server is not reachable: {err}</p>}
        {open.length > 0 && (
          <>
            <h2>My tables</h2>
            {waiting.length > 0 && <p className="muted">{waiting.length === 1 ? 'One table is waiting on you.' : `${waiting.length} tables are waiting on you.`}</p>}
            <div className="cards" style={{ marginBottom: 24 }}>
              {open.map((t) => (
                <Link key={t.id} className="game-card" to={t.status === 'lobby' ? `/table/${t.id}/lobby` : `/table/${t.id}`}>
                  <strong>{t.gameName}</strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t.status === 'lobby' ? 'In the lobby' : t.mode === 'turns' ? 'By turns' : 'Live'}
                    {t.waitingOnMe && <> · <span className="badge">your move</span></>}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
        <h2>Featured</h2>
        <GameRow games={featured.length ? featured : games.slice(0, 4)} />
        <h2 style={{ marginTop: 24 }}>Newest</h2>
        <GameRow games={newest} />
        <h2 style={{ marginTop: 24 }}>All games</h2>
        <GameRow games={games} />
      </div>
    </div>
  );
}

function GameRow({ games }: { games: GameCatalogEntry[] }) {
  if (games.length === 0) return <p className="muted">No games yet.</p>;
  return (
    <div className="cards">
      {games.map((g) => (
        <Link key={g.engineGameId} to={`/games/${g.engineGameId}`} className="game-card">
          {g.coverImage ? <img src={g.coverImage} alt="" className="cover" style={{ objectFit: 'cover' }} /> : <div className="cover">{g.name}</div>}
          <strong>{g.name}</strong>
          <div className="muted" style={{ fontSize: 13 }}>
            {g.designerName ? `${g.designerName} · ` : ''}{g.playerCount} players{g.playTime ? ` · ${g.playTime}` : ''}
          </div>
        </Link>
      ))}
    </div>
  );
}
