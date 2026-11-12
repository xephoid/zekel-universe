// Sign-in with Discord or Google through Supabase (T09). Supabase does only
// the trip there and back; the server then signs the player in with
// Universe's own cookie (POST /api/auth/supabase/complete).
//
// The PKCE flow: when the trip starts, Supabase's library keeps a secret in
// this tab's sessionStorage, and only that secret can trade the one-time code
// Discord or Google send back for a token. So a code mailed to someone else
// cannot sign their browser in. Tokens in the address bar (the older
// "implicit" flow) are never read. Supabase's own session is ended as soon
// as the server has signed the player in: Universe's cookie is the only
// sign-in that counts.
//
// Supabase's library loads only when someone uses one of these buttons.

import type { GoTrueClient } from '@supabase/auth-js';
import { api } from './api';

export type SignInProvider = 'discord' | 'google';

export interface SupabaseConfig { url: string; publishableKey: string }

/** Where the player goes after signing in: the same key the email link uses. */
export const NEXT_KEY = 'universe:signin:next';

let client: { key: string; run: Promise<GoTrueClient> } | null = null;

async function clientFor(cfg: SupabaseConfig): Promise<GoTrueClient> {
  const key = `${cfg.url}|${cfg.publishableKey}`;
  if (client?.key === key) return client.run;
  const run = import('@supabase/auth-js').then(({ AuthClient }) => new AuthClient({
    url: `${cfg.url}/auth/v1`,
    headers: { apikey: cfg.publishableKey },
    flowType: 'pkce',
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: false,
    storage: window.sessionStorage,
    storageKey: 'universe-supabase',
  }));
  client = { key, run };
  return run;
}

/** Start the trip to Discord or Google. The page leaves for Supabase. */
export async function startSignIn(cfg: SupabaseConfig, provider: SignInProvider, next: string): Promise<void> {
  try { sessionStorage.setItem(NEXT_KEY, next); } catch { /* ignore */ }
  const auth = await clientFor(cfg);
  const { error } = await auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw new Error(error.message);
}

/** The callback's outcome, once per code: React's development double run
 *  waits on the first rather than trading the code twice. */
let inFlight: { code: string; run: Promise<void> } | null = null;

/** Trade the one-time code for Supabase's token, have the server sign the
 *  player in, then end Supabase's own session. Throws on any failure. */
export function finishSignIn(cfg: SupabaseConfig, code: string): Promise<void> {
  if (inFlight?.code === code) return inFlight.run;
  const run = (async () => {
    const auth = await clientFor(cfg);
    const { data, error } = await auth.exchangeCodeForSession(code);
    if (error || !data.session) throw new Error('That sign-in did not work. Try again.');
    try {
      await api.completeSupabaseSignIn(data.session.access_token);
    } finally {
      // Supabase's session is not needed either way; ending it on Supabase
      // too means the token it holds stops working. A failure here does not
      // undo the Universe sign-in.
      await auth.signOut().catch(() => undefined);
    }
  })();
  inFlight = { code, run };
  return run;
}
