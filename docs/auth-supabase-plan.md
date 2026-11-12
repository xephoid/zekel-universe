# Sign-in with Discord and Google through Supabase (T09)

Plan for T09, written 2026-11-12 while T06 (the admin page) finished, and
kept up to date as it was built. Decision D5: Supabase Auth, Discord and
Google first, email sign-in link second. Code: `apps/server/src/supabaseAuth.ts`
(Supabase's PKCE flow and the token check), `finishSignIn` and the
`/api/auth/supabase/*` routes in `apps/server/src/app.ts`,
`apps/web/src/supabaseSignIn.ts` and the callback page in
`apps/web/src/pages/SignIn.tsx`.

## The shape

Supabase handles only the trip to Discord or Google and back. Universe keeps
everything it already has: its own accounts, its own sign-in cookie
(`universe_auth`), guests and their seats, socket checks, sign-out, and the
limits per IP address. The security work in T34, T35 and T36 stays as it is.

**The server runs Supabase's PKCE flow itself, so no Supabase token ever
reaches the browser,** and the browser needs no Supabase library.

1. The sign-in page shows "Sign in with Discord" and "Sign in with Google"
   when `GET /api/auth/providers` lists them.
2. A button calls `POST /api/auth/supabase/start`. The server makes a PKCE
   secret, keeps it in this browser in an HttpOnly cookie (`universe_oauth`,
   ten minutes; page scripts cannot read it), and answers with Supabase's
   authorize address, which carries only the secret's hash. The page goes
   there. The cookie is never cleared, only left to expire or replaced by a
   newer sign-in: a secret whose code is spent is useless, and keeping it
   lets a lost answer be recovered (step 9) and stops an older sign-in's late
   return from spoiling a newer one.
3. Discord or Google send the player back through Supabase to `/auth/callback`
   with a one-time code. The page clears it from the address bar and sends it
   to `POST /api/auth/supabase/complete`. A token in the address bar is never
   read.
4. The server trades the code and the cookie's secret for Supabase's tokens
   (`POST /auth/v1/token?grant_type=pkce`). Supabase accepts a code once, and
   only with the secret whose hash it was issued for, so a code is useless in
   any other browser. If Supabase is busy or down at this point, the page
   offers "Try again" with the same code; once the code is traded, any
   failure means starting again.
5. The server checks the access token anyway: the project's public key (the
   `jose` library, ES256 or RS256 only), issuer
   `https://<project>.supabase.co/auth/v1`, audience `authenticated`, not
   expired, made in the last five minutes, not anonymous. Then it asks
   Supabase for its record of the user (`GET /auth/v1/user`) for the email and
   whether it is confirmed: the token's own `user_metadata` can be edited by
   the user, so it is never trusted for that.
6. It finds or makes the Universe account (identity provider `supabase`,
   subject = the Supabase user id, in the existing `identities` table) and
   ends the sign-in as an email link does, in one transaction: end the
   browser's old session, move a guest's seats, tables and notifications to
   the account, issue the `universe_auth` cookie, cut the old sockets. That
   code is one shared function, `finishSignIn`, used by both routes.
7. The server ends that Supabase session (`POST /auth/v1/logout`, this
   session only), which ends its refresh token too, and drops the tokens.
   They were never sent anywhere.
8. The page then loads the next page afresh, so every part of the app starts
   again as the new account. Where it goes is parsed as an address and must
   be a page of this site (`//other.site` and `/\other.site` go home).
9. If the server's answer is lost, the page asks
   `POST /api/auth/supabase/resume` with the code. The session remembers the
   code and the browser's secret; if this browser holds it, the answer is
   yes. If the sign-in happened but its cookie never arrived, the server
   replaces that stranded session with one for this browser, within the ten
   minutes and only for the browser holding the secret.

Signing keys must be the newer asymmetric kind (the project setting "JWT
signing keys"): with the old shared secret there are no public keys, and
every sign-in is refused.

The email link's own cookie (`universe_signin`) is separate and untouched:
a pending email link and a Discord or Google sign-in in the same browser do
not interfere.

## Existing accounts and the admin page

- **Same email, same account.** If Supabase says the email is confirmed and a
  Universe account already has an email identity with that address, the new
  identity joins that account. An unconfirmed email never joins an account;
  it gets a new one.
- **The admin check (T06) needs no change.** It looks for an `email` identity
  matching `ADMIN_EMAILS`. A Discord or Google sign-in with a confirmed email
  also records an `email` identity for the account, so an admin can sign in
  either way.

## The email sign-in link

Stays as it is for now: it works, and it has had three security fixes. Moving
it to Supabase's own email link is the "second" step in D5, to decide after
Discord and Google are live.

## Settings

- `SUPABASE_URL` (the project address) and `SUPABASE_PUBLISHABLE_KEY`, both
  or neither, on the server only; the browser never needs either. The
  publishable key is public by design. No Supabase secret key is used.
- Listed in `render.yaml` (typed into Render) and `.env.example`. Values live
  in Render, never in the repository.
- No database change, and no change to the page's security policy.

## Set up outside the code (Zeke's accounts)

1. A Supabase project, with asymmetric JWT signing keys turned on.
2. A Discord application (Discord developer portal) and a Google OAuth client
   (Google Cloud console, with its consent screen). Both get the redirect
   address `https://<project>.supabase.co/auth/v1/callback`.
3. In Supabase: switch on the Discord and Google providers with those IDs and
   secrets; site address `https://zekel.games`; allowed return addresses
   `https://zekel.games/auth/callback`, the staging address's
   `/auth/callback`, and `http://localhost:5173/auth/callback`.
4. Copy the project address and publishable key into Render's
   `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (staging first).

## How it was built

1. "Finish sign-in" moved out of `/api/auth/email/complete` into a shared
   function. No change in behaviour.
2. First version: the browser ran the PKCE flow with Supabase's library and
   sent the access token to the server.
3. The buttons and the `/auth/callback` page; settings and deploy notes.
4. A security review (`docs/security-reviews/2026-11-12-e03e446-change.md`)
   and two rounds of review by Codex (GPT, read-only) found that a token in
   the browser could be used more than once or by someone else, and that the
   page could show a working sign-in as failed. Rather than guard the token,
   the server now runs the flow, as above, and the first version's extra
   table and browser library are gone.

Then a real sign-in with Discord and with Google on staging. That needs the
setup above done first.

## Decided (Zeke, 2026-11-12)

1. **Supabase plan:** free while building, Pro ($25 a month, never pauses)
   before launch. The free plan pauses a project after a week with no use,
   and sign-in would stop until someone restored it.
2. **Accounts join on a confirmed email:** yes, as above. An unconfirmed
   email always gets a new account.
3. **Universe's own email link stays at launch:** yes. Moving it to
   Supabase is decided later.
