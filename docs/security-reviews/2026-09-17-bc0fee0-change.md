# Security review — 2026-09-17 (design pass)

Mode: change (the pages brought back to the design canvas: the shell, home,
game, setup, lobby, sign-in, profile, designer, rules and watch pages, the
table's bar and end panel, the tokens, and the specs that follow them)
Commit and working-tree scope: the working tree on top of commit bc0fee0 on
`main`, committed in pieces right after this report. Changed surfaces: web
presentation only (`apps/web/src/app.css`, `ui.tsx`, the page files, the
table's parts, two glue label changes), the tokens package, and the browser
specs' selectors. No server, engine-client, contract or engine change.
Environment: local machine, synthetic fixtures only; the browser specs
against the local review stack (sibling engine, server on a local SQLite
file, Vite dev server).
Prior full review: none; the prior change review is
[2026-09-17-90ec548-change.md](2026-09-17-90ec548-change.md).
Overall result: no issues found in the tested scope; the earlier findings
still open.
Release recommendation: not applicable (no deployment yet).

## Coverage

Selected under change mode: SEC-01, SEC-02, SEC-14 and SEC-18 (always) and
the "React, content, images, URLs" row (SEC-07, SEC-10 through SEC-12,
SEC-15, SEC-20). Every other domain is outside this change's scope and was
not run; no code in those domains changed.

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-01 | Entry points | PASS | None added or changed; the pages call the same API routes as before (the bar's search runs in the browser over the catalog already loaded) | |
| SEC-02 | Authorization | PASS | Unchanged; the pages show what the same routes return. The bar's count of turns waiting comes from `/api/my-tables`, which needs the caller's own principal | |
| SEC-07 | Hidden information | PASS | The Fractured Fist glue now names seats by engine id for a watcher instead of calling both "Opponent"; it draws the same public view. The Sweetlands glue's own bench card shows fewer of the seat's own counts; the other seats' cards are unchanged | |
| SEC-10 | Validation | PASS | The setup page builds the same request as before from its new controls (a seat is AI with a level or a friend; the mode is live or turns); the Start button waits until every choice is made, with the reason shown beside it | |
| SEC-11 | Browser content | PASS | Names, bios, updates and descriptions render as text through React; the only inline SVG is a static chevron in the stylesheet; no HTML is built from data. Avatars are an initial on a color computed from the name | |
| SEC-12 | Outgoing requests | PASS | None added; fonts stay self-hosted | |
| SEC-14 | Secrets and published artifacts | PASS | Changed files scanned for local paths, addresses and token-like strings: none. The stylesheet's numbers are transcribed from the project's own design canvas | |
| SEC-15 | Privacy | PASS | The bar shows the signed-in name or the guest name as before; the count badge shows a number only | |
| SEC-18 | Dependencies, CI | PASS with note | No dependency change; the specs' selectors follow the new controls and headings | F01 unchanged |
| SEC-20 | UI integration | PASS (reproduced) | All eight browser tests pass against the redesigned pages (setup through the segmented seat controls and the mode cards, the lobby, sign-in, the storefront, the end panel); the web unit suite passes | |

## Findings

No new findings.

### Earlier findings

- SEC-18-F01, SEC-08-F02, SEC-04-F03, SEC-15-F07, SEC-16-F08: open, unchanged.

## Execution

Commands/tools and versions: Node 24 locally (CI uses 22), pnpm 10, vitest
2, Playwright 1.63 with Chromium, the sibling engine at its current commit;
Playwright screenshots of every page at the canvas's 1440x900 for the
side-by-side with `docs/design`.
Tests passed/failed/skipped; real engine versus stub: web 6 files passed;
typecheck clean; the eight browser tests passed against the live engine
(seven in one run and the Fractured Fist game alone after its selector
change, 3.2 minutes).
Browser/transport/configuration coverage: Chromium through Playwright;
development configuration.
Dependency and secret scan scope/date: no dependency change; changed files
scanned on 2026-09-17.
Checks blocked/not run and exact reason: the domains listed above as
outside scope; Postgres and compose (Docker unavailable).
Prior findings rechecked, fixed, reopened, or still unverified: all
rechecked against the diff, still open, surfaces unchanged.
Files changed and temporary-resource cleanup: the review stack's SQLite
file is ignored by git and deleted after the run.
Next required review: a full review at the first development session of the
next active week (still due), and a release review before the first deploy.
