// The rules, as the engine states them, on their own page so a game page
// can link to them (and a designer may also link a rulebook elsewhere).

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GameCatalogEntry, GameReferenceResponse } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { Nav } from './Nav';

export function RulesPage() {
  const { id = '' } = useParams();
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [reference, setReference] = useState<GameReferenceResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.game(id).then((r) => setGame(r.game)).catch((e) => setErr(e instanceof ApiRequestError ? e.message : (e as Error).message));
    api.reference(id).then(setReference).catch((e) => setErr(e instanceof ApiRequestError ? e.message : (e as Error).message));
  }, [id]);

  return (
    <div>
      <Nav />
      <div className="page narrow stack" style={{ paddingTop: 28 }}>
        <Link to={`/games/${id}`} className="crumb">‹ {game?.name ?? 'The game'}</Link>
        <h1>{game ? `${game.name}: the rules` : 'The rules'}</h1>
        {err && <p className="error">{err}</p>}
        {game?.rulesUrl && <p><a href={game.rulesUrl} target="_blank" rel="noreferrer">The printed rulebook</a></p>}
        {reference ? (
          <div className="rules-text">{reference.rules}</div>
        ) : !err ? <p className="muted">Loading…</p> : null}
        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>These rules are the engine's own text: the same rules the table enforces.</p>
      </div>
    </div>
  );
}
