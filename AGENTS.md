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
- Signup role comes from a DB trigger: first account is producer, others may self-pick only crew or client — users can never grant themselves producer.
- Signed-in pages live under `src/routes/_authenticated/`; non-producer gating is in `Page` (AppShell) and enforced by RLS — the UI gate is cosmetic, RLS is the real guard.
