import { describe, expect, it } from "vitest";
import { isOutNow, isOverdue, isReserved, type EquipmentCheckout } from "@/lib/equipment";

const loan = (request_state: EquipmentCheckout["request_state"], returned_at: string | null = null) => ({
  request_state, returned_at, expected_return_at: "2000-01-01",
}) as EquipmentCheckout;

describe("inventory handover states", () => {
  it("does not count a pending request or declined request against stock", () => {
    expect(isReserved(loan("requested"))).toBe(false);
    expect(isReserved(loan("declined"))).toBe(false);
  });
  it("reserves approved inventory without treating it as physically collected or overdue", () => {
    expect(isReserved(loan("approved"))).toBe(true);
    expect(isOutNow(loan("approved"))).toBe(false);
    expect(isOverdue(loan("approved"))).toBe(false);
  });
  it("counts collected inventory and flags an overdue return", () => {
    expect(isReserved(loan("collected"))).toBe(true);
    expect(isOutNow(loan("collected"))).toBe(true);
    expect(isOverdue(loan("collected"))).toBe(true);
  });
  it("releases stock when returned", () => {
    expect(isReserved(loan("returned", "2000-01-02"))).toBe(false);
    expect(isOverdue(loan("returned", "2000-01-02"))).toBe(false);
  });
});
