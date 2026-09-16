import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [params] = useSearchParams();
  const session = useSession();

  async function send() {
    setErr(null);
    try {
      await api.signInEmail(email);
      try { sessionStorage.setItem('universe:signin:next', params.get('next') ?? '/'); } catch { /* ignore */ }
      setSent(true);
    } catch (e) {
      setErr(e instanceof ApiRequestError ? e.message : String(e));
    }
  }

  return (
    <div>
      <Nav />
      <div className="page" style={{ maxWidth: 440 }}>
        <h1>Sign in</h1>
        <p className="muted">
          Passwordless. We email you a link; opening it signs you in. Playing
          against AI never needs an account{session.signedIn ? '' : ', and the games you played as a guest come with you'}.
        </p>
        {session.signedIn && <p>You are signed in as <strong>{session.displayName}</strong>. <Link to="/profile">Profile</Link></p>}
        {sent ? (
          <p>Link sent to <strong>{email}</strong>. Check your inbox; the link works once and expires in 15 minutes.</p>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {err && <p className="error">{err}</p>}
            <button className="btn" type="submit">Email me a sign-in link</button>
          </form>
        )}
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
      <div className="page" style={{ maxWidth: 440 }}>
        <h1>Signing you in…</h1>
        {err && <p className="error">{err} <Link to="/signin">Sign in</Link></p>}
      </div>
    </div>
  );
}
