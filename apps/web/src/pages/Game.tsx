import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameCatalogEntry, GameReferenceResponse } from '@universe/shared';
import { api } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';

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
        {game.coverImage
          ? <img src={game.coverImage} alt="" style={{ maxWidth: 480, borderRadius: 'var(--radius-lg)' }} />
          : <div className="cover" style={{ maxWidth: 480, aspectRatio: '16/9', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(135deg, var(--brand-green), var(--brand-orange))', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 34 }}>{game.name}</div>}
        <h1 style={{ marginTop: 16 }}>{game.name}</h1>
        <p className="muted">
          {game.designerName ? <>by {game.designerName} · </> : null}{game.playerCount} players{game.playTime ? ` · ${game.playTime}` : ''}
        </p>
        <p>{game.description}</p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {game.supportsAi && <Link to={`/games/${game.engineGameId}/setup`} className="btn big">Play now</Link>}
          {game.maxPlayers >= 2 && <Link to={friendsHref} className="btn secondary big">Play with friends</Link>}
        </div>
        {game.rulesUrl && <p style={{ marginTop: 16 }}><a href={game.rulesUrl} target="_blank" rel="noreferrer">Read the rules</a></p>}
        {reference && (
          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-display)' }}>The rules</summary>
            <div className="rules-text" style={{ marginTop: 8 }}>{reference.rules}</div>
          </details>
        )}
        <h2 style={{ marginTop: 28 }}>Updates</h2>
        <p className="muted">No updates from the designer yet.</p>
      </div>
    </div>
  );
}
