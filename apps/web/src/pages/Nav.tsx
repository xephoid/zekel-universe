// The shell's bar, as the canvas draws it: the wordmark, Browse, My tables
// with a count of turns waiting, Designers, the search field, and who you
// are. The search runs on home; typing here lands there with the query.

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useSession } from '../session';
import { Avatar, Wordmark } from '../ui';

export function Nav() {
  const { displayName, signedIn, me } = useSession();
  const location = useLocation();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [waiting, setWaiting] = useState(0);

  useEffect(() => { setQuery(params.get('q') ?? ''); }, [params]);
  useEffect(() => {
    if (!me) return;
    let stop = false;
    api.myTables().then((r) => { if (!stop) setWaiting(r.tables.filter((t) => t.waitingOnMe && t.status !== 'finished').length); }).catch(() => {});
    return () => { stop = true; };
  }, [me, location.pathname]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    nav(q ? `/?q=${encodeURIComponent(q)}` : '/');
  }

  const onHome = location.pathname === '/';
  return (
    <nav className="topnav">
      <Link to="/" className="brand" aria-label="zekel home"><Wordmark size={24} /></Link>
      <div className="links">
        <Link to="/" className={onHome && !params.get('q') ? 'current' : undefined}>Browse</Link>
        <Link to="/#my-tables" className={undefined}>My tables{waiting > 0 && <span className="count" aria-label={`${waiting} waiting on you`}>{waiting}</span>}</Link>
        <Link to="/designers" className={location.pathname.startsWith('/designers') ? 'current' : undefined}>Designers</Link>
      </div>
      <form onSubmit={submit} className="search-form" style={{ display: 'contents' }}>
        <input
          type="search" className="search" placeholder="Search games, designers, tags" aria-label="Search games"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // On home the results follow the typing; elsewhere Enter takes you there.
            if (onHome) nav(e.target.value.trim() ? `/?q=${encodeURIComponent(e.target.value.trim())}` : '/', { replace: true });
          }}
        />
      </form>
      {signedIn ? (
        <Link to="/profile" className="who"><Avatar name={displayName || 'You'} size={32} />{displayName || 'Profile'}</Link>
      ) : (
        <>
          {displayName && <span className="who muted"><Avatar name={displayName} size={32} />{displayName}</span>}
          <Link to="/signin" className="who signin">Sign in</Link>
        </>
      )}
    </nav>
  );
}
