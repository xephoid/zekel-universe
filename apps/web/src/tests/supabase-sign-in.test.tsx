// Sign-in with Discord or Google through Supabase (T09), the page side.
// The buttons show only when the server offers them; the callback reads
// only the one-time code, takes it out of the address bar, trades it once
// and moves on; a cancelled or failed sign-in says so and goes nowhere.
// The trip itself (supabaseSignIn.ts) is checked with Supabase's library
// stood in for: PKCE, nothing read from the address bar by the library,
// and Supabase's session ended after the server has answered.

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const trip = vi.hoisted(() => ({
  startSignIn: vi.fn(async () => undefined),
  finishSignIn: vi.fn(async () => undefined),
}));
vi.mock('../supabaseSignIn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../supabaseSignIn')>()),
  startSignIn: trip.startSignIn,
  finishSignIn: trip.finishSignIn,
}));

import { SessionProvider } from '../session';
import { SignInCallbackPage, SignInPage } from '../pages/SignIn';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

const GUEST = { user: null, guest: { id: 'g', displayName: 'Guest', upgradedToUserId: null } };
const CFG = { url: 'https://p.supabase.co', publishableKey: 'sb_publishable_x' };

function stubServer(supabase: typeof CFG | null) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/me') return json(GUEST);
    if (url === '/api/auth/providers') return json({ supabase });
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
            <Route path="/tables" element={<p>tables page</p>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </StrictMode>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  trip.startSignIn.mockClear();
  trip.finishSignIn.mockReset();
  trip.finishSignIn.mockImplementation(async () => undefined);
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('the sign-in page', () => {
  it('offers no Discord or Google button when the server does not', async () => {
    stubServer(null);
    renderAt('/signin', <SignInPage />, '/signin');
    expect(await screen.findByText('Email me a sign-in link')).toBeTruthy();
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some((c) => String(c[0]) === '/api/auth/providers')).toBe(true));
    expect(screen.queryByText('Sign in with Discord')).toBeNull();
  });

  it('starts the trip to Discord with where to come back to', async () => {
    stubServer(CFG);
    renderAt('/signin?next=%2Ftables', <SignInPage />, '/signin');
    fireEvent.click(await screen.findByText('Sign in with Discord'));
    await waitFor(() => expect(trip.startSignIn).toHaveBeenCalledWith(CFG, 'discord', '/tables'));
    expect(screen.getByText('Sign in with Google')).toBeTruthy();
    expect(screen.getByText('Email me a sign-in link')).toBeTruthy();
  });
});

