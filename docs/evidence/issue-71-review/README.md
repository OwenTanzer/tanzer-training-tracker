# PR 72 navigation and edit review

Base head: `c6c10846a44557222170188f0418853b3810eab4`. Synthetic records only.

## Reproduced before repair

- Category → details → Close → browser Back reopened `?distraction=traffic`.
- Editing the detail report mounted two edit forms for the same report, one in the dialog and one in Log History. Browser Back left the underlying form active with its original values.

## Repair behavior

- Category and detail entries carry page-local history origin data. Back to matching logs returns to the original category entry; direct detail links replace the current entry as a fallback. Close replaces the current entry and skips only the dismissed category entry during later Back/Forward navigation. Earlier history remains reachable.
- One parent-owned report draft is keyed by dog and report. The active editor belongs to either the dialog or Log History. Browser URL exit and dog changes deactivate the editor while retaining typed values in memory. A tab-local cache keeps drafts through in-app route changes, scoped to the signed-in instructor; a dirty draft prompts before a hard reload or tab close. Edit resumes a retained draft; Cancel and successful Save remove it. No draft is persisted or sent to the API until Save. Retaining a draft within the tab is a product behavior for Owen to review.

## Verification

The browser test starts a Vite server with `VITE_API_BASE_URL=http://127.0.0.1:4174`, intercepts that loopback API with the synthetic fixture, and rejects writes and external requests. With Playwright available externally, run `node tests/distractionLogs.browser.cjs`. See [browser-results.json](browser-results.json) for the exercised cases.

Node 22.23.0 on Windows ARM64:

| Gate | Result |
| --- | --- |
| `npm test` | Passed, 64 tests |
| `npm run lint` | Passed, three pre-existing warnings in App.tsx and GuideDogIllustration.tsx |
| `npm run build` with the CI API URL | Passed |
| `npm --prefix worker run typecheck` | Passed |
| Chromium synthetic browser, 390px/320px/1280px | Passed; zero API writes, external requests, or page errors |
| `git diff --check` | Passed |

Plain `npm ci` and `npm --prefix worker ci` cannot complete on this Windows ARM64 host because the locked `workerd` postinstall rejects `win32 arm64 LE`. Both lockfile installs completed with `--ignore-scripts`; the repository files and lockfiles were not changed. CI runs on Linux, where the documented install remains available.

An independent final code review found no blocking issues. It identified a category-only URL exit and a draft update race during review; both were repaired and covered by the browser suite before the final verdict.

Screenshots: [phone summary](phone-summary.png), [phone matching logs](phone-matching-logs.png), [phone details](phone-log-details.png), [retained draft after Forward](phone-unsaved-draft.png), [phone empty state](phone-empty-state.png), [desktop matching logs](desktop-matching-logs.png).
