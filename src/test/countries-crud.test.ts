import { describe, expect, it } from "vitest";
import { COUNTRIES, validateCountry } from "@/lib/countries";
import { estimateChatCostUsd } from "@/lib/ai-usage";

describe("country validation", () => {
  it("rejects a duplicate country code", () => {
    expect(validateCountry({ code: "CY", name: "Cyprus 2", currency: "EUR" }, COUNTRIES)).toBe("That country code already exists");
  });
  it("allows keeping the same code while editing", () => {
    expect(validateCountry({ code: "CY", name: "Republic of Cyprus", currency: "EUR" }, COUNTRIES, "CY")).toBeNull();
  });
  it("requires a 3-letter currency", () => {
    expect(validateCountry({ code: "GH", name: "Ghana", currency: "GH" }, COUNTRIES)).toBe("The currency must be 3 letters, e.g. KES");
  });
});

describe("token ledger pricing", () => {
  it("prices gpt-4.1-mini at $0.40 in / $1.60 out per million tokens", () => {
    expect(estimateChatCostUsd("gpt-4.1-mini-2025-04-14", 1_000_000, 1_000_000)).toBe(2);
  });
});
