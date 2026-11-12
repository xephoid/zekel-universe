// Sign-in with Discord or Google through Supabase (T09), the page side. The
// server runs the PKCE flow; the page only asks where to go and hands over
// the code. Covered: the buttons show only when the server offers them; a
// button starts the trip; the callback reads only the code, clears the
// address bar, and loads the next page afresh once signed in; a cancelled
// or refused sign-in says so and goes nowhere; the trip module sends a code
// once even when asked twice at once, and settles a lost answer by asking
// the server.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const nav = vi.hoisted(() => ({ leaveTo: vi.fn(), reloadAt: vi.fn() }));
vi.mock('../leave', () => nav);

import { SessionProvider } from '../session';
import { SignInCallbackPage, SignInPage } from '../pages/SignIn';
import { finishSignIn, safeNext } from '../supabaseSignIn';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const GUEST = { user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } };

let calls: Array<{ url: string; body: unknown }>;

/** The server. `complete`: the completion's status (0: the answer is lost);
 *  `made`: the status question's answer. */
function stubServer(opts: { providers?: string[]; complete?: number; made?: boolean } = {}) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/me') return json(GUEST);
    if (url === '/api/auth/providers') return json({ providers: opts.providers ?? ['discord', 'google'] });
    if (url === '/api/auth/supabase/start') return json({ url: 'https://p.supabase.co/auth/v1/authorize?provider=discord' });
    if (url === '/api/auth/supabase/resume') return json({ signedIn: opts.made ?? false });
    if (url === '/api/auth/supabase/complete') {
      const status = opts.complete ?? 200;
      if (status === 0) return Promise.reject(new TypeError('network down'));
      if (status === 503) return json({ error: 'sign_in_unavailable', message: 'Sign-in is not answering. Try again in a moment.' }, 503);
      return status === 200 ? json({ ok: true, userId: 'u' }) : json({ error: 'sign_in_refused', message: 'That sign-in did not work. Start again.' }, status);
    }
    return json({ error: 'not_found' }, 404);
  }));
}

function renderAt(path: string, element: JSX.Element, route: string) {
  return render(
    <StrictMode>
      <SessionProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={element} />
            <Route path="/" element={<p>home page</p>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </StrictMode>,
  );
}

const completes = () => calls.filter((c) => c.url === '/api/auth/supabase/complete');

beforeEach(() => { calls = []; });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  nav.leaveTo.mockReset();
  nav.reloadAt.mockReset();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('the sign-in page', () => {
  it('offers no Discord or Google button when the server does not', async () => {
    stubServer({ providers: [] });
    renderAt('/signin', <SignInPage />, '/signin');
    expect(await screen.findByText('Email me a sign-in link')).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.url === '/api/auth/providers')).toBe(true));
    expect(screen.queryByText('Sign in with Discord')).toBeNull();
  });

  it('a button asks the server where to go, remembers where the player was going, and leaves', async () => {
    stubServer();
    renderAt('/signin?next=%2Ftables', <SignInPage />, '/signin');
    fireEvent.click(await screen.findByText('Sign in with Discord'));
    await waitFor(() => expect(nav.leaveTo).toHaveBeenCalledWith('https://p.supabase.co/auth/v1/authorize?provider=discord'));
    expect(calls.find((c) => c.url === '/api/auth/supabase/start')?.body).toEqual({ provider: 'discord' });
    expect(sessionStorage.getItem('universe:signin:next')).toBe('/tables');
    expect(screen.getByText('Sign in with Google')).toBeTruthy();
  });
});

