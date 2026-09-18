// Sign-in, as the canvas draws it: a card over the page with the
// wordmark, the passwordless promise, the email row, and the guest escape
// hatch. Passwordless by email link only in v0.

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { Wordmark } from '../ui';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [params] = useSearchParams();
  const session = useSession();
  const next = params.get('next') ?? '/';
  const forFriends = /friends=1/.test(next);

  async function send() {
    setErr(null);
    try {
      await api.signInEmail(email);
      try { sessionStorage.setItem('universe:signin:next', next); } catch { /* ignore */ }
      setSent(true);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : String(e));
    }
  }

  return (
    <div>
      <Nav />
      <div className="page">
        <div className="card modal-card">
          <Wordmark size={28} />
          <div>
            <h1>{forFriends ? 'Sign in to play with friends' : 'Sign in'}</h1>
            <p className="muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
              No password. We email you a link; opening it signs you in{next !== '/' ? ' and brings you straight back' : ''}.
              {!session.signedIn && ' The games you played as a guest come with you.'}
            </p>
          </div>
          {session.signedIn && <p>You are signed in as <strong>{session.displayName}</strong>. <Link to="/profile">Profile</Link></p>}
          {sent ? (
            <p>Link sent to <strong>{email}</strong>. Check your inbox; the link works once and expires in 15 minutes.</p>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="stack" style={{ gap: 10 }}>
              <label htmlFor="email" className="label" style={{ fontSize: 13, fontWeight: 600 }}>Email</label>
              <div className="inline-row">
                <input id="email" className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                <button className="btn green" type="submit" style={{ whiteSpace: 'nowrap' }}>Email me a sign-in link</button>
              </div>
              {err && <p className="error">{err}</p>}
            </form>
          )}
          <p className="note">Just want to try it? <Link to="/">Play the AI as a guest</Link>, no account needed.</p>
        </div>
      </div>
    </div>
  );
}

/** The landing page of the emailed link: the token rides in the URL
 *  fragment, which browsers never send to any server, and is posted here. */
export function SignInCompletePage() {
  const nav = useNavigate();
  const session = useSession();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const token = new URLSearchParams(hash).get('token');
    if (!token) { setErr('This link is missing its token.'); return; }
    api.completeSignIn(token)
      .then(async () => {
        await session.refresh();
        let next = '/';
        try { next = sessionStorage.getItem('universe:signin:next') ?? '/'; } catch { /* ignore */ }
        nav(next.startsWith('/') ? next : '/', { replace: true });
      })
      .catch((e) => setErr(e instanceof ApiRequestError && e.status === 401
        ? 'This sign-in link is invalid or has expired. Ask for a new one.'
        : (e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Nav />
      <div className="page">
        <div className="card modal-card">
          <Wordmark size={28} />
          <h1>Signing you in…</h1>
          {err && <p className="error">{err} <Link to="/signin">Sign in</Link></p>}
        </div>
      </div>
    </div>
  );
}
