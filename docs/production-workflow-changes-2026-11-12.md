# Production workflow changes — 12 November 2026

## Changes

- Production creation and duplication write only after explicit submission; overview summary has an explicit Save button.
- Productions opens on Upcoming, with separate status tabs and denser desktop rows.
- Calendar recce events use location dates, with the production date as a fallback. A stale production summary no longer adds another recce event. Chips read “Recce”; dashboard shoot chips include the production name.
- JOB-000018 was deleted at the user's explicit request. JOB-000017 remains Upcoming with 12 bookings and 21 storyboard shots. These were two separate Summer race records created about 1.5 seconds apart, not a single event rendered twice.
- Sidebar default order: Overview, Recce Date, Gear Check Date, Locations, Inventory. The layout storage version changes so the requested default takes effect; users can subsequently reorder it.
- Open-gig negotiation is removed from the sidebar and presented when crew choose to accept a gig. Producers respond from Find Gigs. Job terms remain a separate required step.
- Equipment feature labels are renamed Inventory; persisted identifiers and category values remain compatible.
- Crew directory and sandbox country controls include all configured countries.
- Location writes confirm the persisted row, scope edits to the production, refresh calendar data and retain the form on failure. Production-specific components remount when the production changes. Location times round-trip in the production timezone.
- Google Places replaces Nominatim. The server reads `GOOGLE_MAPS_API_KEY`; missing configuration and provider errors are explicit. Manual addresses have no verified coordinates. Editing an address clears stale coordinates.
- Recce crew and individual recce rates persist in `production_recce_plans`. Saved costs contribute to the planner's budget as planned expenses, without creating or charging shoot bookings.
- Storyboard generation saves shots, original prompt and improved prompt transactionally. Replacement does not delete existing shots before generation succeeds. Saved-load errors are visible. Illustration and animation use full shot records so switching modes cannot replace the shared cache with incomplete data.
- Storyboard progress is visible. Provider-internal progress is explicitly estimated, capped below completion; batch request counts are shown separately.
- Original prompt, working prompt, PDF summary and extracted text have compact tabs. Working drafts are saved locally immediately and queued for server persistence. PDF uploads remain in Documents even if extraction fails; the server extracts text and a summary through the Responses API.
- Sound Design and animatic audio are removed from the active storyboard UI. Silent animation preview and MP4 export remain, with checked persistent export writes. Historical audio data is not deleted.
- AI balances use USD micro-units. Minimum top-up is the USD equivalent of R200, with local-currency equivalents and checkout. Amount, currency and payment reference are verified server-side. Atomic ledger functions prevent repeated credits, charges and refunds; browser clients cannot change balances. Failed generation attempts request a refund.
- Document folders are persistent and nested. Managers can rename files/folders, select all or individual items, move files/folders and bulk delete. Folder cycles and conflicting names are rejected atomically. File object paths stay stable; downloads use the displayed filename. Uploads create persistent folder metadata.

## Database installation and checks

Migrations 0066–0069 were applied separately to the confirmed MOI – Book a Crew project database (`d42b3a01-4a4e-4c1d-b4f3-31f55ff96cf6`). Installation and service-only payment/storyboard function permissions were then queried and verified.

Before installation, rollback-only SQL checks passed for file rename/path preservation, nested folder rename/move/delete, cycle rejection, payment credit idempotency, generation debit/refund idempotency, insufficient funds, client write restrictions and failed storyboard replacement preserving previous shots. Test records and balance changes were rolled back.

## Verification limits and configuration

- Automated tests, TypeScript and the production build are run for this change. These do not establish that every live workflow has passed end to end.
- The user confirmed adding Google Maps and Paystack credentials in Lovable Secrets. Values were not inspected. Google Places activation/key restrictions and a real provider response still require live verification.
- Paystack checkout only works for currencies enabled on the merchant account. No Stripe or alternative international gateway was confirmed. Unsupported local currencies fail explicitly; the app does not silently charge a different currency.
- Initial configurable USD action prices: breakdown 0.02, reference enhancement 0.02, image/regeneration 0.04, PDF extraction 0.10. These are app charges, not a claim of exact provider cost. Administrators can change `storyboard_ai_prices_usd`.
- Live payment capture, webhook delivery and paid AI/PDF generation were not executed during automated tests. No real charges or AI-generation purchases were made.
- Existing prompts that were never saved cannot be reconstructed or certified as original. New generation preserves the original prompt.
- New document-library labels include Greek drafts. This change does not certify complete Greek or 30-language coverage.

Reference documentation: [Google Places Text Search](https://developers.google.com/maps/documentation/places/web-service/text-search), [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [Paystack transactions](https://paystack.com/docs/api/transaction/).
