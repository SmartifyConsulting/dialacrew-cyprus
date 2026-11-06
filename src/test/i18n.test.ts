import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/i18n";
import english from "@/i18n/locales/en.json";
import { detectSupportedLanguage, languageDirection, languageScale, normalizeLanguage, SUPPORTED_LANGUAGES } from "@/i18n/languages";

describe("borrowed language architecture", () => {
  it("resolves literal screen translation keys in Greek", () => {
    const sources = import.meta.glob<string>(["../components/**/*.tsx", "../routes/**/*.tsx"], { query: "?raw", import: "default", eager: true });
    const instance = createAppI18n();
    for (const [filename, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\b(?:t|translate)\(\s*["']([^"']+)["']/g)) {
        const key = match[1]!;
        const direct = instance.getResource("el", "translation", key);
        const plural = ["one", "other"].every((suffix) => typeof instance.getResource("el", "translation", `${key}_${suffix}`) === "string");
        expect(typeof direct === "string" || plural, `${filename}: ${key}`).toBe(true);
      }
    }
  });
  it("provides Greek strings for every extracted English dictionary key", () => {
    const instance = createAppI18n();
    const verify = (value: Record<string, unknown>, prefix = "") => {
      for (const [key, entry] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof entry === "string") {
          const translated = instance.getResource("el", "translation", path);
          expect(translated, path).toBeTypeOf("string");
          expect(translated, path).not.toBe(entry);
          const variables = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();
          expect(variables(translated), path).toEqual(variables(entry));
        } else verify(entry as Record<string, unknown>, path);
      }
    };
    verify(english);
  });
  it("provides Greek and Hindi authentication drafts with working interpolation", async () => {
    for (const language of ["el", "hi"]) {
      const instance = createAppI18n();
      await instance.changeLanguage(language);
      for (const key of ["auth.signIn", "auth.showPassword", "recovery.newPassword", "recovery.update"]) {
        expect(instance.getResource(language, "translation", key)).toBeTypeOf("string");
        expect(instance.t(key)).not.toBe(key);
      }
      expect(instance.t("auth.retry", { seconds: 12 })).toContain("12");
      expect(instance.t("recovery.sent", { email: "crew@example.com" })).toContain("crew@example.com");
    }
  });
  it("retains Holarc scaling with full-size defaults for new scripts", () => {
    expect(languageScale("el-GR")).toBe(0.94);
    expect(languageScale("ja")).toBe(1.02);
    for (const code of ["hi", "mr", "ur", "te", "ta", "ml"]) expect(languageScale(code)).toBe(1);
  });
  it("honors saved preferences and skips unsupported browser languages", () => {
    expect(detectSupportedLanguage(["ur-PK", "el-GR"])).toBe("ur");
    expect(detectSupportedLanguage(["unsupported", "el-GR"])).toBe("el");
    expect(detectSupportedLanguage([null, "ta-IN"])).toBe("ta");
    expect(detectSupportedLanguage(undefined)).toBe("en");
  });
  it("retains Greek and the three requested Nigerian languages", () => {
    for (const code of ["el", "ha", "ig", "yo"]) expect(SUPPORTED_LANGUAGES.some((language) => language.code === code)).toBe(true);
  });
  it("includes Hindi and the additional selected Indian film languages", () => {
    for (const code of ["hi", "mr", "ur", "te", "ta", "ml"]) expect(normalizeLanguage(code)).toBe(code);
  });
  it("sets Urdu, Arabic and Hebrew right-to-left, but not Greek or Hindi", () => {
    for (const code of ["ur", "ar", "he"]) expect(languageDirection(code)).toBe("rtl");
    for (const code of ["el", "hi"]) expect(languageDirection(code)).toBe("ltr");
  });
  it("normalizes regional codes and rejects unsupported choices", () => {
    expect(normalizeLanguage("el-GR")).toBe("el");
    expect(normalizeLanguage("unknown")).toBe("en");
  });
  it("falls back to English for empty placeholders and missing app keys", async () => {
    const instance = createAppI18n();
    await instance.changeLanguage("mr");
    expect(instance.t("nav.productions")).toBe("Productions");
    expect(instance.getResource("mr", "translation", "nav.productions")).toBeUndefined();
  });
  it("keeps request instances independent", async () => {
    const first = createAppI18n();
    const second = createAppI18n();
    await first.changeLanguage("el");
    expect(second.language).toBe("en");
  });
});
