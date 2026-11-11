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

  it('no answer from the server: the token is gone from the address bar but kept for Try again, which signs in', async () => {
    let signedIn = false;
    let fail = true;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me') return json(signedIn ? USER('u') : GUEST);
      if (url === '/api/auth/email/complete') {
        completes.push(JSON.parse(String(init?.body)));
        // The phone was offline: the request never reached the server.
        if (fail) return Promise.reject(new TypeError('Failed to fetch'));
        signedIn = true;
        return json({ ok: true, userId: 'u' });
      }
      return json({ error: 'not_found' }, 404);
    }));
    renderComplete();
    expect(await screen.findByText(/could not reach the server/)).toBeTruthy();
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('abc123');
    expect(screen.queryByText('home page')).toBeNull();
    expect(completes).toEqual([{ token: 'abc123' }]);

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('home page')).toBeTruthy(), { timeout: 5000 });
    expect(completes).toEqual([{ token: 'abc123' }, { token: 'abc123' }]);
  });

  it('the answer was lost after the server signed this browser in: the session is checked, and it moves on', async () => {
    let signedIn = false;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me') return json(signedIn ? USER('u') : GUEST);
      if (url === '/api/auth/email/complete') {
        completes.push(JSON.parse(String(init?.body)));
        signedIn = true; // the server finished and set the cookie...
        return Promise.reject(new TypeError('network connection was lost')); // ...the answer never arrived
      }
      return json({ error: 'not_found' }, 404);
    }));
    renderComplete();
    await waitFor(() => expect(screen.getByText('home page')).toBeTruthy(), { timeout: 5000 });
    expect(completes).toEqual([{ token: 'abc123' }]);
  });

  it('a lost answer, then Try again refused because the link was used: signed in counts as success', async () => {
    let signedIn = false;
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      // The first check after the lost answer cannot reach the server either.
      if (url === '/api/me') return calls === 1 && !signedIn ? Promise.reject(new TypeError('offline')) : json(signedIn ? USER('u') : GUEST);
      if (url === '/api/auth/email/complete') {
        completes.push(JSON.parse(String(init?.body)));
        calls++;
        if (calls === 1) return Promise.reject(new TypeError('offline'));
        signedIn = true; // the first post did arrive in the end
        return json({ error: 'invalid_or_expired_token' }, 401);
      }
      return json({ error: 'not_found' }, 404);
    }));
    renderComplete();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByText('home page')).toBeTruthy(), { timeout: 5000 });
    expect(completes).toHaveLength(2);
  });

  it('a server that answers no for good shows no Try again, and the same account already signed in is not mistaken for success', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/me') return json(USER('a'));
      if (url === '/api/auth/email/complete') {
        completes.push(JSON.parse(String(init?.body)));
        return json({ error: 'invalid_or_expired_token' }, 401);
      }
      return json({ error: 'not_found' }, 404);
    }));
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
