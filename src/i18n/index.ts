import { createInstance } from "i18next";
import { SUPPORTED_LANGUAGES } from "./languages";

export { SUPPORTED_LANGUAGES } from "./languages";

// JSON files are pure data: importing these is safe during SSR.
const dictionaries = import.meta.glob<{ default: Record<string, unknown> }>("./locales/*.json", { eager: true });
const resources = Object.fromEntries(SUPPORTED_LANGUAGES.map(({ code }) => [
  code, { translation: dictionaries[`./locales/${code}.json`]?.default ?? {} },
]));

// Each root owns its instance, so SSR requests cannot share a visitor's language.
export function createAppI18n() {
  const instance = createInstance();
  void instance.init({
    resources, lng: "en", fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES.map(({ code }) => code),
    initAsync: false,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}