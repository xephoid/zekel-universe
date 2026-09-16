import { Link, useParams } from 'react-router-dom';
import type { GameTable } from '@universe/shared';
import { useEffect, useState } from 'react';
import { api } from '../api';

export function EndPage() {
  const { id = '' } = useParams();
  const [table, setTable] = useState<GameTable | null>(null);
  useEffect(() => { api.table(id).then(setTable).catch(() => {}); }, [id]);

  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 64 }}>
      <h1>Game over</h1>
      <p style={{ color: 'var(--fg-muted)' }}>
        {table ? `${table.gameId} finished` : '…'} — the final table stays visible behind this panel in the client.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
        <Link className="btn" style={{ textDecoration: 'none' }} to={`/games/${table?.gameId ?? ''}/setup`}>Play again</Link>
        <button className="btn secondary" onClick={() => navigator.clipboard.writeText(window.location.href)}>Share the result</button>
        <Link className="btn secondary" style={{ textDecoration: 'none' }} to={`/games/${table?.gameId ?? ''}`}>Back to the game page</Link>
      </div>
    </div>
  );
}
