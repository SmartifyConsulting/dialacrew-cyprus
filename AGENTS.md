<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture rules

- Roles live in `user_roles` (enum `app_role`) checked via `has_role()`; never on `profiles` — prevents privilege escalation.
- Signed-in menus come from one `navByRole` map in AppShell, shown as the desktop top bar and the phone bottom bar — one menu definition per role.
- Production crew scenarios are sandbox rows in `brief_matches` keyed `scenario:<productionId>`; committing pencils that group and deletes the others — no extra table needed.
- Signup role comes from a DB trigger: first account is producer, others may self-pick only crew or client — users can never grant themselves producer.
- Signed-in pages live under `src/routes/_authenticated/`; non-producer gating is in `Page` (AppShell) and enforced by RLS — the UI gate is cosmetic, RLS is the real guard.
- Production site data (posts, tasks, documents, register, assets) is gated by `is_site_member()` (producer or booked crew via `crew_members.user_id`) — RLS is the guard, not the UI.
- Crew accounts link to their crew record via `claim_crew_profile()` (email match, else new row); a trigger stops non-producers editing rates/rating — rates stay private.
- Crew-to-site member lists come from the `site_members()` RPC so co-workers never see each other's rates.
- Provider job totals use `providerTotal()` in src/lib/costing.ts (day rate × days + selected asset fees) — one formula for Assets and Commercials.
- Files live in the private `site-files` bucket under `<productionId>/…` or `crew/<crewId>/…`, opened via signed URLs.
- `/` and `/auth` both render the shared AuthForm (home is sign-in/sign-up only); TopNav shows no public marketing menu, only role-based links from `navByRole` — one sign-in path, one menu definition.
- Remaining public pages (/book, /join, /casting, /locations, /rates, /terms) share SitePage + TopNav; cloned copy lives verbatim in route data or src/content/ — keeps the source wording auditable in one place.
- Client MemoryBank (company_memory) is rebuilt by AI from production_retrospectives + crew_reviews + bookings in src/lib/memory.functions.ts; AI calls go through src/lib/ai.server.ts — one learning path for retros, matcher and relearn.
- Production site page = fixed Overview widget on the left + tabbed feed on the right; tab lists per role live in productions.$id.tsx (CREW_TABS / MANAGER_TABS) — one place decides who sees what.
- Any site member can rate co-workers (crew_reviews RLS via is_site_member, never self) — ratings are peer-driven, not producer-only.
