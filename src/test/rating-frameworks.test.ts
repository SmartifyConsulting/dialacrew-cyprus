import { describe, expect, it } from "vitest";
import { FRAMEWORKS, inferFramework, summarize } from "@/lib/rating-frameworks";

describe("rating frameworks", () => {
  it("each framework has four categories with the agreed criteria counts", () => {
    expect(FRAMEWORKS.cast.categories.map((c) => c.criteria.length)).toEqual([4, 2, 4, 2]);
    expect(FRAMEWORKS.creative.categories.map((c) => c.criteria.length)).toEqual([3, 2, 4, 2]);
    expect(FRAMEWORKS.crew.categories.map((c) => c.criteria.length)).toEqual([4, 3, 4, 2]);
    expect(FRAMEWORKS.cast.categories[1]!.name).toBe("Performance Quality & Execution");
    expect(FRAMEWORKS.crew.categories[0]!.criteria).toContain("Safety & Protocol Adherence");
  });
  it("picks the rubric from role, or asks when ambiguous", () => {
    expect(inferFramework("Director of Photography")).toBe("crew");
    expect(inferFramework("Director")).toBe("creative");
    expect(inferFramework("Lead Actor")).toBe("cast");
    expect(inferFramework("Make-Up")).toBeNull();
  });
  it("summarises only rated criteria", () => {
    const s = summarize("crew", { "Discipline Proficiency": 5, "Speed & Efficiency": 4 });
    expect(s.categories[1]!.score).toBe(4.5);
    expect(s.categories[0]!.score).toBeNull();
    expect(s.overall).toBe(4.5);
  });
});
