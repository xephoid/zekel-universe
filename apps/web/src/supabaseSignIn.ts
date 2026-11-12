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

/** Why a sign-in did not finish, for the player. `retry`: the same code
 *  can be tried again (the server or Supabase did not answer). */
export class SignInError extends Error {
  constructor(message: string, readonly retry: boolean) { super(message); }
}

const UNREACHABLE = 'We could not reach the server to finish signing you in. Check your connection and try again.';

/** The completion in flight, per code: React's development double run waits
 *  on the first rather than sending the code twice. A failure lets the same
 *  code be tried again. */
let inFlight: { code: string; run: Promise<void> } | null = null;

/** Hand the code to the server, which signs the player in. Sending it
 *  again is safe (the same browser gets the same session back), so when the
 *  answer is lost on the way, it is sent once more. Throws a SignInError
 *  otherwise; `retry` only when the server or Supabase did not answer, so
 *  the same code may still work. */
export function finishSignIn(code: string): Promise<void> {
  if (inFlight?.code === code) return inFlight.run;
  const run = (async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        await api.completeSupabaseSignIn(code);
        return;
      } catch (e) {
        if (e instanceof ApiRequestError) {
          throw new SignInError(e.message, e.code === 'sign_in_unavailable' || e.code === 'too_many_requests');
        }
        if (attempt >= 1) throw new SignInError(UNREACHABLE, true);
      }
    }
  })();
  const entry = { code, run };
  inFlight = entry;
  run.catch(() => { if (inFlight === entry) inFlight = null; });
  return run;
}

/** Where to go after signing in: a page of this site only. The address is
 *  parsed as the browser will read it, so `//other.site`, `/\other.site` and
 *  full addresses elsewhere all go home instead. */
export function safeNext(next: string | null): string {
  if (!next) return '/';
  try {
    const url = new URL(next, window.location.origin);
    // The whole checked address, not its path: a path such as `//other.site`
    // would be read as another site.
    return url.origin === window.location.origin ? url.href : '/';
  } catch {
    return '/';
  }
}
