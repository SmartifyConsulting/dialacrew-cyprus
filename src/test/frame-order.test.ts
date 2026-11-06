import { describe, expect, it } from "vitest";
import { arrangeFrames } from "@/lib/frame-controls";

describe("sidebar frame order", () => {
  it("puts pinned frames at the top", () => {
    expect(arrangeFrames(["overview", "locations", "gear"], { order: [], pinned: ["gear"] })).toEqual(["gear", "overview", "locations"]);
  });
  it("keeps a dragged order and appends new frames", () => {
    expect(arrangeFrames(["overview", "locations", "gear"], { order: ["locations", "overview"], pinned: [] })).toEqual(["locations", "overview", "gear"]);
  });
});
