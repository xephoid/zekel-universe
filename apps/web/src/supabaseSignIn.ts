// Sign-in with Discord or Google through Supabase (T09). The server runs
// Supabase's PKCE flow (apps/server/src/supabaseAuth.ts): it keeps the
// secret in an HttpOnly cookie and trades the code itself, so this page
// never holds a Supabase token and needs no Supabase library. The page only
// asks the server where to go, goes, and hands the server the one-time code
// Discord or Google send back.

import { api, ApiRequestError } from './api';
import { leaveTo } from './leave';

export type SignInProvider = 'discord' | 'google';

/** Where the player goes after signing in: the same key the email link uses. */
export const NEXT_KEY = 'universe:signin:next';

/** Start the trip to Discord or Google. The page leaves for Supabase. */
export async function startSignIn(provider: SignInProvider, next: string): Promise<void> {
  try { sessionStorage.setItem(NEXT_KEY, next); } catch { /* ignore */ }
  const { url } = await api.startSupabaseSignIn(provider);
  leaveTo(url);
}

const REFUSED = 'That sign-in did not work. Try again.';
const UNREACHABLE = 'We could not reach the server to finish signing you in. Check your connection and sign in again.';

/** The completion, once per code: React's development double run waits on
 *  the first rather than sending the code twice. */
let inFlight: { code: string; run: Promise<void> } | null = null;

/** Hand the code to the server, which signs the player in. When the answer
 *  is lost or refused, ask the server whether this code signed this browser
 *  in after all (an earlier answer may have been lost); only that counts.
 *  Throws with a message for the player otherwise. */
export function finishSignIn(code: string): Promise<void> {
  if (inFlight?.code === code) return inFlight.run;
  const run = (async () => {
    try {
      await api.completeSupabaseSignIn(code);
    } catch (e) {
      const made = await api.supabaseSignInStatus(code).then((r) => r.signedIn === true, () => false);
      if (made) return;
      if (e instanceof ApiRequestError) throw new Error(e.message || REFUSED);
      throw new Error(UNREACHABLE);
    }
  })();
  inFlight = { code, run };
  return run;
}
