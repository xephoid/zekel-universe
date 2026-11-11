// The sign-in link's landing page (SEC-03-F11): it posts the token once,
// takes it out of the address bar, and when the server refuses the link
// (opened in a browser that did not ask for it, used, or expired) it says
// so plainly and leaves the browser as it was.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '../session';
import { SignInCompletePage, SignInPage } from '../pages/SignIn';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const GUEST = { user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } };
const USER = (id: string) => ({ user: { id, displayName: id, avatarUrl: null, bio: null, createdAt: '' }, guest: null });

function renderComplete() {
  return render(
    <StrictMode>
      <SessionProvider>
        <MemoryRouter initialEntries={['/signin/complete']}>
          <Routes>
            <Route path="/signin/complete" element={<SignInCompletePage />} />
            <Route path="/" element={<p>home page</p>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </StrictMode>,
  );
}

describe('the sign-in landing page', () => {
  let completes: unknown[];

  beforeEach(() => {
    completes = [];
    window.history.replaceState(null, '', '/signin/complete#token=abc123');
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
  });

  it('refused because this browser did not ask for the link: a plain message, no sign-in, one post', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me') return json(GUEST);
      if (url === '/api/auth/email/complete') {
        completes.push(JSON.parse(String(init?.body)));
        return json({ error: 'sign_in_wrong_browser', message: 'Open the sign-in link in the browser where you asked for it.' }, 401);
      }
      return json({ error: 'not_found' }, 404);
    }));
    renderComplete();
    expect(await screen.findByText(/only in the browser where you asked for it/)).toBeTruthy();
    expect(screen.getByText(/only in the browser where you asked for it/).querySelector('a[href="/signin"]')).toBeTruthy();
    expect(screen.queryByText('home page')).toBeNull();
    // Posted once, even under React's double effect run, and the token is
    // gone from the address bar.
    expect(completes).toEqual([{ token: 'abc123' }]);
    expect(window.location.hash).toBe('');
  });

  it('accepted: posts once and moves on', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me') return json({ user: { id: 'u', displayName: 'P', avatarUrl: null, bio: null, createdAt: '' }, guest: null });
      if (url === '/api/auth/email/complete') {
        completes.push(JSON.parse(String(init?.body)));
        return json({ ok: true, userId: 'u' });
      }
      return json({ error: 'not_found' }, 404);
    }));
    renderComplete();
    await waitFor(() => expect(screen.getByText('home page')).toBeTruthy(), { timeout: 5000 });
    expect(completes).toEqual([{ token: 'abc123' }]);
  });

  /** A fake server that knows which link made this browser's session.
   *  `complete` scripts each post: 'ok' signs in and answers; 'lost' signs
   *  in but the answer never arrives; 'offline' never reaches the server;
   *  'refuse' answers 401. `status` scripts each link-status question the
   *  same way ('answer' or 'offline'). */
  function fakeServer(opts: {
    complete: ('ok' | 'lost' | 'offline' | 'refuse')[];
    status?: ('answer' | 'offline')[];
    me?: () => unknown;
    before?: string | null; // the account signed in before the link, if any
  }) {
    const state = { madeBy: null as string | null, user: opts.before ?? null, statusAsks: 0 };
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me') {
        if (opts.me) return opts.me();
        return json(state.user ? USER(state.user) : GUEST);
      }
      if (url === '/api/auth/email/complete') {
        const body = JSON.parse(String(init?.body)) as { token: string };
        completes.push(body);
        const step = opts.complete.shift() ?? 'refuse';
        if (step === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
        if (step === 'refuse') return json({ error: 'invalid_or_expired_token' }, 401);
        state.madeBy = body.token;
        state.user = 'u';
        if (step === 'lost') return Promise.reject(new TypeError('network connection was lost'));
        return json({ ok: true, userId: 'u' });
      }
      if (url === '/api/auth/email/link-status') {
        state.statusAsks++;
        const step = opts.status?.shift() ?? 'answer';
        if (step === 'offline') return Promise.reject(new TypeError('Failed to fetch'));
        const { token } = JSON.parse(String(init?.body)) as { token: string };
        return json(state.madeBy === token ? { signedIn: true, userId: 'u' } : { signedIn: false });
      }
      return json({ error: 'not_found' }, 404);
    }));
    return state;
  }
  const home = () => waitFor(() => expect(screen.getByText('home page')).toBeTruthy(), { timeout: 5000 });

  it('no answer from the server: the token is gone from the address bar but kept for Try again, which signs in', async () => {
    fakeServer({ complete: ['offline', 'ok'] });
    renderComplete();
    expect(await screen.findByText(/could not reach the server/)).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('abc123');
    expect(screen.queryByText('home page')).toBeNull();
    expect(completes).toEqual([{ token: 'abc123' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await home();
    expect(completes).toEqual([{ token: 'abc123' }, { token: 'abc123' }]);
  });

  it('the answer was lost after the server signed this browser in: the server confirms this link made the session', async () => {
    fakeServer({ complete: ['lost'] });
    renderComplete();
    await home();
    expect(completes).toEqual([{ token: 'abc123' }]);
  });

  it('same account again (A to A) with the answer lost: confirmed by the link, not by the user id', async () => {
    // A was signed in before and is signed in after: the ids match.
    fakeServer({ complete: ['lost'], before: 'u' });
    renderComplete();
    await home();
    expect(completes).toEqual([{ token: 'abc123' }]);
  });

  it('the new cookie is already there before Try again checks anything: the refused retry still counts as signed in', async () => {
    // The first post signs in but its answer and the status question are
    // both lost; by the retry the cookie is there, and the link is spent.
    const state = fakeServer({ complete: ['lost', 'refuse'], status: ['offline', 'answer'] });
    renderComplete();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await home();
    expect(completes).toHaveLength(2);
    expect(state.statusAsks).toBe(2);
  });

  it('A signed in, the first /api/me fails, and B\'s link is refused: a refusal, never a success', async () => {
    let meCalls = 0;
    fakeServer({
      complete: ['refuse'], before: 'a',
      me: () => (meCalls++ === 0 ? Promise.reject(new TypeError('offline')) : json(USER('a'))),
    });
    renderComplete();
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText('home page')).toBeNull();
    expect(completes).toEqual([{ token: 'abc123' }]);
  });

  it('a refusal after an unclear try, with the status question also unanswered: says it is unsure and offers Try again', async () => {
    fakeServer({ complete: ['offline', 'refuse', 'refuse'], status: ['answer', 'offline', 'answer'] });
    renderComplete();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/could not check whether an earlier try/)).toBeTruthy();
    expect(screen.queryByText('home page')).toBeNull();
    // Asked again and answered: the link made no session, so a plain refusal.
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a first refusal stays a refusal even when the status question gets no answer', async () => {
    fakeServer({ complete: ['refuse'], status: ['offline'] });
    renderComplete();
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a server that answers no for good shows no Try again, and the same account already signed in is not mistaken for success', async () => {
    fakeServer({ complete: ['refuse'], before: 'a' });
    renderComplete();
    expect(await screen.findByText(/invalid or has expired/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByText('home page')).toBeNull();
    expect(completes).toEqual([{ token: 'abc123' }]);
  });

  it('a second link never reuses the first link\'s exchange', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me') return json(GUEST);
      if (url === '/api/auth/email/complete') {
        const body = JSON.parse(String(init?.body)) as { token: string };
        completes.push(body);
        // The first link's post hangs; the second one is answered.
        if (body.token === 'first') return new Promise<Response>(() => {});
        return json({ ok: true, userId: 'u' });
      }
      return json({ error: 'not_found' }, 404);
    }));
    window.history.replaceState(null, '', '/signin/complete#token=first');
    renderComplete();
    await waitFor(() => expect(completes).toEqual([{ token: 'first' }]));
    cleanup();
    window.history.replaceState(null, '', '/signin/complete#token=second');
    renderComplete();
    await waitFor(() => expect(screen.getByText('home page')).toBeTruthy(), { timeout: 5000 });
    expect(completes).toEqual([{ token: 'first' }, { token: 'second' }]);
  });

  it('the request page tells the person to open the link in this browser', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/me') return json(GUEST);
      if (url === '/api/auth/email/link') return json({ ok: true });
      return json({ error: 'not_found' }, 404);
    }));
    render(
      <SessionProvider>
        <MemoryRouter initialEntries={['/signin']}><SignInPage /></MemoryRouter>
      </SessionProvider>,
    );
    const input = await screen.findByLabelText('Email');
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    expect(await screen.findByText(/Open it in this browser/)).toBeTruthy();
  });
});
