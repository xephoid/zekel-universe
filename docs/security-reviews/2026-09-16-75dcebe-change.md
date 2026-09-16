# Security review — 2026-09-16 (second pass)

Mode: change (friends, table invites, the test outbox, the brief's design
system with self-hosted fonts, the redesigned pages, the browser specs for
sign-in and two-human play, and CI)
Commit and working-tree scope: the working tree on top of commit 75dcebe on
`main`, committed in pieces right after this report. Changed surfaces:
server routes and tests (`apps/server/src/app.ts`, `index.ts`,
`rest.test.ts`), the wire contract (`packages/shared`), the web pages, API
client and Cybernoir glue (`apps/web/src`), tokens and primitives CSS, the
fonts under `apps/web/public/fonts` with `ATTRIBUTIONS.md`, the browser
specs under `e2e/`, the CI workflow, and documentation (README, the plan,
the brief, the design canvas, the wordmark, the agent instructions and the
playbook itself).
Environment: local machine, synthetic fixtures only. Unit and integration
tests ran against the scripted fake engine and an in-memory SQLite
database. The three browser specs ran against a local review stack: the
rebuilt sibling engine, the server on a local SQLite file with the console
mail transport and the test outbox on, and the Vite dev server. Synthetic
addresses under `example.com` only. No real email, no real users, no
production system.
Prior full review: none; the prior change review is
[2026-09-16-6dfda30-change.md](2026-09-16-6dfda30-change.md).
Overall result: issues found; two fixed in this pass (F04, F05), one
recorded as an accepted exception with its condition (SEC-06), the three
earlier findings still open.
Release recommendation: not applicable (no deployment yet).

## Coverage

