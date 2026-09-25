# Security review — 2026-09-25

Mode: change (the table log built from the engine's own log entries: a new
public event column, a schema migration, engine data on the wire)
Commit and working-tree scope: the working tree on `main` over `fcca74d`,
committed right after this report. Changed surfaces: shared types
(`LogLine`, `TableEventWire.log`), the engine client's schemas, the database
schema (version 5: `table_events.log_entries`, with its migration), the
server's event writing and reading (`logLinesOf`), the table page's log, and
tests. The paired engine change is on the engine branch
`claude/ngg-log-headlines`.
Environment: local machine. Server tests in-process with the fake engine and
a scratch SQLite file; page tests under jsdom; a live game against the
local engine (built from that branch), the restarted server (which migrated
the local database to version 5) and Vite.
Prior full review: none. The latest change review is
[2026-09-25-bd752d0-change.md](2026-09-25-bd752d0-change.md). A full review
is still due.
Overall result: no findings.
Release recommendation: not applicable (no deployment yet).

## Coverage

Engine text is stored and sent to every seat, and the schema changes, so
SEC-07, SEC-10 and SEC-13 carry the weight. Selected: SEC-01, SEC-02,
SEC-07, SEC-09, SEC-10, SEC-11, SEC-13, SEC-14, SEC-18.

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-01 | Entry points | PASS | No route or socket event added; the existing event carries one more field | |
| SEC-02 | Authorization | PASS | Nothing new is accepted from a client | |
| SEC-07 | Hidden information | PASS | The lines are the engine's public log (its contract keeps hands, face-down cards and spy hosts out; the engine's `logDetail` test checks it). They are stored once per event and are the same for every seat; `socket-privacy.test.ts` checks both seats get identical lines, and per-seat payloads still never cross. A seat's "your" reading is chosen in the browser from the public line | Relies on the engine keeping its log public-only |
| SEC-09 | Agency | PASS | The log sends nothing; opening a line only shows text | |
| SEC-10 | Validation | PASS | `logLinesOf` keeps at most 200 entries per event, each needing a numeric seq and a summary; summaries are cut to 1000 characters, headlines to 200, ids to 40; a subject without its own line and a loss without a subject are dropped (`log-lines.test.ts`) | |
| SEC-11 | Browser content | PASS | Lines render as text through React's escaping; no raw HTML | |
| SEC-13 | Data and migrations | PASS | Schema 5 adds `log_entries` with a default, only when missing, so a table created fresh in the same run is not altered twice; an existing events table keeps its rows (`db.test.ts`: version 2 and version 4 upgrades). Postgres migration not run here (no test database) | Postgres path untested locally |
| SEC-14 | Secrets and artifacts | PASS | Diff searched for credentials and local paths: none | |
| SEC-18 | Dependencies | PASS | No dependency or lockfile change | |

## Execution

Commands/tools and versions: `npx tsc --noEmit` for shared, engine client,
server and web; `npx vitest run` in `apps/web` (329 passed) and
`apps/server` (77 passed, 1 skipped) (vitest 2.1.9); the engine's full suite
on its branch (3,907 passed, 1 skipped); a live Playwright (Chromium) game of
70 decisions with screenshots of the log.
Dependency and secret scan scope/date: 2026-09-25, the working-tree diff.
