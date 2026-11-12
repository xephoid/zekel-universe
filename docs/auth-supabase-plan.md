# Sign-in with Discord and Google through Supabase (T09)

Plan for T09, written 2026-11-12 while T06 (the admin page) finished, and
kept up to date as it was built. Decision D5: Supabase Auth, Discord and
Google first, email sign-in link second. Code: `apps/server/src/supabaseAuth.ts`
(the token check), `finishSignIn` and the two routes in `apps/server/src/app.ts`,
`apps/web/src/supabaseSignIn.ts` and the callback page in
`apps/web/src/pages/SignIn.tsx`.

## The shape

Supabase handles only the trip to Discord or Google and back. Universe keeps
everything it already has: its own accounts, its own sign-in cookie
(`universe_auth`), guests and their seats, socket checks, sign-out, and the
limits per IP address. The security work in T34, T35 and T36 stays as it is.

1. The sign-in page gets two buttons, "Sign in with Discord" and "Sign in with
   Google", shown only when the server offers them. A button first asks the
   server for its sign-in cookie (`POST /api/auth/supabase/start`, the same
   cookie an email link sets), which completion requires. Then it calls Supabase's
   sign-in library (`@supabase/auth-js`, `signInWithOAuth`, PKCE flow), which
   sends the player to Discord or Google and back to a new page,
   `/auth/callback`, with a one-time code.
2. That page trades the code for Supabase's access token (only this browser
   can: it holds the PKCE secret from step 1) and sends the token to a new
   server route, `POST /api/auth/supabase/complete`. A token in the address
   bar is never read.
3. The server checks the token against the Supabase project's public keys
   (the `jose` library, the project's JWKS address, issuer
   `https://<project>.supabase.co/auth/v1`, audience `authenticated`, not
   expired, made in the last five minutes, not anonymous, with a Supabase
   session id). Then it asks
   Supabase for its record of the user (`GET /auth/v1/user`) for the email and
   whether it is confirmed: the token's own `user_metadata` can be edited by
   the user, so it is never trusted for that.
4. It finds or makes the Universe account with identity provider `supabase`,
   subject = the Supabase user id, in the existing `identities` table.
5. **A Supabase session signs in once.** The session id's hash goes into a new
   table, `supabase_sign_ins` (database version 9, after T06's 8), in the same
   transaction that makes the Universe session. A second use of the same
   token, at the same moment or later, fails there and changes nothing. Rows
   are cleared after a day.
6. The rest is what `/api/auth/email/complete` does now, in one transaction:
   end the browser's old session, move a guest's seats, tables and
   notifications to the account, issue the `universe_auth` cookie, cut the old
   sockets. That code moves into one shared "finish sign-in" function that
   both routes call.
7. The server then ends that Supabase session (`POST /auth/v1/logout`, this
   session only), and so does the browser (`signOut({ scope: 'local' })`):
   the player's Supabase sessions elsewhere are left alone. The Universe
   cookie is the only sign-in that counts.
8. If the server's answer is lost, the page asks
   `POST /api/auth/supabase/status` whether this browser's session was made
   by that token's Supabase session, as the email link's landing page does.

The only new thing the server trusts is "a token signed by our Supabase
project". Signing keys must be the newer asymmetric kind (the project setting
"JWT signing keys"): with the old shared secret there are no public keys to
check against.

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
  or neither, on the server only. The sign-in page gets them from
  `GET /api/auth/providers` while running, so the same build works on
  staging and production. The publishable key is public by design.
- Listed in `render.yaml` (typed into Render) and `.env.example`. Values live
  in Render, never in the repository.
- The page's security policy (`connect-src`) gains the project address when
  it is set.

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

## Steps, one commit each

1. Done: "finish sign-in" moved out of `/api/auth/email/complete` into a
   shared function. No change in behaviour.
2. Done: the server route and the token check. Tests use a key pair made in
   the test (no network). Refused, with nothing changed: no token, another
   key, another project, another audience, expired, older than five minutes,
   anonymous, unknown to Supabase, Supabase's record for someone else,
   unsigned. Accepted: a new account; a returning one; joining an email
   account on a confirmed email only; the admin check; a guest's move; the
   old session ended.
3. Done: the two buttons and the `/auth/callback` page, with page tests.
4. Done: settings, `render.yaml`, `.env.example`, deploy notes.
5. Done: security review, `docs/security-reviews/2026-11-12-e03e446-change.md`.
   It found one problem, fixed: a used token could sign in again for five
   minutes.
6. Done: fixes from Codex's review (four findings): a Supabase session signs
   in once (version 9 table); the sign-in cookie; the browser ends only its
   own Supabase session; the status question for a lost answer; and tests
   that prove what they claim. The review is updated to match.

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
