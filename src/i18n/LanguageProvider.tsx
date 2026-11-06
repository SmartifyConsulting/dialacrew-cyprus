import { useEffect, useState, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { createAppI18n } from "./index";
import { AccountLanguage } from "./AccountLanguage";
import { LANGUAGE_STORAGE_KEY, languageDirection, languageScale, normalizeLanguage, detectSupportedLanguage } from "./languages";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [instance] = useState(createAppI18n);
  useEffect(() => {
    const apply = (language: string) => {
      const code = normalizeLanguage(language);
      document.documentElement.lang = code;
      document.documentElement.dir = languageDirection(code);
      document.documentElement.style.setProperty("--lang-scale", String(languageScale(code)));
      try { localStorage.setItem(LANGUAGE_STORAGE_KEY, code); } catch { /* Private browsing may disable storage. */ }
    };
    const detector = new LanguageDetector();
    detector.init(undefined, { order: ["localStorage", "navigator"], lookupLocalStorage: LANGUAGE_STORAGE_KEY, caches: [] });
    const detected = detector.detect();
    const code = detectSupportedLanguage(detected);
    instance.on("languageChanged", apply);
    void instance.changeLanguage(code);
    apply(code);
    return () => { instance.off("languageChanged", apply); };
  }, [instance]);
  return <I18nextProvider i18n={instance}><AccountLanguage />{children}</I18nextProvider>;
}
