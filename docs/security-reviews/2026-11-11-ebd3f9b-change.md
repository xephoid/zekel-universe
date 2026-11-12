# Security review — 2026-11-11 (the site pages on a phone)

Mode: change.
Commit and working-tree scope: the `phone-pages` branch on top of `ebd3f9b`:
phone-width rules at the end of `apps/web/src/app.css`, the shell bar's name
wrapped in its own element (`Nav.tsx`), the designer page's games list
dropping an inline grid (`Designer.tsx`), a new browser spec
(`e2e/pages-phone.spec.ts`), one locator in `e2e/storefront.spec.ts`, and
`docs/implementation-plan.md` §22.
Environment: synthetic and local only. A local dev server with the test mail
outbox, the games engine on a local port, local SQLite, headless Chromium.
Prior full review: [2026-11-09](2026-11-09-7f6025b-full.md).
Overall result: no finding. Layout only; no route, data, or behavior change.
Release recommendation: unchanged from the last full review.

## Coverage

| Check ID | Surface/subcheck | Outcome | Evidence/test | Limitation or activation trigger |
| --- | --- | --- | --- | --- |
| SEC-01 | Inventory, fail closed | PASS | No new route, endpoint, socket event or configuration. Changed files listed above | |
| SEC-02 | Authorization | PASS | No server change; the Admin link's condition in `Nav.tsx` is untouched | |
| SEC-07 | Hidden information | PASS | No new data reaches the page. The display name the bar already showed is now visually hidden on a phone and still in the page, as before | |
| SEC-10, 12 | Validation, files, outgoing requests | NOT CHANGED | No input handling, file or request code touched | |
| SEC-11 | Browser content, XSS | PASS | Text still renders through React; no `dangerouslySetInnerHTML`, no new inline script or style source; CSS only | |
| SEC-14 | Secrets | PASS | Sweep of added lines for keys, tokens, addresses and local paths: only `example.com` test addresses | No scanner installed |
| SEC-15 | Privacy, caching | PASS | Nothing new is sent, stored or cached | |
| SEC-18 | Dependencies | PASS | No package or lockfile change. Playwright's Chromium was downloaded locally to run the specs; nothing in the repo changed for it | CI is still off |
| SEC-20 | Accidental privileged actions | PASS | Sign out and the delete actions keep their places and confirmations; buttons only grew taller | |
| SEC-03–06, 08, 09, 13, 16, 17, 19, 21, 22 | | NOT CHANGED | No change to identity, sessions, origins, sockets, moves, persistence, abuse limits, logs, deployment, uploads or AI | |

Tests: `pnpm typecheck` passes; web unit tests 715 of 715;
`e2e/pages-phone.spec.ts` passes and fails on the code before this change
(home measured 712 px wide). `e2e/storefront.spec.ts` passes up to its count
of designer updates, which expects 4 and finds 6 in the local database; that
count fails the same way without this change.
