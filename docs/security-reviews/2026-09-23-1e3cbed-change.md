# Security review — 2026-09-23

Mode: change (the city takes the height the table has left, instead of making
its own height out of its width and running off the bottom)
Commit and working-tree scope: the working tree on top of commit 1e3cbed on
`main`, committed right after this report. Changed surfaces: the shared
primitives (one optional `MapData` field, the map's layout and a pill's
width), the glue contract (`span: 'row'`), the Cybernoir glue, the board's
layout in the table page, styles and tests. No server, wire, database,
dependency, configuration or engine change, and no new move path.
Environment: local machine. Unit and page tests under jsdom; browser checks
against the local stack — engine on 8787, server on 8790, Vite on 5173 —
played as the Hacker at three window sizes.
Prior full review: none; the prior change review is
[2026-09-23-40a66e9-change.md](2026-09-23-40a66e9-change.md).
Overall result: no issues found in the tested scope. One defect in an earlier
draft of this change was caught by measurement and fixed before commit; it is
recorded below because it is the kind that matters.
Release recommendation: not applicable (no deployment yet).

## Coverage

This is a layout change, so nothing new crosses the wire and no new
information is produced. What a layout change can still get wrong is geometry:
a panel drawn over another panel puts a tap somewhere the player did not mean
it. That is an agency question, so SEC-09 carries the weight here. Selected:
SEC-01, SEC-07, SEC-09, SEC-10, SEC-11, SEC-14, SEC-18.

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-09 | Agency: nothing is drawn over anything | PASS (reproduced) | Two drafts of this change let a box shrink below its contents — once the board over the band beneath it, once the band out of the board and under the move menu. Both were found by measuring the live page, not by reading it, and both are fixed by keeping `min-height: auto` throughout so the table scrolls instead. Now asserted live at 1440×900, 1440×700 and 1100×620: the board's bottom never passes the band's top, the board never goes below its floor, and the nineteen places always sit in exactly three rows | A CSS regression cannot be caught by the jsdom tests, which do no layout; the guarantee is held by the live check and by the floor being expressed in the data rather than in a stylesheet |
| SEC-09 | Agency: no move path touched | PASS | No move, template, form or submission path changed. `plan` still names the same zones with the same ids; only where they sit changed. The 108 tests, including the agency ones, pass | |
| SEC-07 | What a narrower pill shows | PASS | A pill is now capped at the room before its neighbour, so a long name truncates. Nothing is withheld: the full name stays in the node's `describedAs` and its `title`, which is what a reader and a screen reader get, and the location's own sheet is a tap away. Truncation is visual, not informational | |
| SEC-07 | Information | PASS | No new field is read from any view and none is published. The board draws the same places, the same badges and the same reasons it drew before | |
| SEC-10 | Validation | PASS | `fill` is optional and a board without it keeps the old `aspect` behaviour, so the other games are untouched by construction. `span: 'row'` is a new value on an existing optional hint; a zone that does not carry it lays out as before. The pill's width cap returns null until the board has been measured and for a place alone in its row | |
| SEC-01 | Entry points | PASS | No route, socket event or handler added | |
| SEC-11 | Browser content | PASS | No new text is rendered; labels and names are the same engine strings through React's escaping | |
| SEC-14 | Secrets and published artifacts | PASS | Changed files scanned: none | |
| SEC-18 | Dependencies and supply chain | PASS | No dependency, script or lockfile change | |

## Findings

None outstanding.

Fixed during the change, recorded because the class is worth remembering: a
flex child given `min-height: 0` shrinks below its own contents, and the
contents are then drawn outside it, over whatever follows. That is an agency
risk on a table, not only an ugly screen — a player aiming at one panel can
land on another. `min-height: 0` is a habit worth distrusting anywhere parts
of a table sit next to each other.

## Execution

Commands/tools and versions: `npm run typecheck` across the workspace
(tokens, shared, primitives, engine-client, server, web — all clean);
`npx vitest run --root apps/web` (vitest 2.1.9); two throwaway Playwright
specs, one measuring the board's boxes and one asserting the floor and the
gap between the board and the band at three window sizes.
Tests passed/failed/skipped; real engine versus stub: 108 passed, 0 failed, 0
skipped, including a new one pinning that the city asks to fill rather than
carrying an aspect, that every borough is a single row, and that the three
short panels share one band. The browser runs were against the real engine and
server.
Browser/transport/configuration coverage: Chromium through Playwright at
1440×900, 1440×700 and 1100×620 over HTTP and websockets, SQLite storage.
Measured before and after at 1440×900 with the action bar drawn: the board
overflowed its area by 542px before and now holds the whole city, its legend
and the band's top, with the remainder scrolling.
Dependency and secret scan scope/date: 2026-09-23, the staged diff only.
Checks blocked/not run and exact reason: the clue rail and the jail are on the
board but still below the fold at 1440×900 whenever the caption card runs
long, because that card grows a line for every event the engine narrates and
takes up to 217px. That is a separate defect, already pinned as note 5 on the
Table Now artboard, and it was not taken here. Postgres remains unexercised.
Prior findings rechecked, fixed, reopened, or still unverified: none reopened.
Files changed and temporary-resource cleanup: the nine files in the staged
diff. The throwaway specs, the temporary Playwright config and the screenshots
live in the session scratch directory outside the repository; the config file
used to point Playwright at them was deleted, and `git status` shows only the
intended files plus `docs/design/SCREEN-ROUTING.md`, which belongs to another
session and another project and was left alone. The dev stack was left running.
Next required review: full, at the first development session of the coming
week, and before accepting any milestone.