describe('the callback page', () => {
  it('sends the code once, clears the address bar and loads the next page afresh', async () => {
    stubServer();
    sessionStorage.setItem('universe:signin:next', '/tables');
    window.history.replaceState(null, '', '/auth/callback?code=one-time&state=x');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    await waitFor(() => expect(nav.reloadAt).toHaveBeenCalledWith('/tables'));
    // Once, under React's development double run, with the code only.
    expect(completes()).toEqual([{ url: '/api/auth/supabase/complete', body: { code: 'one-time' } }]);
    expect(window.location.search).toBe('');
  });

  it('never goes to another site afterwards', async () => {
    stubServer();
    sessionStorage.setItem('universe:signin:next', '//evil.example/x');
    window.history.replaceState(null, '', '/auth/callback?code=c2');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    await waitFor(() => expect(nav.reloadAt).toHaveBeenCalledWith('/'));
  });

  it('a cancelled sign-in says so and sends nothing', async () => {
    stubServer();
    window.history.replaceState(null, '', '/auth/callback?error=access_denied&error_description=no');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    expect(await screen.findByText(/Sign-in was cancelled/)).toBeTruthy();
    expect(completes()).toEqual([]);
    expect(window.location.search).toBe('');
  });

  it('ignores a token in the address bar: only a code is used', async () => {
    stubServer();
    window.history.replaceState(null, '', '/auth/callback#access_token=planted&refresh_token=r');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    expect(await screen.findByText(/missing its code/)).toBeTruthy();
    expect(completes()).toEqual([]);
  });

  it('when sign-in is only busy, the same code can be tried again from the page', async () => {
    stubServer({ complete: 503 });
    window.history.replaceState(null, '', '/auth/callback?code=busy');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    expect(await screen.findByText(/not answering/)).toBeTruthy();
    stubServer();
    fireEvent.click(screen.getByText('Try again'));
    await waitFor(() => expect(nav.reloadAt).toHaveBeenCalledWith('/'));
    // The busy try, then the retry, both with the same code.
    expect(completes()).toEqual([
      { url: '/api/auth/supabase/complete', body: { code: 'busy' } },
      { url: '/api/auth/supabase/complete', body: { code: 'busy' } },
    ]);
  });

  it('a refused sign-in says so, links back to sign-in, and goes nowhere', async () => {
    stubServer({ complete: 401 });
    window.history.replaceState(null, '', '/auth/callback?code=c3');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    const msg = await screen.findByText(/That sign-in did not work/);
    expect(msg.querySelector('a[href="/signin"]')).toBeTruthy();
    expect(nav.reloadAt).not.toHaveBeenCalled();
  });
});

describe('where to go after signing in', () => {
  it('only a page of this site; anything that reads as another site goes home', () => {
    expect(safeNext('/tables?x=1#y')).toBe('/tables?x=1#y');
    expect(safeNext(null)).toBe('/');
    // Written with String.raw so each backslash is really in the address.
    const bad = [String.raw`//evil.example/x`, String.raw`/\evil.example`, String.raw`/\/evil.example`,
      String.raw`\\evil.example`, String.raw`\/evil.example`, 'https://evil.example/', 'javascript:alert(1)',
      '  //evil.example', '\t//evil.example'];
    for (const b of bad) expect(safeNext(b), b).toBe('/');
    // A single backslash is a page of this site, as the browser reads it.
    expect(safeNext(String.raw`\tables`)).toBe('/tables');
  });
});

describe('the trip (supabaseSignIn.ts)', () => {
  it('sends a code once, even when asked twice at the same moment', async () => {
    stubServer();
    await Promise.all([finishSignIn('twice'), finishSignIn('twice')]);
    expect(completes()).toHaveLength(1);
  });

  it('a lost answer, when the server says this code did sign the browser in, is a success', async () => {
    stubServer({ complete: 0, made: true });
    await expect(finishSignIn('lost-yes')).resolves.toBeUndefined();
    expect(calls.find((c) => c.url === '/api/auth/supabase/resume')?.body).toEqual({ code: 'lost-yes' });
  });

  it('a lost answer, when the server says it did not, says the server could not be reached', async () => {
    stubServer({ complete: 0, made: false });
    await expect(finishSignIn('lost-no')).rejects.toThrow(/could not reach the server/);
  });

  it('a refusal is a refusal unless the server says this code signed the browser in', async () => {
    stubServer({ complete: 401, made: false });
    await expect(finishSignIn('refused')).rejects.toThrow(/did not work/);
    stubServer({ complete: 401, made: true });
    await expect(finishSignIn('refused-but-made')).resolves.toBeUndefined();
  });
});
