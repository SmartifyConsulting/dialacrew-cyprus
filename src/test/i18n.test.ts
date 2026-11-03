import { describe, expect, it } from "vitest";
import { createAppI18n } from "@/i18n";
import { detectSupportedLanguage, languageDirection, languageScale, normalizeLanguage, SUPPORTED_LANGUAGES } from "@/i18n/languages";

describe("borrowed language architecture", () => {
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
