# Workflow verification — 12 November 2026

Baseline: `13578233b0d786219efa15f0c3d9b6887d6af5af` on `SmartifyConsulting/dialacrew-cyprus/main`.
Checks ran in an isolated checkout. Older, unfinished localization edits remain in their original checkout and were not substituted for current main.

## Results

| Check | Result | Scope |
| --- | --- | --- |
| `npm test` | 118 tests passed in 22 files | Unit, component, route matching and mocked auth/translation service checks |
| `npx tsc --noEmit` | Passed | Static types |
| `npm run build` | Passed | Client and server production bundles |
| ESLint on the four added/expanded test files | Passed | Default project lint rules |
| Local HTTP smoke test | 15/15 returned HTTP 200 and HTML | Development server, no signed-in browser actions |
| Repository source lint, with formatting rule disabled for diagnosis | 28 errors, 40 warnings | Existing files outside this patch; full lint is not clean |

HTTP paths checked: `/`, `/auth`, `/forgot-password`, `/reset-password`, `/book`, `/join`, `/casting`, `/locations`, `/rates`, `/terms`, `/privacy`, `/dashboard`, `/productions`, `/crew`, `/invoices/test-invoice`.
Protected routes disable SSR; their HTTP 200 responses verify the shell can be served, not authorization or database access after hydration.

## Corrections and regression coverage

- Invoice details matched a child route under the invoices list, but the parent rendered only the list. The parent now renders its outlet when the detail route matches. A component regression test failed before the fix and passes afterward.
- Added a route matrix for public and authenticated screens, including crew, production and invoice detail URLs. These tests check route resolution and authenticated parent membership, not page loaders or RLS.
- Added mocked-auth tests for missing sessions, expired/invalid sessions and verified users.
- Added component tests for original content while loading, successful translation, original/translation toggling, provider failure without automatic retries, blank/unsigned-in content, cache reuse, and isolation across accounts and target languages. These tests do not call OpenAI.
- Added five missing Greek dictionary labels: Reporting, Checklists, Token Ledger, Files and Post a Gig. Passing dictionary coverage does not establish that every rendered string is extracted or that the Greek wording has native review.

## Remaining live verification

No staging URL or role test accounts were supplied during this run. These workflows remain unverified end to end:

- Producer/client/crew permissions, cross-account RLS, account switching and profile-language persistence against the deployed database.
- Production creation/editing, crew invitations and bookings, task/checklist changes, equipment checkout/return, and calendar subscriptions.
- File/photo/audio uploads, downloads and private-storage permissions.
- Invoice generation/issue and payment state transitions.
- Paystack/escrow sandbox checkout, webhook delivery, refunds and audio-credit charging.
- Deployed automatic content translation and provider error handling.
- Storyboard, animatic and sound-design generation/export, including failure and credit-exhaustion cases.
- Browser interaction, mobile layout, native push and offline behavior.

No database migrations, live financial transactions, invitations or production-data changes were performed. This report is not a sign-off that all workflows work.
