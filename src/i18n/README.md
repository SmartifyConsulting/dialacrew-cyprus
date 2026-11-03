# Book a Crew language foundation

Based on Holarc Health's i18next / react-i18next architecture. Only generic common labels, home/profile/admin labels and the calendar label were copied; medical wording is excluded. No new non-English translations were generated. This is not a fully translated app.

## Supply translations

- `locales/en.json` is the current app-specific source dictionary. Keep key names unchanged when translating values with your preferred tool.
- All 25 Holarc languages are registered. Marathi (`mr`), Urdu (`ur`), Telugu (`te`), Tamil (`ta`) and Malayalam (`ml`) have empty JSON placeholders. Missing keys fall back to English, not raw key names.
- Replace or extend the corresponding JSON dictionary to import translations. Preserve interpolation variables such as `{{name}}` when adding new strings.
- New screen strings need both an English dictionary entry and `useTranslation().t("section.key")` in that screen. Adding dictionaries alone does not translate hardcoded screen text.
- Language selection is saved on this browser/device under `bookacrew.language`; it is not yet synchronized between devices or saved to account records. Storage-disabled browsers still support changing language in the current session.
- Arabic, Hebrew and Urdu set document RTL after hydration. No browser globals or detection run during SSR; each root owns its own instance.
- No AI requests, automatic translation, content translation, database migration or credentials are involved.

## Current coverage audit

| Surface | Current coverage |
| --- | --- |
| Shared navigation | Labels wired; copied translations for home, calendar, profile, admin and sign-out where available; Book a Crew-specific labels await translations |
| Language picker | All 30 registered languages, persistent on this device; available before sign-in and on own profile/company settings |
| Authentication / password recovery | Existing copy unchanged; needs extraction and translations |
| Dashboard / gigs / calendar | Screen bodies unchanged; need extraction and translations |
| Crew directory / profile | Screen bodies unchanged except language picker; need extraction and translations |
| Production workspace / tasks / recce / gear | Needs extraction and translations |
| Earnings / invoices / payments | Needs extraction and translations |
| Admin / company settings / mobile setup | Screen bodies need extraction and translations |
| Public pages / legal text | Need extraction and translations |
| User-generated briefs / posts / bios | Original content retained; translation not implemented |

Review full layouts for long translations and RTL when those dictionaries are supplied; fixed left sidebar geometry has not been redesigned.