// Site analytics (PostHog, launch task T07). Off unless the server's
// /api/config hands over a project key; the PostHog library is then loaded
// as its own file, so a site without analytics never downloads it.
//
// What is sent: a pageview per route, and the app's own events below. What
// is not: clicks (autocapture is off), session recordings, surveys, page
// performance, error reports, or any script from PostHog's servers. URLs
// lose their query and fragment before sending (the sign-in link's token
// travels in the fragment). Signed-in players are known by their account id
// only; guests stay anonymous. Game-specific events wait for T02.

import type { PostHog, PostHogConfig, CaptureResult } from 'posthog-js';
import type { ConfigResponse } from '@universe/shared';

/** The app's own events. Each name is fixed here so a typo fails to compile. */
export type AppEvent =
  | 'guest_started'
  | 'sign_in_link_requested'
  | 'signed_in'
  | 'signed_out'
  | 'table_created'
  | 'table_joined'
  | 'game_started'
  | 'game_finished'
  | 'invite_sent'
  | 'invite_accepted'
  | 'friend_request_sent';

type Props = Record<string, string | number | boolean | null>;

type Call =
  | { kind: 'capture'; event: string; props: Props }
  | { kind: 'identify'; userId: string }
  | { kind: 'reset' };

/** Calls made before the library has loaded wait here, up to a limit. */
const MAX_QUEUED = 50;
let queue: Call[] = [];
let client: PostHog | null = null;
/** false once we know analytics is off: calls are dropped, not queued. */
let enabled: boolean | null = null;
let identifiedAs: string | null = null;

/** Keys whose values are URLs the browser built from this page. */
const URL_KEYS = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer'];

/** A URL with its query and fragment removed; other values come back as is. */
export function stripUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`;
  } catch {
    return value;
  }
}

function scrubBag(bag: Record<string, unknown> | undefined): void {
  if (!bag) return;
  for (const k of URL_KEYS) if (k in bag) bag[k] = stripUrl(bag[k]);
  // PostHog fills $search from location.search on some paths; drop it.
  delete bag['$search'];
}

/** Runs on every event just before it leaves the browser. */
export function scrubEvent(e: CaptureResult | null): CaptureResult | null {
  if (!e) return e;
  scrubBag(e.properties as Record<string, unknown> | undefined);
  scrubBag(e.$set as Record<string, unknown> | undefined);
  scrubBag(e.$set_once as Record<string, unknown> | undefined);
  return e;
}

/** The init options, kept apart so a test can check every switch. */
export function posthogOptions(host: string): Partial<PostHogConfig> {
  return {
    api_host: host,
    // Only what this file sends by hand.
    autocapture: false,
    rageclick: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    // No remote config call and no extra scripts from PostHog's servers;
    // the page's script-src stays 'self'.
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    // People: anonymous until signed in; respect Do Not Track; no cookies.
    person_profiles: 'identified_only',
    respect_dnt: true,
    persistence: 'localStorage',
    mask_personal_data_properties: true,
    before_send: scrubEvent,
  };
}

function run(c: PostHog, call: Call): void {
  if (call.kind === 'capture') c.capture(call.event, call.props);
  else if (call.kind === 'identify') c.identify(call.userId);
  else c.reset();
}

function dispatch(call: Call): void {
  if (enabled === false) return;
  if (client) { run(client, call); return; }
  if (queue.length < MAX_QUEUED) queue.push(call);
}

/**
 * Ask the server whether analytics is on and, if so, load PostHog. Never
 * throws: analytics failing (an ad blocker, a network error) must not touch
 * the game.
 */
export async function startAnalytics(
  fetchConfig: () => Promise<ConfigResponse> = async () => (await fetch('/api/config', { credentials: 'include' })).json() as Promise<ConfigResponse>,
  load: () => Promise<PostHog> = async () => (await import('posthog-js')).default,
): Promise<boolean> {
  try {
    const cfg = await fetchConfig();
    if (!cfg.analytics) { enabled = false; queue = []; return false; }
    const posthog = await load();
    posthog.init(cfg.analytics.key, posthogOptions(cfg.analytics.host));
    client = posthog;
    enabled = true;
    const waiting = queue;
    queue = [];
    for (const call of waiting) run(posthog, call);
    return true;
  } catch {
    enabled = false;
    queue = [];
    return false;
  }
}

/** One of the app's own events. Properties are plain values, never names or emails. */
export function track(event: AppEvent, props: Props = {}): void {
  dispatch({ kind: 'capture', event, props });
}

/**
 * A route change. The URL is set here, not read when the event leaves, so a
 * pageview queued before PostHog loaded still names the page it was for.
 */
export function trackPageview(pathname: string): void {
  dispatch({ kind: 'capture', event: '$pageview', props: { $current_url: `${window.location.origin}${pathname}`, $pathname: pathname } });
}

/**
 * Who is playing: an account id when signed in, null otherwise. Signing out
 * (an id going to null) starts a fresh anonymous visitor, so the next person
 * at a shared computer is not counted as the last one.
 */
export function identifyUser(userId: string | null): void {
  if (userId === identifiedAs) return;
  const was = identifiedAs;
  identifiedAs = userId;
  if (userId) dispatch({ kind: 'identify', userId });
  else if (was) dispatch({ kind: 'reset' });
}

/** Tests only: forget everything. */
export function resetAnalyticsForTests(): void {
  queue = [];
  client = null;
  enabled = null;
  identifiedAs = null;
}
