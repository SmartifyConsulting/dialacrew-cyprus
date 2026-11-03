# Book a Crew language foundation

Based on Holarc Health's i18next / react-i18next architecture. Only generic common labels, home/profile/admin labels and the calendar label were copied; medical wording is excluded. No new non-English translations were generated. This is not a fully translated app.

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

| Surface | Current coverage |
| --- | --- |
| Shared navigation | Labels wired; copied translations for home, calendar, profile, admin and sign-out where available; Book a Crew-specific labels await translations |
| Language picker | All 30 registered languages, persistent on this device; available before sign-in and on own profile/company settings |
| Authentication / password recovery | Forgot-password form labels/status extracted to English dictionary; translations, metadata, shared errors, reset-password and sign-in/up still pending |
| Dashboard / gigs / calendar | Screen bodies unchanged; need extraction and translations |
| Crew directory / profile | Screen bodies unchanged except language picker; need extraction and translations |
| Production workspace / tasks / recce / gear | Needs extraction and translations |
| Earnings / invoices / payments | Needs extraction and translations |
| Admin / company settings / mobile setup | Screen bodies need extraction and translations |
| Public pages / legal text | Need extraction and translations |
| User-generated briefs / posts / bios | Gig descriptions, crew experience/bios, production feed posts and message bodies wired for machine translation; remaining notes/transcripts/tasks pending; runtime translation unverified |

Review full layouts for long translations and RTL when those dictionaries are supplied; fixed left sidebar geometry has not been redesigned.
