import { describe, expect, it } from "vitest";
import { isUrgent, lateWithdrawal } from "@/lib/gigs";

const now = new Date("2026-10-14T08:00:00");

describe("Grab a Gig rules", () => {
  it("is urgent when under 3 days to the event", () => {
    expect(isUrgent("2026-10-16", "07:00", now)).toBe(true);
  });
  it("is not urgent at 3 or more days away", () => {
    expect(isUrgent("2026-10-17", "09:00", now)).toBe(false);
  });
  it("charges a penalty for under 24 hours' notice", () => {
    expect(lateWithdrawal("2026-10-15", "07:00", now)).toBe(true);
  });
  it("no penalty with more than 24 hours' notice", () => {
    expect(lateWithdrawal("2026-10-15", "09:00", now)).toBe(false);
  });
});
