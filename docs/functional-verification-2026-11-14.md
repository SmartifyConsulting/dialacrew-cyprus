# Functional verification — 14 November 2026

Language work is paused in Git stash `Paused translation drafts while completing functional verification`. It is not in main or Lovable.

## Confirmed in authenticated crew preview

- Own profile Account tab loads AI balance, contribution total, top-up control and own token ledger. No purchase made.
- Inventory shows 88 items and Request equipment in list rows. Empty request is rejected with `Production is required`; no request was created.
- Post a Gig exposes department and inventory dropdowns, phone calling code, date controls, address lookup and description polish. No gig posted or paid AI operation performed.
- Live venue lookup fails. Added safe expected-error reporting to distinguish missing configuration, disabled Places API, key restrictions, billing and quota. This is diagnostic work, not proof that Google configuration is fixed.

## Functional fixes in this batch

- Crew and gig country choices now include all 249 ISO country/territory codes, plus admin custom entries/labels. This does not enable new payment currencies.
- Google Places provider errors are returned as safe expected errors so the UI can show the cause without exposing provider raw messages or secrets. Manual entry remains explicitly unverified.
- TypeScript and production build passed; all 172 tests passed.

## Database facts verified

- Job 18 matching JOB-000018 / job18 is absent.
- 13 production location records persist.
- Summer race retains 21 storyboard shot records.
- New account default is MVP; 90 public table trial policies exist. Previous rollback access tests apply; this is not a fresh live signup certification.

## Still to close

- Verify actual Google configuration after new diagnostic reaches preview.
- Producer-side live checks: creation/update without autosave; location save/reopen, recce/calendar duplicate behavior, assignment/audit UI, document rename/move/bulk operations, inventory approve/collect, travel/passport presentation and post-rule controls.
- Real notification delivery, Paystack payment/callback behavior and paid storyboard/PDF operations remain unverified. No real payment or external notification sent in this audit.
- Verify latest synchronization and public deployment independently. Preview source was confirmed synced through b70ddd2 before this batch.

## SerpAPI change requested by Georgia

The shared authenticated address lookup now uses SerpAPI's Google Maps engine. Server secret names supported: SERPAPI_API_KEY or SERP_API_KEY. Direct Google Places is no longer called by geocodeSearch. Addresses and coordinate fields preserve the existing save contract; invalid/missing coordinates are excluded, and suggestions display full addresses. Successful repeated queries are cached for five minutes (maximum 100 entries per server instance). No key or raw provider errors are returned to the browser. Reference: https://serpapi.com/google-maps-api .

All 181 tests, TypeScript and production build passed. Live SerpAPI verification is pending synchronization after this commit.

Additional rollback tests passed: nested document folder rename/move, bulk file moves and deletes, cycle rejection, location updates and authenticated audit-edit rejection. No fixture changes persisted. The producer/admin preview session is active. Open/cancel of the new-production dialog was checked without saving. Public deployment 93d88961-44c1-4924-a671-9fa6d17dbadd reported completion in Lovable's publish panel before the SerpAPI change; that does not include this subsequent integration yet.

## Live producer verification completed

- Tasks and expanded checklist items show the same four active assignee choices. No assignments changed.
- Files loads six persistent root folders; select-all selects all six, and the move chooser opens. Cancelled without moving or deleting real files. Database rollback tests cover actual nested and bulk operations.
- Audit defaults to All activities, with both visible historical date groups collapsed. No audit edit actions are exposed.
- Travel appears immediately above Locations. Existing saved location displays in ROADCOVER after navigation. Travel requirements were not changed on the real production.
- Summer race loads all 21 saved storyboard images after navigation. Prompt tabs and silent Animatic mode are present. No paid generation, PDF extraction or MP4 export was triggered.
- November production data has no overlapping same-client production-day entries. The Xanadu labels seen on 28–30 November are one event on each day of the three-day Summer race production.

## SerpAPI live status

The synchronized integration reaches SerpAPI, but the provider rejects the configured key/account access. Georgia confirmed serpapi.com. This remains an external configuration blocker, not a successful Maps certification. The final follow-up trims pasted-secret whitespace and differentiates invalid keys, account verification and quota failures. No secrets were read or displayed. Ten focused SerpAPI tests and TypeScript passed after this follow-up; the full suite before it passed 181 tests.

## Final status of this verification pass

- Lovable source synchronization verified through 4fc2a2c; publish operation 62244817-1c30-4871-9c22-b713a0203a65 showed `Your website was updated` in the publish panel.
- Google sign-in on the standalone preview fails with Supabase `Unsupported provider: missing OAuth secret`. This is an additional unresolved authentication configuration issue; email/password sessions were used for the successful crew/admin preview checks.
- The normalized-secret Maps retest stalled after a preview renderer crash/recovery. The last completed provider response denied the configured key/account access. Do not claim normalization fixed it. Georgia confirmed serpapi.com; active-key re-save confirmation is pending.
- Added a 25-second browser request deadline and cancellation when a query changes or closes, so Maps cannot stay on Searching indefinitely. TypeScript passed for this follow-up.
- Still unverified: real payment capture/callbacks, paid storyboard/PDF operations, MP4 rendering and actual device notification delivery. No fees were charged and no real loan/assignment/document mutations were performed by this browser audit.
- Translation drafts remain paused in Git stash. All functional source edits are committed separately.

## Follow-up after credential configuration

Google OAuth now completes end to end on the standalone preview: Google accepted the corrected Supabase callback and returned the existing Georgia Adams admin account to the dashboard. The earlier missing-secret and redirect-mismatch issues are resolved for that tested preview flow.

Secret metadata inspection (names only) found the project uses SERPAPI_AI_KEY. The runtime helper previously read SERPAPI_API_KEY / SERP_API_KEY. Added support for the existing project name with priority over stale aliases, retaining both standard names. No secret values were read, copied or displayed. Eleven focused Maps tests passed, including a regression for the actual project secret name and precedence. Live retest follows synchronization.
