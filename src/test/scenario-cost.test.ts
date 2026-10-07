import { describe, expect, it } from "vitest";
import { scenarioCost } from "@/components/site/ScenarioPlanner";

describe("scenario cost", () => {
  it("adds day rate × days plus chosen kit fees × days per crew member", () => {
    expect(scenarioCost({ a: ["k1"], b: [] }, 2, { a: 3000, b: 2000 }, { k1: 500 })).toBe(3000 * 2 + 500 * 2 + 2000 * 2);
  });
  it("cheaper when kit is deselected", () => {
    expect(scenarioCost({ a: [] }, 3, { a: 1000 }, { k1: 900 })).toBe(3000);
  });
});
