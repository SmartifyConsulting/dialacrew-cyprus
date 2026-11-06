import { describe, expect, it } from "vitest";
import { matchesCountry, productionCountry } from "@/lib/crew-country";

describe("crew country filter", () => {
  it("defaults to local crew: a Cyprus production only shows Cyprus crew", () => {
    const local = productionCountry("EUR");
    expect(matchesCountry("CY", "local", local)).toBe(true);
    expect(matchesCountry("ZA", "local", local)).toBe(false);
  });
  it("can pick another country or all countries", () => {
    expect(matchesCountry("NG", "NG", "ZA")).toBe(true);
    expect(matchesCountry("IN", "ALL", "ZA")).toBe(true);
  });
});
