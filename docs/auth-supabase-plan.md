# Sign-in with Discord and Google through Supabase (T09)

Plan for T09, written 2026-11-12 while T06 (the admin page) finishes. Decision
D5: Supabase Auth, Discord and Google first, email sign-in link second. No code
yet. The work starts from `main` after T06 merges.

## The shape

Supabase handles only the trip to Discord or Google and back. Universe keeps
everything it already has: its own accounts, its own sign-in cookie
(`universe_auth`), guests and their seats, socket checks, sign-out, and the
limits per IP address. The security work in T34, T35 and T36 stays as it is.

1. The sign-in page gets two buttons, "Sign in with Discord" and "Sign in with
   Google". Each calls Supabase's browser library (`signInWithOAuth`, PKCE
   flow), which sends the player to Discord or Google and back to a new page,
   `/auth/callback`.
2. That page takes the Supabase access token and sends it to a new server
   route, `POST /api/auth/supabase/complete`.
3. The server checks the token against the Supabase project's public keys
   (the `jose` library, the project's JWKS address, issuer
   `https://<project>.supabase.co/auth/v1`, audience `authenticated`, not
   expired). It reads the Supabase user id, the email and whether the email
   is confirmed.
4. It finds or makes the Universe account with identity provider `supabase`,
   subject = the Supabase user id. The `identities` table already fits, with
   its unique index on (provider, subject), so **no database change is
   needed** and no version number can clash with T06's version 8.
5. The rest is what `/api/auth/email/complete` does now, in one transaction:
   end the browser's old session, move a guest's seats, tables and
   notifications to the account, issue the `universe_auth` cookie, cut the old
   sockets. That code moves into one shared "finish sign-in" function that
   both routes call.
6. The browser then signs out of Supabase straight away. The Universe cookie
   is the only sign-in that counts.

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

- Server: `SUPABASE_URL` (for the public keys and the issuer).
- Web build: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The
  publishable key is meant to be public.
- Added to `render.yaml`, `.env.example` and `infra/server.Dockerfile` as
  needed. Values live in Render, never in the repository.

## Set up outside the code (Zeke's accounts)

1. A Supabase project, with asymmetric JWT signing keys turned on.
2. A Discord application (Discord developer portal) and a Google OAuth client
   (Google Cloud console, with its consent screen). Both get the redirect
   address `https://<project>.supabase.co/auth/v1/callback`.
3. In Supabase: switch on the Discord and Google providers with those IDs and
   secrets; site address `https://zekel.games`; allowed return addresses for
   production, staging and `http://localhost:5173`.

## Steps, one commit each

1. Move "finish sign-in" out of `/api/auth/email/complete` into a shared
   function. No change in behaviour; the existing tests prove it.
2. The new server route and the token check, with tests that use a key pair
   made in the test (no network). Refused: wrong issuer, wrong audience,
   expired, unsigned, signed by another key. Accepted: a new account; a
   returning one; joining an email account on a confirmed email only; a
   guest's seats moving over; the old session ended.
3. The two buttons and the `/auth/callback` page, with page tests.
4. Settings, `render.yaml`, `.env.example`, deploy notes.
5. A security review in `docs/security-reviews/`, then a PR.

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
