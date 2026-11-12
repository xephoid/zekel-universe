// @vitest-environment jsdom
// Site analytics in the browser: off unless the server says so, nothing
// automatic, no URL query or fragment leaves the page, and calls made
// before PostHog loads are kept in order.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PostHog, CaptureResult } from 'posthog-js';
import {
  identifyUser, posthogOptions, resetAnalyticsForTests, scrubEvent, startAnalytics, stripUrl, track, trackPageview,
} from '../analytics';

const KEY = 'phc_' + 'a1'.repeat(16);
const HOST = 'https://us.i.posthog.com';

function fakePosthog() {
  const calls: unknown[][] = [];
  const ph = {
    init: vi.fn((...a: unknown[]) => { calls.push(['init', ...a]); }),
    capture: vi.fn((...a: unknown[]) => { calls.push(['capture', ...a]); }),
    identify: vi.fn((...a: unknown[]) => { calls.push(['identify', ...a]); }),
    reset: vi.fn(() => { calls.push(['reset']); }),
  };
  return { ph: ph as unknown as PostHog, calls };
}

beforeEach(() => resetAnalyticsForTests());

describe('startAnalytics', () => {
  it('never loads PostHog when the server says analytics is off, and drops calls', async () => {
    const load = vi.fn();
    track('guest_started');
    expect(await startAnalytics(async () => ({ analytics: null }), load)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    track('signed_out'); // must not throw or queue
  });

  it('survives a failed config fetch or a blocked library', async () => {
    expect(await startAnalytics(async () => { throw new Error('offline'); })).toBe(false);
    resetAnalyticsForTests();
    expect(await startAnalytics(async () => ({ analytics: { key: KEY, host: HOST } }), async () => { throw new Error('blocked'); })).toBe(false);
  });

  it('starts with the key and host, then sends what was queued in order', async () => {
    const { ph, calls } = fakePosthog();
    trackPageview('/games/sweetlands');
    identifyUser('u1');
    track('table_created', { game: 'sweetlands' });
    expect(await startAnalytics(async () => ({ analytics: { key: KEY, host: HOST } }), async () => ph)).toBe(true);
    expect(calls.map((c) => c[0])).toEqual(['init', 'capture', 'identify', 'capture']);
    expect(calls[0]![1]).toBe(KEY);
    expect(calls[1]).toEqual(['capture', '$pageview', { $current_url: `${window.location.origin}/games/sweetlands`, $pathname: '/games/sweetlands' }]);
    expect(calls[2]).toEqual(['identify', 'u1']);
    track('signed_out');
    expect(calls.at(-1)).toEqual(['capture', 'signed_out', {}]);
  });
});

describe('identifyUser', () => {
  it('identifies once per account and starts fresh only after a real sign-out', async () => {
    const { ph } = fakePosthog();
    await startAnalytics(async () => ({ analytics: { key: KEY, host: HOST } }), async () => ph);
    identifyUser(null); // a guest's first visit: nothing to reset
    expect(ph.reset).not.toHaveBeenCalled();
    identifyUser('u1');
    identifyUser('u1');
    expect(ph.identify).toHaveBeenCalledTimes(1);
    identifyUser(null);
    expect(ph.reset).toHaveBeenCalledTimes(1);
  });
});

describe('posthogOptions', () => {
  it('turns off every automatic capture and every remote script', () => {
    const o = posthogOptions(HOST);
    expect(o.api_host).toBe(HOST);
    for (const k of ['autocapture', 'rageclick', 'capture_pageview', 'capture_pageleave', 'capture_dead_clicks',
      'capture_heatmaps', 'capture_exceptions', 'capture_performance'] as const) {
      expect(o[k], k).toBe(false);
    }
    for (const k of ['disable_session_recording', 'disable_surveys', 'disable_product_tours', 'disable_conversations',
      'disable_web_experiments', 'advanced_disable_flags', 'disable_external_dependency_loading', 'respect_dnt'] as const) {
      expect(o[k], k).toBe(true);
    }
    expect(o.person_profiles).toBe('identified_only');
    expect(o.persistence).toBe('localStorage');
    expect(o.before_send).toBe(scrubEvent);
  });
});

describe('scrubbing URLs', () => {
  it('drops the query and the fragment', () => {
    expect(stripUrl('https://zekel.games/signin/complete#token=secret')).toBe('https://zekel.games/signin/complete');
    expect(stripUrl('https://zekel.games/games/x/setup?mode=turns')).toBe('https://zekel.games/games/x/setup');
    // Discord and Google send the one-time code back in the query.
    expect(stripUrl('https://zekel.games/auth/callback?code=abc123&state=x')).toBe('https://zekel.games/auth/callback');
    expect(stripUrl('not a url')).toBe('not a url');
    expect(stripUrl(3)).toBe(3);
  });

  it('cleans every URL PostHog may attach, in properties and person fields', () => {
    const e = {
      uuid: 'x', event: '$pageview',
      properties: { $current_url: 'https://zekel.games/signin/complete#t=abc', $referrer: 'https://site.example/p?q=1', $search: '?x', game: 'ff' },
      $set: { $current_url: 'https://zekel.games/a#b' },
      $set_once: { $initial_current_url: 'https://zekel.games/signin/complete#t=abc', $initial_referrer: 'https://r.example/?s=1' },
    } as unknown as CaptureResult;
    const out = scrubEvent(e)!;
    expect(out.properties).toEqual({ $current_url: 'https://zekel.games/signin/complete', $referrer: 'https://site.example/p', game: 'ff' });
    expect(out.$set).toEqual({ $current_url: 'https://zekel.games/a' });
    expect(out.$set_once).toEqual({ $initial_current_url: 'https://zekel.games/signin/complete', $initial_referrer: 'https://r.example/' });
    expect(JSON.stringify(out)).not.toContain('abc');
  });
});
