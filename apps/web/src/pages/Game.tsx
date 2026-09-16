import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameCatalogEntry, GameReferenceResponse } from '@universe/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { Cover } from './Home';

export function GamePage() {
  const { id = '' } = useParams();
  const session = useSession();
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.game(id).then((r) => setGame(r.game)).catch((e) => setErr((e as Error).message));
    api.reference(id).then(setReference).catch(() => setReference(null));
  }, [id]);

  if (err) return (<div><Nav /><div className="page"><p className="error">{err}</p></div></div>);
  if (!game) return (<div><Nav /><div className="page"><p className="muted">Loading…</p></div></div>);

  const friendsHref = session.signedIn
    ? `/games/${game.engineGameId}/setup?friends=1`
    : `/signin?next=${encodeURIComponent(`/games/${game.engineGameId}/setup?friends=1`)}`;

  return (
    <div>
      <Nav />
      <div className="page">
        <Link to="/" className="muted" style={{ fontSize: 13 }}>‹ Browse</Link>
        <div className="game-hero">
          <div className="game-hero-left">
            <Cover game={game} size="large" />
          </div>
          <div className="game-hero-right">
            <h1>{game.name}</h1>
            <p className="muted">
              {game.designerName ? <>by {game.designerName} · </> : null}{game.playerCount} players{game.playTime ? ` · ${game.playTime}` : ''}
            </p>
            {game.tags.length > 0 && (
              <div className="chip-row">{game.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>
            )}
            <p className="game-desc">{game.description}</p>
            <div className="game-actions">
              {game.supportsAi && <Link to={`/games/${game.engineGameId}/setup`} className="btn big pressable">Play now</Link>}
              {game.maxPlayers >= 2 && <Link to={friendsHref} className="btn secondary big">Play with friends</Link>}
            </div>
            <p className="muted" style={{ fontSize: 13 }}>Play now starts a table against the AI right away. No account needed.</p>
            {game.rulesUrl && <p><a href={game.rulesUrl} target="_blank" rel="noreferrer">Read the rules</a></p>}
          </div>
        </div>
        {reference && (
          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-display)' }}>The rules</summary>
            <div className="rules-text" style={{ marginTop: 8 }}>{reference.rules}</div>
          </details>
        )}
        <h2 style={{ marginTop: 28 }}>Updates from {game.designerName || 'the designer'}</h2>
        <p className="muted">No updates yet.</p>
      </div>
    </div>
  );
}
