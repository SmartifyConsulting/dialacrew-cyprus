import { describe, expect, it } from "vitest";
import { arrangeFrames } from "@/lib/frame-controls";

describe("arrangeFrames", () => {
  it("pinning a frame keeps it open but does not move it to the top", () => {
    expect(arrangeFrames(["a", "b", "c"], { order: ["a", "b", "c"], pinned: ["c"] })).toEqual(["a", "b", "c"]);
  });
  it("keeps the saved drag order and appends new frames", () => {
    expect(arrangeFrames(["a", "b", "c", "d"], { order: ["c", "a", "b"], pinned: [] })).toEqual(["c", "a", "b", "d"]);
  });
});
