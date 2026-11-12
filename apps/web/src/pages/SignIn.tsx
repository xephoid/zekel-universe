// Sign-in, as the canvas draws it: a card over the page with the
// wordmark, the passwordless promise, the email row, and the guest escape
// hatch. Passwordless: Discord or Google through Supabase when the server
// offers them (T09), and the email link.

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiRequestError } from '../api';
import { useSession } from '../session';
import { Nav } from './Nav';
import { Wordmark } from '../ui';
import { finishSignIn, NEXT_KEY, startSignIn, type SignInProvider } from '../supabaseSignIn';
import { reloadAt } from '../leave';

const PROVIDER_NAMES: Record<SignInProvider, string> = { discord: 'Discord', google: 'Google' };

export function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [params] = useSearchParams();
  const session = useSession();
  const next = params.get('next') ?? '/';
  const forFriends = /friends=1/.test(next);
  const [providers, setProviders] = useState<SignInProvider[]>([]);
  const [leaving, setLeaving] = useState<SignInProvider | null>(null);

  useEffect(() => {
    let live = true;
    api.authProviders().then((r) => { if (live) setProviders(r.providers); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  async function go(provider: SignInProvider) {
    setErr(null);
    setLeaving(provider);
    try {
      await startSignIn(provider, next);
    } catch (e) {
      setLeaving(null);
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function send() {
    setErr(null);
    try {
      await api.signInEmail(email);
      try { sessionStorage.setItem(NEXT_KEY, next); } catch { /* ignore */ }
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
              No password. {providers.length > 0 ? 'Use Discord or Google, or we' : 'We'} email you a link; opening it signs you in{next !== '/' ? ' and brings you straight back' : ''}.
              {!session.signedIn && ' The games you played as a guest come with you.'}
            </p>
          </div>
          {session.signedIn && <p>You are signed in as <strong>{session.displayName}</strong>. <Link to="/profile">Profile</Link></p>}
          {providers.length > 0 && !sent && (
            <div className="stack" style={{ gap: 8 }}>
              {providers.map((p) => (
                <button key={p} className="btn" type="button" disabled={leaving !== null} onClick={() => void go(p)}>
                  {leaving === p ? `Going to ${PROVIDER_NAMES[p]}…` : `Sign in with ${PROVIDER_NAMES[p]}`}
                </button>
              ))}
            </div>
          )}
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
const UNSURE_MESSAGE = 'The server did not accept this link again, and we could not check whether an earlier try already signed you in. Check your connection and try again.';

type Outcome = { ok: true } | { ok: false; retry: boolean; message: string };

/** The link's token, kept in memory only once it is out of the address bar,
 *  so a failed exchange can be tried again. Cleared when the exchange
 *  succeeds or the server refuses the link for good. */
let heldToken: string | null = null;
/** Whether an earlier try with the held token got no clear answer, so it may
 *  have signed this browser in. Kept across retries; tied to that token. */
let heldUnclear = false;
/** The exchange in flight, keyed by its token: React's development double
 *  run, or a retry clicked twice, waits on it instead of posting again; a
 *  different link never reuses it. */
let inFlight: { token: string; run: Promise<Outcome> } | null = null;

/** Ask the server whether this browser's session was made by this link:
 *  true or false, or null when the question itself got no answer. */
async function madeByThisLink(token: string): Promise<boolean | null> {
  try {
    return (await api.signInLinkStatus(token)).signedIn === true;
  } catch {
    return null;
  }
}

/** Post the token once. On any failure, ask the server whether this link
 *  already signed this browser in (an earlier answer may have been lost);
 *  nothing else, such as who is signed in, counts as evidence. */
async function attempt(token: string): Promise<Outcome> {
  try {
    await api.completeSignIn(token);
    return { ok: true };
  } catch (e) {
    const made = await madeByThisLink(token);
    if (made === true) return { ok: true };
    const answered = e instanceof ApiRequestError && e.status < 500;
    if (answered) {
      // A refusal is final unless an earlier try may have signed this
      // browser in and the server could not be asked about it.
      if (made === null && heldUnclear) return { ok: false, retry: true, message: UNSURE_MESSAGE };
      return { ok: false, retry: false, message: signInFailureMessage(e) };
    }
    heldUnclear = true;
    return { ok: false, retry: true, message: RETRY_MESSAGE };
  }
}

function exchange(token: string): Promise<Outcome> {
  if (inFlight && inFlight.token === token) return inFlight.run;
  const entry: { token: string; run: Promise<Outcome> } = {
    token,
    run: attempt(token).then((outcome) => {
      if (inFlight === entry) inFlight = null;
      if ((outcome.ok || !outcome.retry) && heldToken === token) { heldToken = null; heldUnclear = false; }
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
    try { next = sessionStorage.getItem(NEXT_KEY) ?? '/'; } catch { /* ignore */ }
    nav(next.startsWith('/') ? next : '/', { replace: true });
  }

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const fromUrl = new URLSearchParams(hash).get('token');
    if (fromUrl) {
      // Take the token out of the address bar and the history entry.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
      if (heldToken !== fromUrl) heldUnclear = false;
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

/** Where Discord or Google send the player back, through Supabase, with a
 *  one-time code in the address (`?code=`), or `?error=` when the player
 *  said no. The code leaves the address bar at once and goes to the server,
 *  which trades it with the secret this browser's cookie holds. Nothing else
 *  in the address is read. Once signed in, the next page loads afresh, so
 *  every part of the app starts again as the new account. */
export function SignInCallbackPage() {
  const [err, setErr] = useState<string | null>(null);
  // What the address said, read once when the page first draws: React keeps
  // it through its development double run, after the address bar is cleared.
  const [{ code, refused }] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { code: params.get('code'), refused: params.has('error') };
  });

  useEffect(() => {
    let live = true;
    window.history.replaceState(window.history.state, '', window.location.pathname);
    if (!code) {
      setErr(refused ? 'Sign-in was cancelled.' : 'This sign-in link is missing its code.');
      return;
    }
    void (async () => {
      try {
        await finishSignIn(code);
        if (!live) return;
        let next = '/';
        try { next = sessionStorage.getItem(NEXT_KEY) ?? '/'; } catch { /* ignore */ }
        reloadAt(next.startsWith('/') && !next.startsWith('//') ? next : '/');
      } catch (e) {
        if (live) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { live = false; };
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