Selected under change mode: SEC-01, SEC-02, SEC-14 and SEC-18 (always), the
"database, notifications, email" row (SEC-03, SEC-06, SEC-09, SEC-13
through SEC-17, SEC-19), the "React, content, static files" row (SEC-07,
SEC-10 through SEC-12, SEC-15, SEC-20) and the "CI" row (SEC-05, SEC-14
through SEC-19). SEC-04, SEC-08, SEC-21 and SEC-22 are outside this
change's scope and were not run; the earlier report's outcomes for them
stand unchanged because their code did not change.

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-01 | New entry points: five friends routes, five invite routes, the test outbox | PASS | Inventory below. The outbox route is registered only when `buildApp` is given `testOutbox`, which `index.ts` sets only from `E2E_TEST_OUTBOX=1` and refuses under production (`rest.test.ts`: off by default, on on demand; `index.ts` throws in production) | The outbox exposes every mailed link on the test server; the flag must never reach a shared environment (README says so) |
| SEC-02 | Authorization on friends and invites | PASS | `rest.test.ts`: friends need an account (guest 403); accept and delete check the caller is a party to the row; inviting needs a seat at a lobby table (guest 403, non-seated user 403); inviting by user id resolves only for an accepted friend (404 otherwise); accepting an invite checks the recipient and pending status, then goes through the ordinary join (an open seat is taken or it fails the same way); the invite list of a table needs a seat | Ending a friendship does not withdraw pending invites already sent through it (they still need an open seat and the recipient's accept) |
| SEC-03 | Sign-in through the browser | PASS | `e2e/sign-in.spec.ts` against the live stack: a guest's table moves to the account on completion, the nav shows the account, sign-out returns it to the signed-out state; a used link and a made-up token both show the same plain message | Unchanged server code; the spec covers the browser path the earlier report lacked |
| SEC-05 | Origins on the new routes | PASS | The new POST and DELETE routes sit under the same non-GET Origin hook (`rest.test.ts`: foreign Origin POST 403); `e2e/cybernoir-two-browser.spec.ts` drives two real browser contexts through sockets on the configured origin | R4 (a hostile page in a real browser) still not run |
| SEC-06 | Address lookup, invitation and sign-in link abuse | PASS with accepted exception | Looking up another account by its sign-in address (friend request, invite by email) answers "no account" or proceeds: that is an account-existence oracle, kept on purpose as the one discovery channel in v0. Both paths now share one budget of 20 lookups per user per 15 minutes (F04, `rest.test.ts`: a fourth lookup of either kind is 429; the budget is per user; inviting an accepted friend by id is not charged). Only accounts can look up, so a trawl costs a sign-in per 20 probes and is itself limited by the sign-in link limits. An invite creates one notification row for the recipient; duplicates are refused (`already_invited`). Sign-in links keep five per address per 15 minutes and now have a separate budget of 30 per client address (`rest.test.ts`: with the budget lowered to two, a third address from one client is 429), because the shared five-per-client budget refused the third person signing in from one office or one test run (F05) | Accepted exception: the oracle stays until v1 decides on usernames or invite codes. Recheck if guests ever gain the route or the budget changes. No email is sent for an invite yet |
| SEC-07 | Hidden information in the browser | PASS (reproduced in two browsers) | `e2e/cybernoir-two-browser.spec.ts`: two signed-in humans at one live Cybernoir table; each browser's events feed carries its own role, its own private zone as an array, and never the other's private keys or card names (matched as JSON keys, not substrings, since the public block has `location_hand_size`); only the seat to move holds legal moves; a stranger's signed-in browser gets 403 from the feed. This is R8 | The friends list returns display names and the friendship date; invites return display names and the game name, never addresses |
| SEC-09 | Game actions from invites | PASS | Accepting an invite is the join path; the table's status guard and seat rules in `tables/service.ts` are unchanged and tested in `move-flow.test.ts` | Idempotency (F02) unchanged |
| SEC-10 | Validation on the new routes | PASS | Addresses trimmed, lower-cased and shape-checked (400 otherwise); ids are opaque strings looked up by equality through Kysely; inviting needs an address or an id (400); self-friend and self-invite refused | No nested payloads on these routes |
| SEC-11 | Browser content, fonts, content security policy | PASS (reproduced) | The Google Fonts stylesheet link was removed; the four families are served from `apps/web/public/fonts` and declared in `apps/web/src/fonts.css`, so the existing policy (`style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`) needs no third-party hosts. In the built-in browser: the fonts load, and the network log shows no request to any host other than the app's own. The redesigned pages render engine text through React as text; no `dangerouslySetInnerHTML` was added (grep) | Inline styles still allowed for the primitives' style props |
| SEC-12 | Outgoing requests | PASS | No new outbound call; the fonts moved a browser-side outbound request (to Google) into the app's own origin, which also removes a visitor IP disclosure to a third party | |
| SEC-13 | Persistence for friends and invites | PASS (SQLite) / BLOCKED (Postgres) | The `friendships`, `invites` and `notifications` tables already existed at schema version 2; a cross-request (both sides ask) collapses into one accepted row; duplicate pending invites refused by lookup before insert | The duplicate-invite check is not a unique index, so two simultaneous invites to one person can both land (harmless: one seat, one accept). Postgres still not run here (Docker unavailable); CI runs it |
| SEC-14 | Secrets and published artifacts | PASS | Changed and new files scanned for local paths, personal addresses, and token-like strings: none (only `example.com` fixtures). No `.env` in the tree or history. The fonts are binary OFL files; `ATTRIBUTIONS.md` credits Slackey, Bricolage Grotesque, IBM Plex Sans and IBM Plex Mono under OFL 1.1 | The `rest.test.ts` outbox test prints a link with an in-memory test token to the test log; it is never a real credential |
| SEC-15 | Privacy and caching | PASS | The friends and invites responses are under `/api/` and therefore `no-store`; a friend sees a display name and a date; an invitee sees the sender's display name and the game; the sender sees the recipient's display name only after a successful lookup they were entitled to make | F03 (local snapshot on sign-out) unchanged |
| SEC-16 | Abuse and cost | PASS | Lookup budget (F04); invites limited by seats (409 `table_full`) and by one pending invite per person per table; friend rows bounded by the lookup budget | Limits remain in-process |
| SEC-17 | Logs | PASS (source) | The new routes log nothing; the console mailer still prints links only outside production, and the outbox returns them to the test only | |
| SEC-18 | Dependencies, CI, supply chain | PASS with note | No dependency changed (no `package.json` or lockfile diff). CI now sets `E2E_TEST_OUTBOX=1` on the job's own test server so the sign-in specs can read the console mailer; that server is the job's, never a deployment | F01 (actions pinned by tag) unchanged |
| SEC-19 | Deployment and operations | PASS (local) / BLOCKED (compose) | `index.ts` refuses the outbox flag in production, so a copied CI environment cannot expose links on a deploy | Compose still not run here |
| SEC-20 | UI integration | PASS | The Cybernoir glue now accepts the engine's hideout as an object (`borough`, `population`, `affiliation`) and shows it as a stat; the lit ring in the dark theme uses its own token so legal moves are visible (measured in the built-in browser); the lobby seats a signed-in arrival by link and only the host's start button appears once everyone is ready (both specs) | Duplicate-click behaviour unchanged (F02) |
| SEC-21, SEC-22 | Uploads, designer tools, voice, model | NOT APPLICABLE | Still no such surface | Activation unchanged |

Regression recipes this pass: R7 and R8 are now run in real browsers by the
Cybernoir spec; R3 is run in a real browser by the sign-in spec; R1, R2, R5
and R6 stay in the unit suite. R4, R9 and R10 were not run.

## Findings

### SEC-06-F04 — Inviting by email had no lookup budget

- Severity and confidence: P2, source-confirmed; fixed in this pass.
- Affected entry point and source link: `POST /api/tables/:id/invites` in [apps/server/src/app.ts](../../apps/server/src/app.ts).
- Actor, preconditions, and violated boundary: any signed-in user seated at one lobby table could look up an unbounded number of addresses, learning which have accounts, and drop one notification on each account found. The friend-request route had a budget of 20 per 15 minutes; the invite route had none, so the budget could be bypassed.
- Expected versus observed behavior: expected one budget for every lookup of an account by address; observed the invite path outside it.
- Minimal synthetic reproduction and side-effect assertions: `rest.test.ts` "address lookups share one budget across friend requests and email invites": with the budget lowered to 3, two invite misses and one friend-request miss use it, and a fourth lookup of either kind is 429 before any lookup runs; another user keeps their own budget; inviting an accepted friend by id is not charged.
- Impact and affected milestones: account discovery and notification spam (M2).
- Proposed fix and regression test: done. One `lookupLimiter` shared by both routes, sized by the `limits.lookupsPerUser` option so tests can lower it.
- Status, owner, next action, and review date: fixed 2026-09-16; recheck whenever a new route looks up an account by address.

### SEC-06-F05 — One sign-in link budget served both the address and the client

- Severity and confidence: P3, reproduced (the browser specs' second run in 15 minutes was refused).
- Affected entry point and source link: `POST /api/auth/email/link` in [apps/server/src/app.ts](../../apps/server/src/app.ts).
- Actor, preconditions, and violated boundary: availability, not confidentiality. Five requests from one client address in 15 minutes, for any mix of addresses, refused the sixth; several people behind one address could not all sign in.
- Expected versus observed behavior: a per-address budget that protects an inbox and a wider per-client budget that still bounds a trawl; observed one budget of five for both keys.
- Minimal synthetic reproduction and side-effect assertions: `rest.test.ts` "rate limits sign-in links per client address with its own, larger budget".
- Impact and affected milestones: sign-in availability behind shared addresses (M2); flaky browser specs.
- Proposed fix and regression test: done; the per-client budget is `limits.linksPerIp` (default 30 per 15 minutes).
- Status, owner, next action, and review date: fixed 2026-09-16; recheck at the release review with the proxy's client address handling.

### Earlier findings

- SEC-18-F01 (actions pinned by tag): open, unchanged; pin before the first deploy.
- SEC-08-F02 (no socket message rate limit or idempotency key): open, unchanged; with the next server pass.
- SEC-04-F03 (no session rotation; local snapshot survives sign-out): open, unchanged; with the next server and web pass.

## Execution

Commands/tools and versions: Node 24 locally (CI uses 22), pnpm 10, vitest
2, Playwright 1.58 with Chromium, the engine built from the sibling
checkout; `git grep` and a regular-expression scan over the changed files
for secrets and private information; the built-in browser's network log for
third-party requests.
Tests passed/failed/skipped; real engine versus stub: server 57 passed and
1 skipped (Postgres, no `TEST_DATABASE_URL`); web 39 passed; typecheck clean
in every package. Browser specs against the live engine: sign-in (two tests)
passed, the two-browser Cybernoir table passed, and the full Fractured Fist
game passed, alone and as one run of all three. The game spec had waited
forever for a pace button the redesigned table moved into its settings
sheet, and the Playwright configuration had no action timeout, so it now
fails a stuck action after 30 seconds instead of hanging.
Browser/transport/configuration coverage: Chromium through Playwright with
two independent browser contexts, and the built-in browser by hand for the
dark theme and font loading; development configuration with the test
outbox on.
Dependency and secret scan scope/date: no dependency change; the production
audit of the earlier report (2026-09-16) still applies; changed and new
files scanned for local paths, personal addresses and token-like strings on
2026-09-16.
Checks blocked/not run and exact reason: Postgres and compose (Docker
unavailable on the build machine; CI runs the Postgres test); R4, R9, R10;
SEC-04, SEC-08, SEC-21 and SEC-22 outside this change's scope.
Prior findings rechecked, fixed, reopened, or still unverified: F01, F02
and F03 rechecked against the diff, still open, no change to their surfaces.
Files changed and temporary-resource cleanup: the review stack used a
throwaway SQLite file that is ignored by git and deleted after the run; the
Playwright results directory is ignored by git.
Next required review: a full review at the first development session of the
next active week (still due from the earlier report), and a release review
before the first deploy.

## Entry-point inventory added at this revision

REST: `GET /api/friends`, `POST /api/friends/requests`,
`POST /api/friends/requests/:id/accept`, `DELETE /api/friends/requests/:id`,
`DELETE /api/friends/:userId`, `POST /api/tables/:id/invites`,
`GET /api/tables/:id/invites`, `GET /api/invites`,
`POST /api/invites/:id/accept`, `POST /api/invites/:id/decline`; and, only
when the server is started with `E2E_TEST_OUTBOX=1` outside production,
`GET /api/test/outbox`.
Socket: unchanged. Outbound: unchanged. Static: the six font files under
`/fonts/`.
