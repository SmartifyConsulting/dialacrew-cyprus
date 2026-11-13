# Authorized continuation — 13 November 2026

Georgia authorized completion of the entire request audit using Go, solo, without Lovable AI credits. She is retiring for the night. Existing authorization covers the listed work; do not ask repeated go-ahead questions. Do not promise an overnight deadline or claim work continues after the active session stops. Keep completed/source-pushed/database-applied/preview/published statuses distinct.

## Current batch completed

- 0072 assignment stamps applied to Book a Crew after explicit approval. Rollback tests verified task/checklist assignment, reassignments, clearing assignment and tamper protection. Existing rows were not assigned invented historical stamps. The UI small attribution line was already pushed in 888dccc.
- Required blue outlines removed from gig and inventory request forms; custom validation names missing fields. Shared native invalid-field handling now shows the field names in the message box. Existing forms that implement their own validation still need review.
- Account screenshot layout combined into one frame, avatar top left, extra page language picker removed. Shared AccountSettings embedded mode preserves all original actions. The main app-wide language picker remains.
- AI balance/top-up and personal paginated credit ledger added to own Account settings, including crew profiles. Total paid contributions is separate from current balance. Top-up prices and verified credit behavior are unchanged; profile return URLs preserve references through crew redirect. Ledger privacy was verified with two accounts in a rolled-back database test. No real charge was made.
- Audit dates now all collapse by default; default filters already include every activity type. This is not a complete immutable audit journal yet.
- Travel frame added above Locations using the existing travel_required field; passport requirements/status still pending. Sidebar storage key v3 resets to the requested order.
- Profile avatar/name saves now invalidate shared navigation avatar/name data.
- Checks: 156 tests passed; TypeScript passed; production build passed.

## Remaining execution list

1. Passport requirements and valid/missing/expired status badges, keeping crew selectable; crew card/list toggle; featured black/gold star; paid re-featuring and admin pricing.
2. Producer-admin posting rules: global default or per-production choice.
3. Read-only immutable production audit events with actor, full time, before/after values, and integration into date groups.
4. MVP trial stage and conversion preserving data; real database/RPC/storage isolation from other company/country data. Existing users should remain committed; do not claim trials are safe until rollback cross-account tests pass.
5. Shared searchable mobile selectors and easier date pickers across all forms; complete custom missing-field messages.
6. Greek benchmark and 30-language coverage audit/implementation. Never certify translations that were not reviewed or screens not verified.
7. Live verification of Maps, persistence, inventory notifications and producer/crew/client workflows. No real payment capture or paid AI generation without appropriate user authorization. Preview sync is separate from publishing.
8. Publish authorized verified changes through non-AI deployment, then verify the public build separately. No Lovable builder prompts.

## Existing source of truth

See request-audit-2026-11-13.md for earlier omissions and verification limits. Main remote is SmartifyConsulting/dialacrew-cyprus. Preserve the untracked searchable-select.tsx prototype until reviewed; never stage unrelated unfinished code blindly. Database project d42b3a01-4a4e-4c1d-b4f3-31f55ff96cf6 is confirmed Book a Crew.

## Further completed batches

- 6259001: passport requirements, status badges, crew card/list toggle and featured star; migration 0073 applied.
- b44165f: producer post defaults/per-production selection and immutable production audit journal; 0074/0075 applied. Journal records changes from installation onward; historical changes cannot be reconstructed.
- 736ada6: paid crew re-feature from AI balance with admin pricing; 0076 applied. Price defaults to disabled until configured. Rollback tests verified debit/idempotency; no real charge performed.
- Follow-up: corrected legacy guidelines guard to allow owning producers; 0078 applied after rollback tests for owner permission and unauthorized denial. Added caller-session production visibility before privileged storyboard actions, including admin requests. TypeScript and 156 existing tests plus four access regression tests passed.
- 0077 trial isolation remains a LOCAL DRAFT, NOT APPLIED. Existing isolation rollback matrix passed; further signup/imported crew and server entrypoint checks remain before activation. Do not describe MVP isolation as live.
- Remaining: trial UI and final isolation matrix, shared searchable inputs/date pickers, full Greek/30-language coverage, provider/live end-to-end testing and public publishing verification.

## MVP rollout

0077 is now APPLIED after rollback tests for cross-account table/RPC/storage reads, foreign mutations, imported-email crew signup, self conversion and retained data. Existing seven accounts remain committed; future accounts default MVP. Added MVP banner, profile confirmation/commit preserving data, admin list flags; roles and billing remain separate. TypeScript, production build and all 160 tests passed. Caller-session visibility now precedes service reads on gig-payment completion/penalties as well as storyboard generation. Live signup/payment E2E remains unverified; no real fees or paid AI used.
