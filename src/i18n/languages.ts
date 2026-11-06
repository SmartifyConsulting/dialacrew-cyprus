export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" }, { code: "af", name: "Afrikaans" },
  { code: "zu", name: "isiZulu" }, { code: "xh", name: "isiXhosa" },
  { code: "sn", name: "Shona" }, { code: "sw", name: "Kiswahili" },
  { code: "ha", name: "Hausa" }, { code: "ig", name: "Igbo" },
  { code: "yo", name: "Yorùbá" }, { code: "ar", name: "العربية" },
  { code: "he", name: "עברית" }, { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" }, { code: "es", name: "Español" },
  { code: "pt", name: "Português" }, { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" }, { code: "el", name: "Ελληνικά" },
  { code: "pl", name: "Polski" }, { code: "ru", name: "Русский" },
  { code: "tr", name: "Türkçe" }, { code: "hi", name: "हिन्दी" },
  { code: "zh", name: "中文" }, { code: "ja", name: "日本語" },
  { code: "ko", name: "한국어" }, { code: "mr", name: "मराठी" },
  { code: "ur", name: "اردو" }, { code: "te", name: "తెలుగు" },
  { code: "ta", name: "தமிழ்" }, { code: "ml", name: "മലയാളം" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
export const LANGUAGE_STORAGE_KEY = "bookacrew.language";

const LANGUAGE_SCALES: Partial<Record<LanguageCode, number>> = {
  de: 0.94, nl: 0.94, ru: 0.94, el: 0.94, pl: 0.94, tr: 0.94, fr: 0.94, pt: 0.94, it: 0.94,
  ha: 0.96, ig: 0.96, yo: 0.96, sw: 0.96, sn: 0.96, zu: 0.96, xh: 0.96, af: 0.96,
  zh: 1.02, ja: 1.02, ko: 1.02,
};

export function languageScale(code: string): number {
  return LANGUAGE_SCALES[normalizeLanguage(code)] ?? 1;
}

export function normalizeLanguage(value: unknown): LanguageCode {
  if (typeof value !== "string") return "en";
  const base = value.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.find((language) => language.code === base)?.code ?? "en";
}

export function languageDirection(code: string) {
  return ["ar", "he", "ur"].includes(normalizeLanguage(code)) ? "rtl" : "ltr";
}

export function detectSupportedLanguage(values: unknown): LanguageCode {
  const candidates = Array.isArray(values) ? values : [values];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const base = candidate.toLowerCase().split(/[-_]/)[0];
    if (SUPPORTED_LANGUAGES.some((language) => language.code === base)) return normalizeLanguage(candidate);
  }
  return "en";
}
