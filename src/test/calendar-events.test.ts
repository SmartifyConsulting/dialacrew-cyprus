import { describe, expect, it } from "vitest";
import { buildCalendarEvents, findConflicts, gearValid, toICS, zonedToUtc, type ProdIn } from "@/lib/calendar-events";

const prod = (over: Partial<ProdIn> = {}): ProdIn => ({
  id: "p1", name: "Ad", client: "Nike", location: "Cape Town", address: "1 Long St", date: null, days: 1, timezone: "Africa/Johannesburg",
  latitude: null, longitude: null, recceDate: null, recceStart: null, recceEnd: null,
  gearPickupDate: null, gearPickupTime: null, gearDropoffDate: null, gearDropoffTime: null, ...over,
});
const all = { canSeeAddress: () => true };

describe("calendar events", () => {
  it("converts production-local time to exact UTC", () => {
    expect(zonedToUtc("2026-11-02", "08:30", "Africa/Johannesburg")).toBe("2026-11-02T06:30:00.000Z");
    expect(zonedToUtc("2026-07-01", "09:00", "Europe/London")).toBe("2026-07-01T08:00:00.000Z");
  });
  it("leaves unknown times unscheduled instead of midnight", () => {
    const [e] = buildCalendarEvents([prod({ date: "2026-11-02" })], [], [], all);
    expect(e).toMatchObject({ kind: "shoot", start: null, end: null, timeLabel: "Time TBC" });
  });
  it("gear check spans pickup to drop-off across days", () => {
    const [g] = buildCalendarEvents([prod({ gearPickupDate: "2026-11-02", gearPickupTime: "09:00", gearDropoffDate: "2026-11-04", gearDropoffTime: "17:00" })], [], [], all);
    expect(g).toMatchObject({ kind: "gear", day: "2026-11-02", endDay: "2026-11-04", start: "2026-11-02T07:00:00.000Z", end: "2026-11-04T15:00:00.000Z" });
  });
  it("one recce event per production per date with combined times", () => {
    const loc = (id: string, s: string, e: string, n: number) => ({ id, production_id: "p1", label: id, recce_date: "2026-11-02", recce_start_time: s, recce_end_time: e, latitude: null, longitude: null, starts_at: null, sort_order: n });
    const ev = buildCalendarEvents([prod()], [loc("a", "10:00", "12:00", 0), loc("b", "08:00", "11:00", 1)], [], all);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.timeLabel).toBe("08:00–12:00");
  });
  it("uses location recce dates instead of a stale production summary in calendars and ICS", () => {
    const locations = ["2026-11-03", "2026-11-04"].map((day, i) => ({
      id: `l${i}`, production_id: "p1", label: `Location ${i + 1}`, recce_date: day,
      recce_start_time: "09:00", recce_end_time: "10:00", latitude: null, longitude: null, starts_at: null,
    }));
    for (const recceDate of ["2026-11-02", "2026-11-03", null]) {
      const events = buildCalendarEvents([prod({ recceDate })], locations, [], all);
      expect(events.map((e) => e.day)).toEqual(["2026-11-03", "2026-11-04"]);
      expect(events.every((e) => e.kind === "recce")).toBe(true);
      const ics = toICS(events);
      expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
      expect(ics).not.toContain("UID:recce-p1-2026-11-02@bookacrew");
    }
  });
  it("keeps a production-only recce visible when locations have no recce dates", () => {
    const events = buildCalendarEvents([prod({ recceDate: "2026-11-02", recceStart: "08:30" })], [{
      id: "l1", production_id: "p1", label: "Studio", recce_date: null,
      latitude: null, longitude: null, starts_at: null,
    }], [], all);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ uid: "recce-p1-2026-11-02", kind: "recce", day: "2026-11-02", timeLabel: "From 08:30" });
  });
  it("keeps distinct productions and shoot events on the same recce date", () => {
    const events = buildCalendarEvents([
      prod({ date: "2026-11-02", recceDate: "2026-11-02" }),
      prod({ id: "p2", recceDate: "2026-11-02" }),
    ], [], [], all);
    expect(events.map((e) => e.uid).sort()).toEqual([
      "recce-p1-2026-11-02", "recce-p2-2026-11-02", "shoot-p1-2026-11-02",
    ]);
  });
  it("detects overlaps across event types of different productions only", () => {
    const ev = buildCalendarEvents([
      prod({ gearPickupDate: "2026-11-02", gearPickupTime: "09:00", gearDropoffDate: "2026-11-02", gearDropoffTime: "12:00", date: "2026-11-02" }),
      prod({ id: "p2", recceDate: "2026-11-02", recceStart: "11:00", recceEnd: "13:00" }),
    ], [], [{ productionId: "p1", crewId: "c", status: "confirmed", bookingDate: "2026-11-02", callTime: "10:00", wrapTime: "18:00", days: 1 }], all);
    const c = findConflicts(ev);
    expect(c.has("gear-p1")).toBe(true);
    expect(c.has("recce-p2-2026-11-02")).toBe(true);
  });
  it("ICS uses exact UTC instants and stable UIDs; unscheduled is date-only and free", () => {
    const ics = toICS(buildCalendarEvents([prod({ date: "2026-11-02", recceDate: "2026-11-01", recceStart: "08:00", recceEnd: "10:00" })], [], [], all));
    expect(ics).toContain("UID:recce-p1-2026-11-01@bookacrew");
    expect(ics).toContain("DTSTART:20261101T060000Z");
    expect(ics).toContain("DTEND:20261101T080000Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261102");
    expect(ics).toContain("TRANSP:TRANSPARENT");
  });
  it("hides exact addresses when not allowed", () => {
    const [e] = buildCalendarEvents([prod({ date: "2026-11-02" })], [], [], { canSeeAddress: () => false });
    expect(e!.location).toBe("Cape Town");
  });
  it("gear drop-off must be after pickup", () => {
    expect(gearValid("2026-11-02", "10:00", "2026-11-02", "09:00")).toBe(false);
    expect(gearValid("2026-11-03", null, "2026-11-02", null)).toBe(false);
    expect(gearValid("2026-11-02", "17:00", "2026-11-03", "09:00")).toBe(true);
  });
});
