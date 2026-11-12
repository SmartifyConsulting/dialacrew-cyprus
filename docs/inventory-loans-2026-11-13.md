# Inventory loan requests

Inventory library rows now expose Request equipment. Crew request for themselves; managers select a crew record. A production, linked crew account, positive quantity, collection date and expected return date are required.

New requests progress through requested → approved → collected → returned, with requested → declined also supported. Producer/admin permission is enforced by RLS and a database transition trigger. Approved loans reserve stock; only collected loans count as out or overdue. Item row locks serialize stock reservations. Legacy records retain collected/returned status without inventing historical approval actors or timestamps.

Approval and collection each insert one notification for the linked crew account in the same transaction. Existing notification delivery handles these records. Real device push delivery was not tested. Producers review requests in the library card. The production sidebar links to the library rather than bypassing the workflow with an immediate booking.

Migration 0071_inventory_loan_approval.sql was applied to Book a Crew on 13 November 2026. Rollback-only database checks passed for producer transitions, crew read access and approval denial, collection-before-approval denial, stock reservation versus physical collection, overbooking rejection, actor/timestamp stamps and exactly two notifications. Test fixtures and notifications were rolled back. Existing checkout records were preserved.

TypeScript and production build passed. The existing 144 tests passed; four additional loan-state tests also passed. GitHub push and Lovable live synchronization must be verified separately.
