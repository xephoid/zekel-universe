// Home, as the canvas draws it: My tables first when a turn is pending
// (the hero card, the others, invitations), then Featured, Newest with its
// filter chips, and the designers' updates in the right column. The search
// field lives in the bar; a query lands here and browsing takes the page.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { GameCatalogEntry, GameUpdate, TableInvite, TableSummary } from '@universe/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { Cover, hashHue, playersLabel, whenLabel } from '../ui';

export { Cover } from '../ui';

/** One designer update in the feed: the game's tile, who · game · when, the text. */
export function FeedItem({ u }: { u: GameUpdate }) {
  const hue = hashHue(u.gameId);
  return (
    <article className="feed-item update-card">
      <div className="tile" style={{ background: `hsl(${hue}, 46%, 52%)`, color: `hsl(${hue}, 46%, 96%)` }}>{u.gameName.slice(0, 1)}</div>
      <div style={{ minWidth: 0 }}>
        <div className="meta"><b>Zekel Games</b> · <Link to={`/games/${u.gameId}`}>{u.gameName}</Link> · <time dateTime={u.postedAt}>{whenLabel(u.postedAt)}</time></div>
        <div className="text"><b style={{ fontWeight: 600 }}>{u.title}.</b> {u.body}</div>
      </div>
    </article>
  );
}

