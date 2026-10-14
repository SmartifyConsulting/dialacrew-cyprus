import { describe, it, expect } from "vitest";
import { overtimeAmount } from "@/lib/costing";
describe("overtime rules", () => {
  it("weekend pays 1.5x", () => expect(overtimeAmount(3000, 2, "2026-10-17", "day")).toBe(900));
  it("night shift pays 2x", () => expect(overtimeAmount(3000, 2, "2026-10-14", "night")).toBe(1200));
  it("weekend night does not stack", () => expect(overtimeAmount(3000, 2, "2026-10-18", "night")).toBe(1200));
});
