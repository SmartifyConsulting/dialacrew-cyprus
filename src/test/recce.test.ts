import { describe, expect, it } from "vitest";
import { groupRecces, recceOverlaps, recceRange, validRecceTimes } from "@/lib/recce";

const loc = (id: string, date: string | null, s: string | null, e: string | null) => ({ id, production_id: "p1", label: id, recce_date: date, recce_start_time: s, recce_end_time: e, latitude: null, longitude: null });

describe("recce", () => {
  it("rejects end not after start", () => {
    expect(validRecceTimes("10:00", "09:00")).toBe(false);
    expect(validRecceTimes("10:00", "10:00")).toBe(false);
    expect(validRecceTimes(null, "09:00")).toBe(true);
  });
  it("merges same-date locations into earliest start / latest end", () => {
    const g = groupRecces([loc("a", "2026-11-02", "10:00:00", "12:00:00"), loc("b", "2026-11-02", "08:30:00", "11:00:00"), loc("c", "2026-11-03", null, null)]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ start: "08:30", end: "12:00" });
    expect(g[0]!.locations.map((x) => x.index)).toEqual([1, 2]);
    expect(recceRange(g[1]!.start, g[1]!.end)).toBe("Time TBC");
  });
  it("overlap uses the time interval, not the whole day", () => {
    expect(recceOverlaps({ date: "d", start: "08:00", end: "10:00" }, { date: "d", start: "10:00", end: "12:00" })).toBe(false);
    expect(recceOverlaps({ date: "d", start: "08:00", end: "11:00" }, { date: "d", start: "10:00", end: "12:00" })).toBe(true);
  });
});