/** One devlog entry: the date in its own column, then the title and the text. */
export function DevlogItem({ u }: { u: GameUpdate }) {
  const when = new Date(u.postedAt);
  return (
    <article className="devlog-item update-card">
      <div className="when"><time dateTime={u.postedAt}>{Number.isNaN(when.getTime()) ? u.postedAt : when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</time></div>
      <div>
        <h3 className="title">{u.title}</h3>
        <div className="text">{u.body}</div>
      </div>
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
    <Link to={`/games/${g.engineGameId}`} className={`card game-card ${featured ? 'featured-card' : 'newest-card'}`}>
      <Cover game={g} size={featured ? 'large' : 'small'} />
      <div className="card-body">
        <div className={`card-title${featured ? '' : ' small'}`}>{g.name}</div>
        {featured
          ? <div className="muted card-sub">{g.designerName ? `by ${g.designerName} · ` : ''}{playersLabel(g.playerCount)}{g.playTime ? ` · ${g.playTime}` : ''}</div>
          : <>
            <div className="muted card-sub small">{g.designerName ? `by ${g.designerName}` : ' '}</div>
            <div className="muted card-sub small">{playersLabel(g.playerCount)}{g.playTime ? ` · ${g.playTime}` : ''}</div>
          </>}
        {featured && g.description && <div className="card-blurb">{g.description}</div>}
      </div>
    </Link>
  );
}

function MyTableCard({ t, hero, others }: { t: TableSummary; hero?: boolean; others: string }) {
  const to = t.status === 'lobby' ? `/table/${t.id}/lobby` : `/table/${t.id}`;
  const game: GameCatalogEntry = { engineGameId: t.gameId, name: t.gameName } as GameCatalogEntry;
  const status = t.status === 'lobby' ? 'In the lobby' : t.waitingOnMe ? 'Your move' : 'In progress';
  return (
    <Link className={`card my-card${hero ? ' hero' : ''}`} to={to}>
      <Cover game={game} size="tile" />
      <div className="my-body">
        {t.waitingOnMe ? <span className="badge">Your move</span> : <span className="muted small">{status}</span>}
        <div className="card-title">{t.gameName}</div>
        <div className="muted card-sub small">{others}{others ? ' · ' : ''}{t.mode === 'turns' ? 'by turns' : 'live'}</div>
      </div>
      {hero && t.waitingOnMe && <div className="my-action">Take your turn</div>}
    </Link>
  );
}

export function HomePage() {
  const session = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [games, setGames] = useState<GameCatalogEntry[]>([]);
  const [updates, setUpdates] = useState<GameUpdate[]>([]);
  const [myTables, setMyTables] = useState<TableSummary[]>([]);
  const [invites, setInvites] = useState<TableInvite[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [players, setPlayers] = useState<'' | '1' | '2' | '3+'>('');
  const [time, setTime] = useState<'' | 'short' | 'medium' | 'long'>('');
  const [tag, setTag] = useState('');
  const query = params.get('q') ?? '';

  useEffect(() => {
    api.games().then((r) => setGames(r.games)).catch((e) => setErr(String((e as Error).message)));
    api.updates(8).then((r) => setUpdates(r.updates)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!session.me) return;
    api.myTables().then((r) => setMyTables(r.tables)).catch(() => {});
    if (session.signedIn) api.invites().then((r) => setInvites(r.invites.filter((i) => i.status === 'pending'))).catch(() => {});
  }, [session.me, session.signedIn]);

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
  const clear = () => { setPlayers(''); setTime(''); setTag(''); if (query) nav('/'); };

  const open = myTables.filter((t) => t.status !== 'finished');
  const sorted = [...open].sort((a, b) => Number(b.waitingOnMe) - Number(a.waitingOnMe));
  const [first, ...rest] = sorted;
  const waiting = open.filter((t) => t.waitingOnMe).length;

  async function answerInvite(i: TableInvite, accept: boolean) {
    try {
      if (accept) { const r = await api.acceptInvite(i.id); nav(`/table/${r.tableId}/lobby`); return; }
      await api.declineInvite(i.id);
    } catch { /* stale invite */ }
    setInvites((list) => list.filter((x) => x.id !== i.id));
  }

  const filters = (
    <div className="filters">
      <select className={`chip-select${players ? ' on' : ''}`} aria-label="Players" value={players} onChange={(e) => setPlayers(e.target.value as typeof players)}>
        <option value="">Players</option>
        <option value="1">Solo</option>
        <option value="2">Two players</option>
        <option value="3+">Three or more</option>
      </select>
      <select className={`chip-select${time ? ' on' : ''}`} aria-label="Play time" value={time} onChange={(e) => setTime(e.target.value as typeof time)}>
        <option value="">Play time</option>
        {(['short', 'medium', 'long'] as const).map((t) => <option key={t} value={t}>{TIME_LABEL[t]}</option>)}
      </select>
      <select className={`chip-select${tag ? ' on' : ''}`} aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
        <option value="">Tag</option>
        {tags.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      {browsing && <button className="btn small secondary" onClick={clear}>Clear</button>}
    </div>
  );

  return (
    <div>
      <Nav />
      <div className="page stack loose">
        {err && <p className="error">The server is not reachable: {err}</p>}
        {(first || invites.length > 0) && (
          <section className="my-tables" id="my-tables">
            <div className="row-head">
              <h2>My tables</h2>
              {waiting > 0 && <span className="muted small" style={{ fontSize: 13 }}>{waiting === 1 ? 'One is waiting on you.' : `${waiting} are waiting on you.`}</span>}
            </div>
            <div className="my-tables-grid">
              {first && <MyTableCard t={first} hero others="" />}
              {rest.map((t) => <MyTableCard key={t.id} t={t} others="" />)}
              {invites.map((i) => {
                const hue = hashHue(i.tableId);
                return (
                  <div key={i.id} className="card lined my-card">
                    <div className="gpcover tile" style={{ background: `hsl(${hue}, 46%, 52%)`, width: 56, height: 56 }}><span className="initial" style={{ fontSize: 24, color: `hsl(${hue}, 46%, 96%)` }}>{i.gameName.slice(0, 1)}</span></div>
                    <div className="my-body">
                      <span className="muted small">Invitation from {i.fromDisplayName}</span>
                      <div className="card-title" style={{ fontSize: 15 }}>{i.gameName}</div>
                      <div className="invite-actions">
                        <button onClick={() => void answerInvite(i, true)}>Join</button>
                        <span className="muted">·</span>
                        <button className="quiet" onClick={() => void answerInvite(i, false)}>Decline</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {browsing ? (
          <section className="browse" aria-label="Browse games">
            <div className="row-head">
              <h2>{found.length === 0 ? 'No games match' : found.length === 1 ? 'One game' : `${found.length} games`}</h2>
              {query && <span className="muted" style={{ fontSize: 13 }}>for “{query}”</span>}
              {filters}
            </div>
            {found.length > 0 && <div className="newest-grid">{found.map((g) => <GameCard key={g.engineGameId} g={g} />)}</div>}
          </section>
        ) : (
          <div className="two-col">
            <div className="stack" style={{ gap: 36, minWidth: 0 }}>
              {(featured.length > 0 || publicGames.length > 0) && (
                <section>
                  <div className="row-head"><h2>Featured</h2></div>
                  <div className="featured-grid">
                    {(featured.length ? featured : publicGames.slice(0, 2)).map((g) => <GameCard key={g.engineGameId} g={g} featured />)}
                  </div>
                </section>
              )}
              <section className="browse" aria-label="Browse games">
                <div className="row-head"><h2>Newest</h2>{filters}</div>
                {newest.length === 0 ? <p className="muted">No games yet.</p> : (
                  <div className="newest-grid">{newest.map((g) => <GameCard key={g.engineGameId} g={g} />)}</div>
                )}
              </section>
            </div>
            <aside className="feed" aria-label="Updates">
              <h2>Updates</h2>
              {updates.length === 0 ? <p className="muted">No updates yet.</p> : updates.map((u) => <FeedItem key={u.id} u={u} />)}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
