// Home: My tables first when a player has one waiting, then the featured
// games, the newest, the designers' updates in one feed, and browsing by
// player count, play time and tag, with search. The catalog is small, so
// browsing and search run in the browser over the list the server sent.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameCatalogEntry, GameUpdate, TableSummary } from '@universe/shared';
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

/** One designer update, on home and on the game and designer pages. */
export function UpdateCard({ u, showGame = true }: { u: GameUpdate; showGame?: boolean }) {
  const when = new Date(u.postedAt);
  return (
    <article className="update-card">
      <div className="muted card-sub small">
        {showGame && <Link to={`/games/${u.gameId}`}>{u.gameName}</Link>}
        {showGame && ' · '}
        <time dateTime={u.postedAt}>{Number.isNaN(when.getTime()) ? u.postedAt : when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
      </div>
      <h3 className="card-title">{u.title}</h3>
      <p className="card-blurb">{u.body}</p>
    </article>
  );
}

/** Play time buckets for browsing, from the catalog's "10–20 min" strings. */
function timeBucket(playTime: string): 'short' | 'medium' | 'long' | null {
  const m = /(\d+)\s*(?:–|-|to)?\s*(\d+)?\s*min/.exec(playTime);
  if (!m) return null;
  const top = Number(m[2] ?? m[1]);
  if (top <= 30) return 'short';
  if (top <= 60) return 'medium';
  return 'long';
}

const TIME_LABEL = { short: 'Up to 30 min', medium: '30–60 min', long: 'Over an hour' } as const;

function GameCard({ g, featured }: { g: GameCatalogEntry; featured?: boolean }) {
  return (
    <Link to={`/games/${g.engineGameId}`} className={`game-card ${featured ? 'featured-card' : 'newest-card'}`}>
      <Cover game={g} size={featured ? 'large' : 'small'} />
      <div className="card-body">
        <div className={`card-title${featured ? '' : ' small'}`}>{g.name}</div>
        <div className={`muted card-sub${featured ? '' : ' small'}`}>{g.designerName ? `by ${g.designerName} · ` : ''}{g.playerCount} players{g.playTime ? ` · ${g.playTime}` : ''}</div>
        {featured && g.description && <div className="card-blurb">{g.description}</div>}
      </div>
    </Link>
  );
}

export function HomePage() {
  const session = useSession();
  const [games, setGames] = useState<GameCatalogEntry[]>([]);
  const [updates, setUpdates] = useState<GameUpdate[]>([]);
  const [myTables, setMyTables] = useState<TableSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<'' | '1' | '2' | '3+'>('');
  const [time, setTime] = useState<'' | 'short' | 'medium' | 'long'>('');
  const [tag, setTag] = useState('');

  useEffect(() => {
    api.games().then((r) => setGames(r.games)).catch((e) => setErr(String((e as Error).message)));
    api.updates(12).then((r) => setUpdates(r.updates)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!session.me) return;
    api.myTables().then((r) => setMyTables(r.tables)).catch(() => {});
  }, [session.me]);

  const publicGames = games.filter((g) => g.visibility !== 'unlisted');
  const featured = publicGames.filter((g) => g.designerName).slice(0, 2);
  const newest = [...publicGames].slice(-8).reverse();
  const tags = useMemo(() => [...new Set(publicGames.flatMap((g) => g.tags))].sort(), [publicGames]);
  const browsing = query.trim() !== '' || players !== '' || time !== '' || tag !== '';
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    return publicGames.filter((g) => {
      if (q && !`${g.name} ${g.designerName} ${g.description} ${g.tags.join(' ')}`.toLowerCase().includes(q)) return false;
      if (players === '1' && g.minPlayers > 1) return false;
      if (players === '2' && (g.minPlayers > 2 || g.maxPlayers < 2)) return false;
      if (players === '3+' && g.maxPlayers < 3) return false;
      if (time && timeBucket(g.playTime) !== time) return false;
      if (tag && !g.tags.includes(tag)) return false;
      return true;
    });
  }, [publicGames, query, players, time, tag]);

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

        <section className="browse" aria-label="Browse games">
          <div className="browse-row">
            <input
              type="search" className="search" placeholder="Search games, designers, tags" aria-label="Search games"
              value={query} onChange={(e) => setQuery(e.target.value)}
            />
            <select aria-label="Players" value={players} onChange={(e) => setPlayers(e.target.value as typeof players)}>
              <option value="">Any players</option>
              <option value="1">Solo</option>
              <option value="2">Two players</option>
              <option value="3+">Three or more</option>
            </select>
            <select aria-label="Play time" value={time} onChange={(e) => setTime(e.target.value as typeof time)}>
              <option value="">Any length</option>
              {(['short', 'medium', 'long'] as const).map((t) => <option key={t} value={t}>{TIME_LABEL[t]}</option>)}
            </select>
            <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Any tag</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {browsing && <button className="btn secondary small" onClick={() => { setQuery(''); setPlayers(''); setTime(''); setTag(''); }}>Clear</button>}
          </div>
          {browsing && (
            <div className="row-head" style={{ marginTop: 12 }}>
              <h2>{found.length === 0 ? 'No games match' : found.length === 1 ? 'One game' : `${found.length} games`}</h2>
            </div>
          )}
          {browsing && found.length > 0 && (
            <div className="newest-grid">{found.map((g) => <GameCard key={g.engineGameId} g={g} />)}</div>
          )}
        </section>

        {!browsing && (featured.length > 0 || publicGames.length > 0) && (
          <section>
            <div className="row-head"><h2>Featured</h2></div>
            <div className="featured-grid">
              {(featured.length ? featured : publicGames.slice(0, 2)).map((g) => <GameCard key={g.engineGameId} g={g} featured />)}
            </div>
          </section>
        )}
        {!browsing && (
          <section>
            <div className="row-head"><h2>Newest</h2></div>
            {newest.length === 0 ? <p className="muted">No games yet.</p> : (
              <div className="newest-grid">{newest.map((g) => <GameCard key={g.engineGameId} g={g} />)}</div>
            )}
          </section>
        )}
        {!browsing && updates.length > 0 && (
          <section>
            <div className="row-head"><h2>Updates</h2><span className="muted">From the designers</span></div>
            <div className="updates">{updates.map((u) => <UpdateCard key={u.id} u={u} />)}</div>
          </section>
        )}
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
