// Site analytics settings (PostHog). The server reads them from the host's
// config and hands them to the page at /api/config, so one built image works
// with analytics on or off. The project key is a public key, made to sit in
// web pages; it still lives only in the host's config, never in the repo.

export interface AnalyticsConfig {
  /** PostHog project key (phc_...). */
  key: string;
  /** The PostHog origin events go to, such as https://us.i.posthog.com. */
  host: string;
}

export const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * POSTHOG_KEY turns analytics on; POSTHOG_HOST is optional and defaults to
 * PostHog's US cloud. The host must be a bare https origin: it goes into the
 * page's Content-Security-Policy, so anything else is refused at startup.
 */
export function parseAnalytics(rawKey: string | undefined, rawHost: string | undefined): AnalyticsConfig | null {
  const key = (rawKey ?? '').trim();
  const hostText = (rawHost ?? '').trim();
  if (key === '') {
    if (hostText !== '') throw new Error('POSTHOG_HOST is set but POSTHOG_KEY is not');
    return null;
  }
  if (!/^phc_[A-Za-z0-9]{20,80}$/.test(key)) {
    throw new Error('POSTHOG_KEY must be a PostHog project key (phc_ followed by letters and digits)');
  }
  const host = hostText === '' ? DEFAULT_POSTHOG_HOST : hostText.replace(/\/$/, '');
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    throw new Error(`POSTHOG_HOST must be an https origin, got ${JSON.stringify(rawHost)}`);
  }
  if (url.protocol !== 'https:' || url.origin !== host) {
    throw new Error(`POSTHOG_HOST must be an https origin with no path, got ${JSON.stringify(rawHost)}`);
  }
  return { key, host };
}