describe('the callback page', () => {
  it('trades the code once, clears the address bar and goes where the player was going', async () => {
    stubServer(CFG);
    sessionStorage.setItem('universe:signin:next', '/tables');
    window.history.replaceState(null, '', '/auth/callback?code=one-time&state=x');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    expect(await screen.findByText('tables page')).toBeTruthy();
    expect(new Set(trip.finishSignIn.mock.calls.map((c) => JSON.stringify(c)))).toEqual(new Set([JSON.stringify([CFG, 'one-time'])]));
    expect(window.location.search).toBe('');
  });

  it('never goes to another site afterwards', async () => {
    stubServer(CFG);
    sessionStorage.setItem('universe:signin:next', '//evil.example/x');
    window.history.replaceState(null, '', '/auth/callback?code=c');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    expect(await screen.findByText('home page')).toBeTruthy();
  });

  it('a cancelled sign-in says so and trades nothing', async () => {
    stubServer(CFG);
    window.history.replaceState(null, '', '/auth/callback?error=access_denied&error_description=no');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    expect(await screen.findByText(/Sign-in was cancelled/)).toBeTruthy();
    expect(trip.finishSignIn).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('ignores a token in the address bar: only a code is used', async () => {
    stubServer(CFG);
    window.history.replaceState(null, '', '/auth/callback#access_token=planted&refresh_token=r');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    expect(await screen.findByText(/missing its code/)).toBeTruthy();
    expect(trip.finishSignIn).not.toHaveBeenCalled();
  });

  it('a refused sign-in says so, links back to sign-in, and goes nowhere', async () => {
    stubServer(CFG);
    trip.finishSignIn.mockImplementation(async () => { throw new Error('That sign-in did not work. Try again.'); });
    window.history.replaceState(null, '', '/auth/callback?code=c');
    renderAt('/auth/callback', <SignInCallbackPage />, '/auth/callback');
    const msg = await screen.findByText(/That sign-in did not work/);
    expect(msg.querySelector('a[href="/signin"]')).toBeTruthy();
    expect(screen.queryByText('home page')).toBeNull();
  });
});

describe('the trip (supabaseSignIn.ts)', () => {
  const sb = vi.hoisted(() => ({
    options: [] as unknown[],
    exchange: vi.fn(),
    signOut: vi.fn(async () => ({ error: null })),
    signInWithOAuth: vi.fn(async () => ({ error: null })),
  }));
  vi.mock('@supabase/auth-js', () => ({
    AuthClient: class {
      constructor(opts: unknown) { sb.options.push(opts); }
      exchangeCodeForSession = sb.exchange;
      signOut = sb.signOut;
      signInWithOAuth = sb.signInWithOAuth;
    },
  }));

  let posted: unknown[];
  beforeEach(() => {
    posted = [];
    sb.exchange.mockReset();
    sb.signOut.mockClear();
    sb.signInWithOAuth.mockClear();
  });

  function stubComplete(status: number) {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === '/api/auth/supabase/complete') {
        posted.push(JSON.parse(String(init?.body)));
        return status === 200 ? json({ ok: true, userId: 'u' }) : json({ error: 'sign_in_refused', message: 'That sign-in did not work. Try again.' }, status);
      }
      return json({ error: 'not_found' }, 404);
    }));
  }

  it('uses PKCE, reads nothing from the address bar itself, and keeps its secret in this tab only', async () => {
    const real = await vi.importActual<typeof import('../supabaseSignIn')>('../supabaseSignIn');
    await real.startSignIn(CFG, 'google', '/');
    expect(sb.options.at(-1)).toMatchObject({
      url: 'https://p.supabase.co/auth/v1', flowType: 'pkce', detectSessionInUrl: false,
      autoRefreshToken: false, storage: window.sessionStorage, headers: { apikey: CFG.publishableKey },
    });
    expect(sb.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } });
  });

  it('posts Supabase\'s token to the server, then ends Supabase\'s session', async () => {
    const real = await vi.importActual<typeof import('../supabaseSignIn')>('../supabaseSignIn');
    stubComplete(200);
    sb.exchange.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });
    await real.finishSignIn(CFG, 'code-1');
    expect(sb.exchange).toHaveBeenCalledWith('code-1');
    expect(posted).toEqual([{ accessToken: 'tok' }]);
    expect(sb.signOut).toHaveBeenCalledTimes(1);
  });

  it('ends Supabase\'s session even when the server refuses, and reports the refusal', async () => {
    const real = await vi.importActual<typeof import('../supabaseSignIn')>('../supabaseSignIn');
    stubComplete(401);
    sb.exchange.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null });
    await expect(real.finishSignIn(CFG, 'code-2')).rejects.toThrow(/did not work/);
    expect(sb.signOut).toHaveBeenCalledTimes(1);
  });

  it('a code Supabase will not trade posts nothing', async () => {
    const real = await vi.importActual<typeof import('../supabaseSignIn')>('../supabaseSignIn');
    stubComplete(200);
    sb.exchange.mockResolvedValue({ data: { session: null }, error: { message: 'bad code' } });
    await expect(real.finishSignIn(CFG, 'code-3')).rejects.toThrow(/did not work/);
    expect(posted).toEqual([]);
  });
});
