# Security review — 2026-10-02

Mode: change (the Cybernoir subway map, build item 2 of
[the theme build](../games/cybernoir-2127-theme-build.md))
Commit and working-tree scope: the working tree on `main` over `c9ab3fe`. In
scope: the station mode of the map primitive
([`packages/primitives/src/components.tsx`](../../packages/primitives/src/components.tsx),
[`types.ts`](../../packages/primitives/src/types.ts),
[`primitives.css`](../../packages/primitives/src/primitives.css)), the
Cybernoir glue's map
([`apps/web/src/glue/cybernoir-2127.ts`](../../apps/web/src/glue/cybernoir-2127.ts),
[`cn/metro.ts`](../../apps/web/src/glue/cn/metro.ts),
[`cn/cn.css`](../../apps/web/src/glue/cn/cn.css)), their tests, one selector in
[`e2e/cybernoir-two-browser.spec.ts`](../../e2e/cybernoir-two-browser.spec.ts),
and the build document. Other uncommitted work (the Neither Guts nor Gears
canvas, the Fractured Fist PDF) is outside this review.
Environment: local machine; the local engine and dev server with guest games
against the AI; a throwaway review server on port 8792 with a database in a
temporary folder outside the repository.
Prior full review: [2026-09-29-0dcaa3e-full.md](2026-09-29-0dcaa3e-full.md),
in this calendar week.
Overall result: no issues found in tested scope; one check blocked.
Release recommendation: not applicable.

## Coverage

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-01 | New entry points | PASS | None. The map draws data the glue already had; no route, socket event or request added | Source-only |
| SEC-02 | Authorization | NOT APPLICABLE | No action or object access changed. Map taps still resolve by location id to the moves the engine lists | |
| SEC-07 | Hidden information on the map | PASS | Each station's state comes from the seat's own view only: crossed off from `your_locations_ruled_out`, which the engine sends only to the Detective, and read only when the role is the Detective; the safehouse frame from the Hacker's own `hideout`; faded from the public `locations_ruled_out`. Unit test feeds both lists to the Hacker's view and asserts nothing is crossed off and no crossed-off key appears; the Detective's view gets no safehouse frame or key. Live: the Hacker seat showed the frame on its chosen hideout and no crossed-off station; the Detective seat showed crossed-off stations and no frame | The two-browser check (R1/R7) is blocked, see below |
| SEC-09 | Player agency | PASS | No step auto-resolved. Choosing the hideout is still a tap on a lit station, then "Hide here"; checked live | |
| SEC-11 | Browser content | PASS | The map renders labels as React text and lines as an SVG of numbers from a fixed table; no HTML strings, no URLs, no `url()` in the new CSS. The lines are `aria-hidden` and take no pointer events; render test checks no button inside them | |
| SEC-14 | Secrets | PASS | None touched | Source-only |
| SEC-18 | Dependencies and build | PASS | No package or lockfile change; `pnpm build` succeeds | |
| SEC-20 | Accidental actions | PASS | Only the ring is a button; render test checks one button per lit station and four when the board is inspectable, and that a tap reports the station's id | |
| R1 / R7 | Two browsers, each with only its own private view | BLOCKED | `e2e/cybernoir-two-browser.spec.ts` (selector updated for the subway map) fails before the map, at game start: the engine reports `awaiting_private_input` for the hideout step and the engine client on `main` does not accept that status yet. Same failure without this change | Unblocks when the engine client change that accepts `awaiting_private_input` reaches `main`; rerun the spec then |

Domains not listed are outside this change's scope.

## Findings

None.

## Observations (not new findings)

- The review server listens on every interface (`0.0.0.0` in
  `apps/server/src/index.ts`), including this machine's public address, as
  [2026-09-30-676a116-change.md](2026-09-30-676a116-change.md) records. This
  run started it with `E2E_TEST_OUTBOX=1` for the two-browser spec, so the
  outbox route was reachable from the network for about a minute; only
  synthetic addresses were used and the server was stopped straight after.
  A development-only host setting would remove the exposure; still a separate
  change.

## Execution

Commands/tools and versions: vitest and tsc in `apps/web` (600 passed, two
new render tests and one new glue test), the primitives build, `pnpm build`,
Playwright with headless Chromium for live screenshots and a label-collision
check at map heights from 240 to 380 px.
Tests passed/failed/skipped; real engine versus stub: 600 unit tests passed;
the live games used the local engine. The two-browser spec failed at start
for the reason above.
Browser/transport/configuration coverage: the table at 1440 × 900 in both
seats; hideout chosen through the real flow.
Dependency and secret scan scope/date: no dependency change.
Checks blocked/not run and exact reason: R1/R7, above.
Prior findings rechecked, fixed, reopened, or still unverified: none apply.
Files changed and temporary-resource cleanup: this report and the files in
scope. The review server was stopped; its database and logs are outside the
repository.
Next required review: change mode for build items 3 to 7; full review in the
first session of the week of 2026-10-05.
