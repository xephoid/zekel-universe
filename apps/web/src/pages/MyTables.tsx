// My tables: every table of yours and nothing else, the ones waiting on
// you first. A table you host alone (against the AI, or a lobby nobody
// joined) can be deleted here; a table with another person at it cannot,
// since it is theirs too.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { GameCatalogEntry, TableSummary } from '@universe/shared';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { Cover, whenLabel } from '../ui';

type Group = { title: string; tables: TableSummary[] };

export function MyTablesPage() {
  const session = useSession();
  const [tables, setTables] = useState<TableSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!session.me) return;
    api.myTables().then((r) => setTables(r.tables)).catch((e) => setErr(e instanceof ApiRequestError ? e.message : (e as Error).message));
  }, [session.me]);

  async function remove(t: TableSummary) {
    setBusy(t.id); setErr(null);
    try {
      await api.deleteTable(t.id);
      setTables((list) => (list ?? []).filter((x) => x.id !== t.id));
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : (e as Error).message);
    } finally {
      setBusy(null); setConfirm(null);
    }
  }

  const all = tables ?? [];
  const groups: Group[] = [
    { title: 'Your move', tables: all.filter((t) => t.status === 'playing' && t.waitingOnMe) },
    { title: 'In progress', tables: all.filter((t) => t.status === 'playing' && !t.waitingOnMe) },
    { title: 'In the lobby', tables: all.filter((t) => t.status === 'lobby') },
    { title: 'Finished', tables: all.filter((t) => t.status === 'finished') },
  ].filter((g) => g.tables.length > 0);

  return (
    <div>
      <Nav />
      <div className="page narrow stack loose" style={{ maxWidth: 860 }}>
        <div>
          <h1>My tables</h1>
          <p className="muted" style={{ fontSize: 15, marginTop: 6 }}>
            {tables === null ? 'Loading…' : all.length === 0 ? 'No tables yet.' : `${all.length} table${all.length === 1 ? '' : 's'}. A table you host alone can be deleted; one with a friend at it is theirs too.`}
          </p>
        </div>
        {err && <p className="error" role="alert">{err}</p>}
        {tables !== null && all.length === 0 && <p><Link to="/" className="btn">Browse the games</Link></p>}
        {groups.map((g) => (
          <section key={g.title} aria-label={g.title}>
            <div className="row-head"><h2 style={{ fontSize: 22 }}>{g.title}</h2><span className="muted" style={{ fontSize: 13 }}>{g.tables.length}</span></div>
            <div className="stack" style={{ gap: 10 }}>
              {g.tables.map((t) => {
                const game: GameCatalogEntry = { engineGameId: t.gameId, name: t.gameName } as GameCatalogEntry;
                const to = t.status === 'lobby' ? `/table/${t.id}/lobby` : `/table/${t.id}`;
                const asking = confirm === t.id;
                return (
                  <div key={t.id} className="card lined seat-card table-row" data-table-id={t.id}>
                    <Cover game={game} size="tile" />
                    <div className="grow">
                      <div className="name" style={{ fontSize: 15, fontFamily: 'var(--font-display)', fontWeight: 700 }}>{t.gameName}</div>
                      <div className="sub">
                        {t.status === 'lobby' ? 'In the lobby' : t.status === 'finished' ? 'Finished' : t.mode === 'turns' ? 'By turns' : 'Live'}
                        {' · '}{t.hostIsMe ? 'you host' : 'a friend hosts'}
                        {' · '}started {whenLabel(t.createdAt)}
                      </div>
                    </div>
                    {t.waitingOnMe && <span className="badge">Your move</span>}
                    {asking ? (
                      <span className="inline-row" style={{ alignItems: 'center', gap: 6 }}>
                        <span className="muted" style={{ fontSize: 13 }}>Delete this table?</span>
                        <button className="btn small" style={{ background: 'var(--danger)', boxShadow: 'none' }} disabled={busy === t.id} onClick={() => void remove(t)}>{busy === t.id ? 'Deleting…' : 'Yes, delete'}</button>
                        <button className="btn small quiet" onClick={() => setConfirm(null)}>Keep it</button>
                      </span>
                    ) : (
                      <>
                        <Link className="btn small secondary" to={to}>{t.waitingOnMe ? 'Take your turn' : t.status === 'lobby' ? 'Open the lobby' : t.status === 'finished' ? 'See the result' : 'Open the table'}</Link>
                        {t.deletable && <button className="btn small quiet" aria-label={`Delete ${t.gameName}`} onClick={() => setConfirm(t.id)}>Delete</button>}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
