# Book a Crew language foundation

Based on Holarc Health's i18next / react-i18next architecture. Generic common labels, home/profile/admin labels and the calendar label were copied; medical wording is excluded. Greek and Hindi authentication/recovery drafts have now been added by the coding assistant and have NOT been reviewed by native speakers. This is not a fully translated app.

## Supply translations

- `locales/en.json` is the current app-specific source dictionary. Keep key names unchanged when translating values with your preferred tool.
- All 25 Holarc languages are registered. Marathi (`mr`), Urdu (`ur`), Telugu (`te`), Tamil (`ta`) and Malayalam (`ml`) have empty JSON placeholders. Missing keys fall back to English, not raw key names.
- Replace or extend the corresponding JSON dictionary to import translations. Preserve interpolation variables such as `{{name}}` when adding new strings.
- New screen strings need both an English dictionary entry and `useTranslation().t("section.key")` in that screen. Adding dictionaries alone does not translate hardcoded screen text.
- Language selection is saved on this browser/device under `bookacrew.language`. Signed-in selectors also save `profiles.preferred_language`, and the root loads that preference on account changes. This requires migration `0060_profile_language.sql`, supplied with this increment but NOT applied or verified against the live database. A failed save displays a device-only status. A delayed account read cannot overwrite a newer local selection.
- Arabic, Hebrew and Urdu set document RTL after hydration. No browser globals or detection run during SSR; each root owns its own instance.
- Gig descriptions, crew experience/bios, production feed post bodies and message bodies request authenticated machine translation using the existing server OpenAI connection (`OPENAI_API_KEY`), with a show-original toggle and original-text fallback on failure. Translation runs for all target languages, including English. Results are cached for one hour in the browser query cache and a bounded, per-user server process cache; the server cache does not survive restarts or span workers. Other production notes, transcripts, task/recce descriptions and durable database caching remain outstanding. Live translation has not been verified against deployed credentials.
- Browser language detection runs after hydration, preferring a saved device choice and then the first supported browser language.
- Source comparison: SmartifyConsulting/proflow-ai, `src/i18n/index.ts` and `src/components/layout/LanguageSwitcher.tsx`. The 25-language registry matches. Account preference loading/saving is adapted centrally rather than repeated in every selector. Holarc's language scale map is applied through root font size. New Indian scripts keep full size with system script-capable font fallbacks; fonts are not bundled and glyph coverage depends on the device. Visual RTL/script QA remains outstanding.

## Current coverage audit

Greek correction: all currently extracted English dictionary keys now have distinct Greek values with matching interpolation variables, enforced by a test. This measures dictionary coverage only, not full screen coverage or linguistic accuracy. New Greek copy remains an assistant-authored draft requiring native-speaker review, especially consent and payment terminology.

| Surface | Current coverage |
| --- | --- |
| Shared navigation | All role navigation labels and recognized navigation page headings have Greek drafts; other languages still have gaps |
| Language picker | All 30 registered languages, persistent on this device; available before sign-in and on own profile/company settings |
| Authentication / password recovery | Sign-in, recovery, signup field labels/help and consent controls have Greek drafts. Service/country options, invitation copy, backend/shared errors, linked legal documents and metadata remain pending. Hindi covers sign-in/recovery only |
| Dashboard / gigs / calendar | Producer dashboard greeting, metrics, production filters/empty states, action buttons/activity scaffolding and mini-calendar labels/date locale wired with Greek drafts. Full calendar headings/legend/weekdays/month and primary export controls wired. Weather text, event details, role names, subscription help and crew/client dashboard variants remain pending. Gig posting form, agreements, confirmations and FindGigsTab remain pending |
| Production list / workspace | List subtitle/search/table headers/status labels wired with Greek drafts. Production types, modal controls, workspace tabs/overview/feed guidelines and other workspace controls remain pending |
| Crew directory / profile | Screen bodies unchanged except language picker; need extraction and translations |
| Production workspace / tasks / recce / gear | Needs extraction and translations |
| Earnings / invoices / payments | Needs extraction and translations |
| Admin / company settings / mobile setup | Screen bodies need extraction and translations |
| Public pages / legal text | Need extraction and translations |
| User-generated briefs / posts / bios | Gig descriptions, crew experience/bios, production feed posts and message bodies wired for machine translation; remaining notes/transcripts/tasks pending; runtime translation unverified |

Review full layouts for long translations and RTL when those dictionaries are supplied; fixed left sidebar geometry has not been redesigned.

## All-language acceptance status

The same screen-level requirements apply to every registered language. No language is currently certified complete or visually verified. English is the source. Greek has drafts for every extracted source key, not every visible screen string. Hindi has partial authentication drafts. The other 27 languages have only the earlier partial dictionaries (five are empty). Dates/weekdays on the dashboard and calendar follow the active locale for all registered languages; that is not evidence of translated UI copy. Backend automatic content-translation failures require runtime diagnostics and cannot be diagnosed from the fallback message alone.
