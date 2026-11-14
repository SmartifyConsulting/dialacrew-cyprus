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
