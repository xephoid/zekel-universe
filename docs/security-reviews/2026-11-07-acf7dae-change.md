# Security review — 2026-11-07

Mode: change (merging `main` into the glue-kit split branch).
Commit and working-tree scope: the working tree over `acf7dae`
(`claude/glue-kit-split`) with `origin/main` at `7f6025b` merged in, before
the merge commit. Main brought the Warble Way Galaxy screen and theme
(`apps/web/src/glue/ww/`, `apps/web/src/glue/warble-way-galaxy.ts`, the
dev page `apps/web/src/pages/DevWw.tsx`, its captured moments and tests),
the game covers (`apps/server/src/storefront.ts`, `apps/server/src/app.ts`),
the log history read (`/api/tables/:id/events?history=1`,
`apps/server/src/events.ts`), the Neither Guts nor Gears fixes, the Word
Debauchee canvas and the design leftovers. This branch had moved the glue's
shared rules into `@zekel/glue-kit` and renamed the drawing packages into the
`@zekel` scope. The merge itself changed: one import conflict in
`warble-way-galaxy.ts` (both sides' imports kept); the incoming Warble Way
code repointed from `./types`, `@universe/shared` and `@universe/primitives`
to `@zekel/glue-kit`, `@zekel/wire-types` and `@zekel/primitives`; the dev
page reaching the game's screen through its glue module and the theme's
gallery pieces through a new barrel, `apps/web/src/glue/ww/gallery.ts`,
re-exported from `apps/web/src/glue/index.ts`. No other code was written.
Environment: local machine; the workspace typecheck, test suites and the web
build; no server, engine or browser run; no registry write.
Prior full review: [2026-10-13-b630be5-full.md](2026-10-13-b630be5-full.md).
Overall result: no issues found in tested scope.
Release recommendation: not ready for public deployment: F11, F12 and F13
from the full review remain open, the weekly full review is owed, and a
release-mode review is required before the first public deployment.

**The weekly full review is still owed** (last full review 2026-10-13). This
change review does not stand in for it.

## What changed in the merge

Everything main brought was reviewed on main in its own change reports
([2026-11-03](2026-11-03-1082d4f-change.md), [2026-11-04](2026-11-04-266a85f-change.md),
[2026-11-04 (merge)](2026-11-04-f5ead2e-change.md), [2026-11-05](2026-11-05-d159489-change.md)).
This report covers what the merge added on top: import paths only, plus one
barrel file and one re-export line. No route, socket event, parse, storage
or authorization path was written here. The one incoming server route change
(`?history=1` on the events feed) was read again: it keeps the same seat
check as the feed and strips each event's view, moves, menu and briefing, so
it discloses less than the feed it sits on.

## Coverage

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-01 | Entry points | PASS | The merge added no route or socket event of its own. The incoming `/dev/ww` page is inside the `import.meta.env.DEV` branch of the router, loaded lazily; the production build (`vite build`) contains no `DevWwPage`, no preview heading and no captured-moment path (`grep` over `dist/assets`). The incoming `?history=1` query reuses the feed's seat check | Not served from a production configuration |
| SEC-02 | Authorization | PASS (read) | The one incoming authorization-adjacent change (`history=1`) runs after `requirePrincipal` and the `not_seated` check, unchanged; server suite passes (81 tests, 1 skipped) | Not exercised against a live server |
| SEC-07 | Hidden information | PASS (read) | `historyEvent` nulls `engineMove`, `view`, `legalMoves`, `unavailable`, `moveMenu` and `briefing`; the per-seat `toWireEvent` is unchanged | Not re-run with marker values |
| SEC-09 | Agency and glue | PASS | 685 web tests in 32 files pass, including the 29 Warble Way screen, card, icon and hologram tests and the glue boundary test, which now covers the Warble Way folder: it imports only from its own folder, `@zekel/glue-kit`, `@zekel/primitives`, `@zekel/wire-types` and React, and the web app reaches it only through `glue/index.ts`. The glue-kit suite passes (12 tests) | Not played in a browser |
| SEC-11 | Browser content | PASS | No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` in the Warble Way glue or dev page; the merge changed no rendering | |
| SEC-14 | Secrets and disclosure | PASS | The merge-touched files were scanned for key, secret, password, bearer and token words: only `anger_tokens` and the race `Token` component matched. No `.env` file or local path is staged; the untracked `.env.bak` stays untracked. The one untracked PDF that main also tracks was byte-identical to main's copy | |
| SEC-18 | Dependencies, build and supply chain | PASS | Main changed no `package.json` or lockfile entry; `pnpm install --frozen-lockfile` succeeded with the branch's lockfile. `pnpm typecheck` (six packages, server, web) and `pnpm --filter @universe/web build` pass | No audit run (registry set unchanged); no publish run |
| SEC-19 | Deployment | NOT RUN | No hosting, CI or configuration change in the merge | |
| SEC-20 | UI integration | PASS (suite) | The Warble Way screen tests press its buttons through the captured moments; the dev page is development-only | Not played in a browser |

## Regression recipes

None re-run. None of R1 to R10 touch the merge's own changes; R7 is the one
closest to the incoming `history=1` read and is owed in the next full review.

## Untested surfaces and blockers

- The weekly full review is owed; it should include R7 against the history
  read and the real engine for Warble Way's new screen.
- A release-mode review is required before public deployment.
- The published packages are still unpublished; nothing here changes that.
