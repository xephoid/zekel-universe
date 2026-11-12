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

/** The server. `complete`: the completion's status (0: the answer is lost),
 *  or one status per try. */
function stubServer(opts: { providers?: string[]; complete?: number | number[] } = {}) {
  let tries = 0;
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/me') return json(GUEST);
    if (url === '/api/auth/providers') return json({ providers: opts.providers ?? ['discord', 'google'] });
    if (url === '/api/auth/supabase/start') return json({ url: 'https://p.supabase.co/auth/v1/authorize?provider=discord' });
    if (url === '/api/auth/supabase/complete') {
      const plan = opts.complete ?? 200;
      const status = Array.isArray(plan) ? plan[Math.min(tries++, plan.length - 1)]! : plan;
      if (status === 0) return Promise.reject(new TypeError('network down'));
      if (status === 503) return json({ error: 'sign_in_unavailable', message: 'Sign-in is not answering. Try again in a moment.' }, 503);
      if (status === 500) return json({ error: 'sign_in_failed', message: 'That sign-in could not be saved. Start again.' }, 500);
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
    await waitFor(() => expect(nav.reloadAt).toHaveBeenCalledWith(`${window.location.origin}/tables`));
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

  it('a sign-in that could not be saved says start again, with no Try again', async () => {
    stubServer({ complete: 500 });
    window.history.replaceState(null, '', '/auth/callback?code=c4');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    const msg = await screen.findByText(/could not be saved/);
    expect(msg.querySelector('a[href="/signin"]')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
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
  const origin = window.location.origin;
  /** Where the browser will really go with what safeNext returns. */
  const landsOn = (next: string) => new URL(safeNext(next), origin);

  it('a page of this site, as a full address', () => {
    expect(safeNext('/tables?x=1#y')).toBe(`${origin}/tables?x=1#y`);
    expect(safeNext(null)).toBe('/');
  });

  it('anything that would leave the site goes home instead', () => {
    // Written with String.raw so each backslash is really in the address.
    const bad = [String.raw`//evil.example/x`, String.raw`/\evil.example`, String.raw`/\/evil.example`,
      String.raw`\\evil.example`, String.raw`\/evil.example`, 'https://evil.example/', 'javascript:alert(1)',
      '  //evil.example', '\t//evil.example'];
    for (const b of bad) expect(safeNext(b), b).toBe('/');
  });

  it('a path that only looks like another site stays on this one', () => {
    // These parse as pages of this site; what comes back must not be read
    // as another site when the browser goes there.
    for (const b of ['/.//evil.example/x', `${origin}//evil.example/x`, String.raw`\tables`]) {
      expect(landsOn(b).origin, b).toBe(origin);
    }
  });
});

describe('the trip (supabaseSignIn.ts)', () => {
  it('sends a code once, even when asked twice at the same moment', async () => {
    stubServer();
    await Promise.all([finishSignIn('twice'), finishSignIn('twice')]);
    expect(completes()).toHaveLength(1);
  });

  it('a lost answer: says the server could not be reached and offers to try again, sending nothing more by itself', async () => {
    stubServer({ complete: 0 });
    await expect(finishSignIn('lost')).rejects.toMatchObject({ retry: true, message: expect.stringMatching(/could not reach the server/) });
    expect(completes()).toHaveLength(1);
  });

  it('after a failure the same code can be tried again (the server refuses it if it was spent)', async () => {
    stubServer({ complete: [0, 200] });
    await expect(finishSignIn('again')).rejects.toMatchObject({ retry: true });
    await expect(finishSignIn('again')).resolves.toBeUndefined();
    expect(completes()).toHaveLength(2);
  });

  it('a refusal or a failed save is final; only "not answering" offers to try again', async () => {
    stubServer({ complete: 401 });
    await expect(finishSignIn('refused')).rejects.toMatchObject({ retry: false });
    expect(completes()).toHaveLength(1);
    stubServer({ complete: 500 });
    await expect(finishSignIn('not-saved')).rejects.toMatchObject({ retry: false });
    stubServer({ complete: 503 });
    await expect(finishSignIn('busy')).rejects.toMatchObject({ retry: true });
  });
});
