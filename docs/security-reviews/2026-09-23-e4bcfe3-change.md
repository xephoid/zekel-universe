# Security review — 2026-09-23

Mode: change (the engine publishes what a move costs and what an ability
does; Universe prints them beside the decision)
Commit and working-tree scope: the working tree on top of commit e4bcfe3 on
`main`, committed right after this report. Changed surfaces: the wire contract
(`packages/shared`, one optional field on `LegalMove`), the server's realtime
payload type, the glue contract (`MoveForm.summarize`), the Cybernoir glue,
the form sheet and one style, and the tests. The paired engine change is
`524bd5a` next door: `cost` on the core `LegalMove`, a price table and an
ability catalog for Cybernoir.
Environment: local machine. Unit and page tests under jsdom; browser checks
against the local stack — the rebuilt engine on 8787, the restarted server,
and Vite — played as the Hacker.
Prior full review: none; the prior change review is
[2026-09-23-371aa61-change.md](2026-09-23-371aa61-change.md).
Overall result: no issues found in the tested scope.
Release recommendation: not applicable (no deployment yet).

## Coverage

A new optional field crosses the wire, so SEC-07 and SEC-10 carry the weight
here. Selected: SEC-01, SEC-07, SEC-09, SEC-10, SEC-11, SEC-14, SEC-18.

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-07 | What the new field carries | PASS (reasoned and reproduced) | `cost` is a printed price — "4 AP", "3 AP, once per game" — attached to a move the engine had already decided to offer this seat. It is a property of an offer the seat can already see, not a new fact about the game state, and it is computed from the move type and the person's printed cost only. Nothing about the other seat, the deck order or the hideout can reach it | A game that adds a cost derived from hidden state would change this; Cybernoir's table is static plus one printed lookup |
| SEC-07 | Where the field goes | PASS | Legal moves are already per-seat: the server sends each seat only its own (`realtime.ts` builds a payload per player id, unchanged here). Adding a field to those moves does not widen who receives them, and the two-browser privacy spec's assertions are about the view and the other seat's cards, neither touched | The privacy spec was not re-run; no routing or filtering changed |
| SEC-07 | The ability catalog | PASS | Public game data: what a printed card does, for cards both seats can already name. It sits in `reference_data`, which both seats fetch, beside the people and locations it describes | |
| SEC-09 | Agency | PASS | No move, template or submission path changed. Prices are drawn as text on buttons and in confirmations; the upkeep summary reads the engine's own move for the current answers and never adds anything up. The 100 tests including the agency ones pass | |
| SEC-10 | Validation | PASS | Every new field is optional and read defensively: a move with no `cost` shows no price rather than an invented one, and an ability with no published line falls back to its id in words. Asserted in `glue.test.ts` | |
| SEC-01 | Entry points | PASS | No route, socket event or handler added; one optional field on an existing payload | |
| SEC-11 | Browser content | PASS | Prices and ability lines are engine text rendered through React's escaping | |
| SEC-14 | Secrets and published artifacts | PASS | Changed files scanned: none | |
| SEC-18 | Dependencies and supply chain | PASS | No dependency, script or lockfile change | |

## Findings

None.

## Execution

Commands/tools and versions: `npx tsc --noEmit` for the web app, the server
and the engine; `npx vitest run --root apps/web` (vitest 2.1.9); the engine's
Cybernoir suite; a throwaway Playwright run.
Tests passed/failed/skipped; real engine versus stub: 100 passed here, 0
failed, 0 skipped; 263 in the engine's Cybernoir suite, including new ones
pinning that every ability a person carries has a line and that nothing is
published for an ability nobody has. The browser run showed the prices on the
buttons — "Draw a Contact · 1 AP", "Burn the safehouse · 3 AP, once per game"
— and Contacts reading "Take one card back from your own discard pile."
Browser/transport/configuration coverage: Chromium through Playwright at
1440×900 over HTTP and websockets, SQLite storage.
Dependency and secret scan scope/date: 2026-09-23, the staged diff only.
Checks blocked/not run and exact reason: the first live attempt showed no
abilities because the server caches reference data in-process for its
lifetime; restarting it fixed that, and the fact is now recorded for the next
person. Postgres remains unexercised.
Prior findings rechecked, fixed, reopened, or still unverified: none reopened;
SEC-09-F04 and F05 stay fixed.
Files changed and temporary-resource cleanup: the files in the staged diff,
plus the engine commit named above. Throwaway browser specs and screenshots
live in a scratch directory outside the repository. The dev stack was left
running, since the user is playing against it.
Next required review: full, at the first development session of the coming
week, and before accepting any milestone.
