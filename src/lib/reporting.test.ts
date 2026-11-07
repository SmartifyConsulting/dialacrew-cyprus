import { describe, expect, it } from "vitest";
import { buildReport } from "./reporting";
import type { Booking, Production } from "./demo-data";

const p: Production = { id: "p1", name: "Ad", client: "C", type: "TVC", location: "CPT", date: "2026-11-10", days: 2, status: "Upcoming", budget: 10000, crewBooked: 0, crewNeeded: 3, securedFunds: 0 };
const b = (o: Partial<Booking>): Booking => ({ id: "b", productionId: "p1", crewId: "c", role: "DOP", status: "confirmed", crewRate: 3000, clientCharge: 0, days: 2, ...o });
const now = new Date("2026-11-07T12:00:00");

describe("buildReport", () => {
  it("counts committed cost from booked crew only (rate × days)", () => {
    const r = buildReport(p, [b({ id: "1" }), b({ id: "2", status: "pencil" })], [], [], now);
    expect(r.committed).toBe(6000);
    expect(r.booked).toBe(1);
    expect(r.pencilled).toBe(1);
  });
  it("flags unfilled roles when shoot is within 14 days", () => {
    const r = buildReport(p, [b({ id: "1" })], [], [], now);
    expect(r.unfilled).toBe(2);
    expect(r.attention.some((a) => a.includes("2 roles unfilled"))).toBe(true);
  });
  it("flags over budget and open disputes", () => {
    const r = buildReport(p, [b({ id: "1", crewRate: 6000 })], [], [{ booking_id: "1", status: "open", amount_disputed: 500 }], now);
    expect(r.attention.some((a) => a.startsWith("Over budget"))).toBe(true);
    expect(r.openDisputes).toBe(1);
  });
});
