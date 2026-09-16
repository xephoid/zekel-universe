import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameCatalogEntry, TableSummary } from '@universe/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';

/** Flat placeholder cover from the canvas: one colored field, giant initial. */
export function Cover({ game, size = 'large' }: { game: GameCatalogEntry; size?: 'large' | 'small' }) {
  if (game.coverImage) return <img src={game.coverImage} alt="" className={`gpcover ${size}`} />;
  const hue = hashHue(game.engineGameId);
  return (
    <div className={`gpcover ${size}`} style={{ background: `hsl(${hue}, 46%, 52%)` }}>
      <span className="initial" style={{ color: `hsl(${hue}, 46%, 96%)` }}>{game.name.slice(0, 1)}</span>
      <span className="tag" style={{ color: `hsl(${hue}, 46%, 92%)` }}>cover art</span>
    </div>
  );
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

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

  const publicGames = games.filter((g) => g.visibility !== 'unlisted');
  const featured = publicGames.filter((g) => g.designerName).slice(0, 2);
  const newest = [...publicGames].slice(-8).reverse();
  const open = myTables.filter((t) => t.status !== 'finished');
  const [first, ...rest] = open;

  return (
    <div>
      <Nav />
      <div className="page">
        {err && <p className="error">The server is not reachable: {err}</p>}
        {first && (
          <section className="my-tables">
            <div className="row-head">
              <h2>My tables</h2>
              {open.some((t) => t.waitingOnMe) && <span className="muted">{open.filter((t) => t.waitingOnMe).length === 1 ? 'One is waiting on you.' : `${open.filter((t) => t.waitingOnMe).length} are waiting on you.`}</span>}
            </div>
            <div className="my-tables-grid">
              <MyTableCard t={first} hero />
              {rest.map((t) => <MyTableCard key={t.id} t={t} />)}
            </div>
          </section>
        )}
        {(featured.length > 0 || publicGames.length > 0) && (
          <section>
            <div className="row-head"><h2>Featured</h2></div>
            <div className="featured-grid">
              {(featured.length ? featured : publicGames.slice(0, 2)).map((g) => (
                <Link key={g.engineGameId} to={`/games/${g.engineGameId}`} className="game-card featured-card">
                  <Cover game={g} />
                  <div className="card-body">
                    <div className="card-title">{g.name}</div>
                    <div className="muted card-sub">{g.designerName ? `by ${g.designerName} · ` : ''}{g.playerCount} players{g.playTime ? ` · ${g.playTime}` : ''}</div>
                    {g.description && <div className="card-blurb">{g.description}</div>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
        <section>
          <div className="row-head"><h2>Newest</h2></div>
          {newest.length === 0 ? <p className="muted">No games yet.</p> : (
            <div className="newest-grid">
              {newest.map((g) => (
                <Link key={g.engineGameId} to={`/games/${g.engineGameId}`} className="game-card newest-card">
                  <Cover game={g} size="small" />
                  <div className="card-body">
                    <div className="card-title small">{g.name}</div>
                    <div className="muted card-sub small">{g.designerName && `by ${g.designerName}`}</div>
                    <div className="muted card-sub small">{g.playerCount} players{g.playTime ? ` · ${g.playTime}` : ''}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function MyTableCard({ t, hero }: { t: TableSummary; hero?: boolean }) {
  const to = t.status === 'lobby' ? `/table/${t.id}/lobby` : `/table/${t.id}`;
  return (
    <Link className={`my-card${hero ? ' hero' : ''}${t.waitingOnMe ? ' waiting' : ''}`} to={to}>
      <div className="my-cover" style={{ background: `hsl(${hashHue(t.gameId)}, 46%, 52%)` }}>{t.gameName.slice(0, 1)}</div>
      <div className="my-body">
        {t.waitingOnMe && <span className="badge">Your move</span>}
        <div className="card-title">{t.gameName}</div>
        <div className="muted card-sub">
          {t.status === 'lobby' ? 'Waiting in the lobby' : t.mode === 'turns' ? 'By turns' : 'Live'}
        </div>
      </div>
      {t.waitingOnMe && <div className="my-action">Take your turn</div>}
    </Link>
  );
}
