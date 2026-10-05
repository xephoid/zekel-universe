# Security review — 2026-10-04

Mode: change (the Cybernoir phone, build item 8 of
[the theme build](../games/cybernoir-2127-theme-build.md)), plus the
documentation checks for the four new phone boards.
Commit and working-tree scope: the working tree on `main` over `6caee5a`. In
scope: the four `Phone-*.dc.html` boards, `canvas.json` and the README in
`docs/design/cybernoir-rain-neon/`; the build document; `GlueInput.phone` and
the up-close card sheet
([`pages/Table.tsx`](../../apps/web/src/pages/Table.tsx),
[`table/parts.tsx`](../../apps/web/src/table/parts.tsx),
[`glue/types.ts`](../../apps/web/src/glue/types.ts)); the map primitive's list
view ([`components.tsx`](../../packages/primitives/src/components.tsx),
[`types.ts`](../../packages/primitives/src/types.ts),
[`primitives.css`](../../packages/primitives/src/primitives.css)); the
Cybernoir glue's phone column and the phone styles
([`cybernoir-2127.ts`](../../apps/web/src/glue/cybernoir-2127.ts),
[`cn/cn.css`](../../apps/web/src/glue/cn/cn.css)); tests. Other uncommitted
work (the Neither Guts nor Gears canvas, the Fractured Fist PDF) is outside
this review.
Environment: local machine; the local engine and dev server, guest games
against the AI in both seats at 390 × 844 and at 1440 × 900.
Prior full review: [2026-09-29-0dcaa3e-full.md](2026-09-29-0dcaa3e-full.md),
in this calendar week (Monday 28 September to Sunday 4 October).
Overall result: no issues found in tested scope.
Release recommendation: not applicable.

## Coverage

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-14 | The phone boards | PASS | Searched the four boards for email addresses, local paths and outside URLs: Google Fonts only. Each board's scripts are the canvas runtime (`./support.js`, not in the folder) and a `text/x-dc` data block, as on every board. Every image they name exists | Source-only |
| — | Agent instructions | PASS | The README and build document record decisions; nothing in them is addressed to an assistant or weakens a house rule | |
| SEC-01 | New entry points | PASS | None. `phone` is a client-side layout flag computed from the window size | Source-only |
| SEC-07 | Hidden information on the phone | PASS | The phone column holds the same zones as the desktop for each seat, only placed differently; the station words come from the same per-seat fields as the desktop marks ("Seen in hand" only from the Detective's own list, "Your hideout" only from the Hacker's own view). Unit tests: the Detective's phone map has crossed-off words and no hideout; the Hacker's has the hideout and nothing crossed off. Live: both seats checked at 390 × 844 | The two-browser spec (R1/R7) stays blocked, see [2026-10-02-c9ab3fe-change.md](2026-10-02-c9ab3fe-change.md) |
| SEC-09 | Player agency | PASS | On a phone a tap on a card opens it up close and sends nothing; its buttons are the moves the engine lists for that card, and a move is sent only when one is pressed. Choosing the hideout from a station row still goes through "Hide here". Live: playing a Location from the up-close sheet and choosing a hideout both worked | |
| SEC-11 | Browser content | PASS | The sheet and the list are React text from the engine's names; no HTML strings or new URLs | |
| SEC-20 | Accidental actions | PASS | A card's move needs two taps on a phone (open, then press); station rows are buttons only when lit or looked at, as the rings were; every verb button is at least 48 px tall. Off a phone, and for games that draw their own screen, taps behave as before (all 620 web tests pass) | |
| SEC-18 | Dependencies and build | PASS | No package change | |

Domains not listed are outside this change's scope.

## Findings

None.

## Execution

Commands/tools and versions: vitest and tsc in `apps/web` (620 passed; five new
phone tests); the primitives build; Playwright with headless Chromium at 390 ×
844 (both seats, the column scrolled top to bottom, a hand card opened up
close) and 1440 × 900 (the desktop table unchanged); the four boards rendered
at their own size with the overlap check.
Checks blocked/not run and exact reason: R1/R7, as above.
Files changed and temporary-resource cleanup: this report and the files in
scope; screenshots are outside the repository. The local engine and server
were started for the live checks and are left running.
Next required review: full review in the first development session of the
week of 2026-10-05.
