// Sign-in, as the canvas draws it: a card over the page with the
// wordmark, the passwordless promise, the email row, and the guest escape
// hatch. Passwordless by email link only in v0.

import { useEffect, useRef, useState } from 'react';
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
            <p>Link sent to <strong>{email}</strong>. Open it in this browser: it works once, only here, and expires in 15 minutes.</p>
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

/** What the landing page says when the server refuses the link. The link
 *  works once, and only in the browser that asked for it (the server checks
 *  a cookie set when the link was asked for); a refusal never signs this
 *  browser in or moves its guest games. */
export function signInFailureMessage(e: unknown): string {
  if (e instanceof ApiRequestError && e.status === 401) {
    return 'This sign-in link is invalid or has expired. A link works once, and only in the browser where you asked for it. Ask for a new one here.';
  }
  return (e as Error).message;
}

const RETRY_MESSAGE = 'We could not reach the server to finish signing you in. Check your connection and try again.';

type Outcome = { ok: true } | { ok: false; retry: boolean; message: string };

/** The link's token, kept in memory only once it is out of the address bar,
 *  so a failed exchange can be tried again. Cleared when the exchange
 *  succeeds or the server refuses the link for good. */
let heldToken: string | null = null;
/** The exchange in flight, keyed by its token: React's development double
 *  run, or a retry clicked twice, waits on it instead of posting again; a
 *  different link never reuses it. */
let inFlight: { token: string; run: Promise<Outcome> } | null = null;

/** Post the token once. When the answer is lost or unclear (no answer, or a
 *  server error), the request may still have signed this browser in, so the
 *  session is asked before anything is called a failure. */
async function attempt(token: string): Promise<Outcome> {
  // Who this browser is before the exchange; undefined when unknown.
  let before: string | null | undefined;
  try { before = (await api.me()).user?.id ?? null; } catch { before = undefined; }
  const signedInByThis = async (): Promise<boolean> => {
    try {
      const me = await api.me();
      return !!me.user && (before === undefined || me.user.id !== before);
    } catch {
      return false;
    }
  };
  try {
    await api.completeSignIn(token);
    return { ok: true };
  } catch (e) {
    // A link already used by an earlier, lost answer is refused now; the
    // sign-in it made still counts.
    if (await signedInByThis()) return { ok: true };
    if (e instanceof ApiRequestError && e.status < 500) {
      return { ok: false, retry: false, message: signInFailureMessage(e) };
    }
    return { ok: false, retry: true, message: RETRY_MESSAGE };
  }
}

function exchange(token: string): Promise<Outcome> {
  if (inFlight && inFlight.token === token) return inFlight.run;
  const entry: { token: string; run: Promise<Outcome> } = {
    token,
    run: attempt(token).then((outcome) => {
      if (inFlight === entry) inFlight = null;
      if ((outcome.ok || !outcome.retry) && heldToken === token) heldToken = null;
      return outcome;
    }),
  };
  inFlight = entry;
  return entry.run;
}

/** The landing page of the emailed link: the token rides in the URL
 *  fragment, which browsers never send to any server, and is posted here.
 *  It leaves the address bar and the history entry at once; if the post
 *  fails before the server answers, it stays in memory for a retry. */
export function SignInCompletePage() {
  const nav = useNavigate();
  const session = useSession();
  const [err, setErr] = useState<{ message: string; retry: boolean } | null>(null);
  const [working, setWorking] = useState(true);
  // Only the latest run may act: a newer run, or leaving the page, retires
  // the earlier ones (React's development double run starts two).
  const latest = useRef(0);

  async function run(token: string) {
    const mine = ++latest.current;
    const live = () => latest.current === mine;
    setErr(null);
    setWorking(true);
    const outcome = await exchange(token);
    if (!live()) return;
    if (!outcome.ok) {
      setWorking(false);
      setErr({ message: outcome.message, retry: outcome.retry });
      return;
    }
    await session.refresh();
    if (!live()) return;
    let next = '/';
    try { next = sessionStorage.getItem('universe:signin:next') ?? '/'; } catch { /* ignore */ }
    nav(next.startsWith('/') ? next : '/', { replace: true });
  }

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const fromUrl = new URLSearchParams(hash).get('token');
    if (fromUrl) {
      // Take the token out of the address bar and the history entry.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      heldToken = fromUrl;
    }
    if (!heldToken) {
      setWorking(false);
      setErr({ message: 'This link is missing its token.', retry: false });
      return;
    }
    void run(heldToken);
    return () => { latest.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = () => { if (heldToken) void run(heldToken); };

  return (
    <div>
      <Nav />
      <div className="page">
        <div className="card modal-card">
          <Wordmark size={28} />
          <h1>Signing you in…</h1>
          {err && (err.retry
            ? <p className="error">{err.message}</p>
            : <p className="error">{err.message} <Link to="/signin">Sign in</Link></p>)}
          {err?.retry && (
            <button className="btn green" type="button" onClick={retry} disabled={working}>Try again</button>
          )}
        </div>
      </div>
    </div>
  );
}
