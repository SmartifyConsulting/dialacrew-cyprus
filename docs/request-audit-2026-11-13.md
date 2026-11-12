# Request and regression audit — 13 November 2026

## Confirmed gaps corrected in this batch

- Post a Gig retained the old form: added department dropdown, inventory dropdown, phone calling-code selector with normalized international storage, Google venue autocomplete, description polish action, native required fields with blue outlines and the configured country list. Explicit author/status/ownership values match the existing posting policy. Submission is protected against repeat clicks and invalid amounts/date order. Country code choices cover the 14 built-in countries; this does not claim complete international phone validation.
- Added department filtering to community gigs and production open gigs. Production open gigs derive department from existing role-to-department records; roles with no catalog match cannot be assigned a department automatically.
- The inventory request form had blank production labels and indistinguishable crew names. It now identifies unnamed productions by ID and crew by role plus ID suffix. Existing source records were not deleted or renamed.
- Storyboard showed “No shots yet” while saved data was loading. It now shows Loading saved storyboard and does not display an empty-state message on a load error.
- Included migration 0070 in Git: the crew/producer/admin gig INSERT policy was already installed and verified in the connected database; it was previously left untracked locally.

## Preview observations

Read-only navigation in the authenticated Lovable preview confirmed: the production site opens; inventory lists 88 items and Request equipment opens the expected form; document folders load; Summer race loads 21 saved storyboard shots and images; the new prompt tabs and AI balance are visible. The Post a Gig form was visibly missing the requested fields before this batch.

The editor displays unpublished changes. Preview observations do not certify the published public site. No payment, AI generation, document mutation or inventory handover was performed during these browser checks.

## Existing implementations with verification limits

- Calendar client-only shoot chips, dashboard Upcoming default, compact single-line rows and scrolling header controls are in GitHub. The original blue notification styling is restored in f6c3584.
- Inventory approval/collection migration 0071 is applied. Rollback database tests verified permissions, state transitions, stock and two notification records. Real device push delivery is unverified.
- Production creation explicit-save, location persistence, recce calendar handling/cost planning, document operations and storyboard persistence are implemented. Their earlier automated/database checks do not establish every live workflow.
- Real Google Maps responses, Paystack capture/webhooks, paid storyboard generation/PDF extraction and all role-specific workflows remain unverified end to end.

## Requested work still unfinished

- App-wide required-field outlines; searchable mobile selectors; improved date pickers throughout.
- Producer-admin post-rule defaults with global/per-production choice.
- Detailed immutable audit journal with before/after values and actor timestamps.
- Travel panel above Locations, passport requirements and valid/missing passport badges in crew selection/cards.
- Crew card/list toggle, black-and-gold featured star, paid re-featuring and admin pricing.
- MVP trial flag, commit-without-data-loss and enforced trial data isolation across companies/countries. Do not treat the app as ready for that trial model.
- Complete Greek benchmark and 30-language UI/content coverage. Missing translations remain unverified.

## Checks

Baseline: 148 automated tests passed; TypeScript and production build passed. This batch: three phone normalization tests passed and the gig-form build/type checks passed. Focused inventory checks also passed. No claims of comprehensive live workflow success are made.
