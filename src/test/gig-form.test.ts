import { describe, it, expect } from "vitest";
import { internationalPhone } from "@/lib/gig-form";
describe("gig contact phone", () => {
  it("adds a calling code and removes the domestic trunk prefix", () => {
    expect(internationalPhone("082 123 4567", "+27")).toBe("+27821234567");
  });
  it("preserves a pasted international number without adding a second code", () => {
    expect(internationalPhone("+91 98765 43210", "+27")).toBe("+919876543210");
    expect(internationalPhone("0044 7700 900123", "+27")).toBe("+447700900123");
  });
  it("rejects non-numeric, blank and overlength values", () => {
    for (const value of ["", "abc", "+1234567890123456"]) expect(() => internationalPhone(value, "+27")).toThrow();
  });
});
