import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameCatalogEntry } from '@universe/shared';
import { api } from '../api';
import { Nav } from './Home';

export function GamePage() {
  const { id = '' } = useParams();
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  useEffect(() => { api.game(id).then(setGame).catch(() => setGame(null)); }, [id]);

  if (!game) return (<div><Nav /><div className="page"><p>Loading…</p></div></div>);

  return (
    <div>
      <Nav />
      <div className="page">
        {game.coverImage && <img src={game.coverImage} alt="" style={{ maxWidth: 480, borderRadius: 'var(--radius-lg)' }} />}
        <h1>{game.name}</h1>
        <p style={{ color: 'var(--fg-muted)' }}>
          by {game.designerName} · {game.playerCount} · {game.playTime}
        </p>
        <p>{game.description}</p>
        {game.rulesUrl && <p><a href={game.rulesUrl} target="_blank" rel="noreferrer">Read the rules</a></p>}
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <Link to={`/games/${game.engineGameId}/setup`} className="btn big" style={{ textDecoration: 'none' }}>Play now</Link>
          <Link to="/signin" className="btn secondary big" style={{ textDecoration: 'none' }}>Play with friends</Link>
        </div>
      </div>
    </div>
  );
}
