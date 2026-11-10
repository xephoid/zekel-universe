# Security review — 2026-11-09 (change, Word Debauchee)

Mode: change, game glue and React (the Word Debauchee table).
Commit and working-tree scope: one branch over `7f6025b`: the new glue
`apps/web/src/glue/wd/`, its registration, an optional `setupInPlay` hook on the
glue interface and its use on the setup page, the game's storefront entry and
cover (`apps/server/src/storefront.ts`, `apps/web/public/art/covers/word-debauchee.svg`),
captured engine views as test fixtures, a unit test, a browser spec, the plan's §20,
and the publishing rule's list of games in `CLAUDE.md` and `AGENTS.md`.
Environment: local machine. The engine (with Word Debauchee) ran on a spare local
port with an in-memory store; the Universe server ran with a scratch SQLite file and
no test outbox; the web dev server listened on `127.0.0.1` only.
Prior full review: [2026-11-09-7f6025b-full.md](2026-11-09-7f6025b-full.md), run the
same day on the same base. Its findings stand; nothing here touches them.
Overall result: no issues found in tested scope.
Release recommendation: unchanged from the full review.

## Coverage

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-01 | Entry points | PASS | No new route, socket event or server input. The storefront entry is static copy read at catalog refresh | |
| SEC-02 | Authorization | NOT RUN | No server code path changed | |
| SEC-07 | Hidden information | PASS | Browser spec: every socket frame and table response a guesser's browser received across a full 8-round game against three AI seats was searched for each round's secret word; none arrived before that round's result. Unit test: no guesser fixture renders the secret panel. The engine's own leak test (`viewLeak.test.ts` in the package) covers its views | Not covered here: undo, reload, the REST history feed and the watch page for this game (R7 steps 2 and 4) |
| SEC-09 | Agency | PASS | Every send goes through the table's `onMove` (a listed move) or `onForm` (a listed move completed only with keys the engine's move names: `index`, `to_row`, `to_index`, `check`, `text`, `cards`); the unit test checks each form send against `isSubmissionAllowed`, that nothing sends on render, that a held tile sends nothing until Place or Move, and that a watcher can press nothing that sends. The debauchee picks every letter; nothing is auto-resolved | The sand timer is not offered, because it would need a move nobody pressed |
| SEC-10 | Validation | PASS | Free text (a clue answer) goes to the engine as the move's own field, capped at 60 characters in the input; the engine validates it and refusals show as the table's notice | |
| SEC-11 | Browser content | PASS | All text is rendered by React as text; no `dangerouslySetInnerHTML`, no URLs built from view data. The cover is a static SVG with no script or outside reference | |
| SEC-14 | Secrets and published files | PASS | The fixtures hold only engine views of seeded games with made-up seat names; a search of the change found no keys, addresses or local paths | |
| SEC-18 | Dependencies and build | PASS | No new dependency; the lockfile is unchanged | CI cannot run while the account is locked (see the full review) |
| SEC-20 | UI and accidental actions | PASS | One press is one move; "Place and Check!" is one press by design, so another player cannot move between the tile and the check. Keyboard shortcuts act only on this seat's turn and never while typing in a field | |
| SEC-05, 08, 12, 13, 15–17, 19, 21, 22 | | NOT RUN | No server, socket, persistence, identity or deployment change | |
