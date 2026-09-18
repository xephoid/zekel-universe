// The game page, as the canvas draws it: the cover with four screenshot
// slots, the name, the designer (a link to their profile), the chips, the
// description, Play now and Play with friends, and the devlog below.

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameCatalogEntry, GameUpdate } from '@universe/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { DevlogItem } from './Home';
import { Cover, playersLabel } from '../ui';

export function GamePage() {
  const { id = '' } = useParams();
  const session = useSession();
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [updates, setUpdates] = useState<GameUpdate[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.game(id).then((r) => setGame(r.game)).catch((e) => setErr((e as Error).message));
    api.gameUpdates(id).then((r) => setUpdates(r.updates)).catch(() => setUpdates([]));
  }, [id]);

  if (err) return (<div><Nav /><div className="page"><p className="error">{err}</p></div></div>);
  if (!game) return (<div><Nav /><div className="page"><p className="muted">Loading…</p></div></div>);

  const friendsHref = session.signedIn
    ? `/games/${game.engineGameId}/setup?friends=1`
    : `/signin?next=${encodeURIComponent(`/games/${game.engineGameId}/setup?friends=1`)}`;

  return (
    <div>
      <Nav />
      <div className="page stack loose" style={{ paddingTop: 28 }}>
        <Link to="/" className="crumb">‹ Browse</Link>
        <div className="game-hero">
          <div className="game-hero-left">
            <Cover game={game} size="large" />
            <div className="shots" aria-label="Screenshots">
              {[1, 2, 3, 4].map((n) => <div key={n}>screenshot {n}</div>)}
            </div>
          </div>
          <div className="game-hero-right">
            <div>
              <h1>{game.name}</h1>
              <div className="byline">
                {game.designerName
                  ? <>by {game.designerSlug ? <Link to={`/designers/${game.designerSlug}`}>{game.designerName}</Link> : game.designerName}</>
                  : 'a game on the zekel engine'}
              </div>
            </div>
            <div className="chip-row">
              <span className="chip">{playersLabel(game.playerCount)}</span>
              {game.playTime && <span className="chip">{game.playTime}</span>}
              {game.tags.map((t) => <span key={t} className="chip">{t}</span>)}
            </div>
            <p className="game-desc">{game.description}</p>
            <div className="game-actions">
              {game.supportsAi && <Link to={`/games/${game.engineGameId}/setup`} className="btn big">Play now</Link>}
              {game.maxPlayers >= 2 && <Link to={friendsHref} className="btn big secondary">Play with friends</Link>}
            </div>
            <p className="note" style={{ fontSize: 13 }}>
              Play now starts a table against the AI right away. No account needed.{' '}
              <Link to={`/games/${game.engineGameId}/rules`}>Read the rules</Link>
              {game.rulesUrl && <> · <a href={game.rulesUrl} target="_blank" rel="noreferrer">The printed rulebook</a></>}
            </p>
          </div>
        </div>
        <div className="devlog">
          <h2>Updates from {game.designerName || 'the designer'}</h2>
          {updates === null ? <p className="muted">Loading…</p>
            : updates.length === 0 ? <p className="muted">No updates yet.</p>
            : updates.map((u) => <DevlogItem key={u.id} u={u} />)}
        </div>
      </div>
    </div>
  );
}
