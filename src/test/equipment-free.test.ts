import { describe, expect, it } from "vitest";
import { equipmentFree } from "@/components/site/EquipmentAvailability";

describe("equipment availability", () => {
  it("3 owned, 1 out elsewhere → 2 free", () => expect(equipmentFree(3, 1, 0)).toBe(2));
  it("booking the last unit leaves 0 free (unavailable)", () => expect(equipmentFree(3, 1, 2)).toBe(0));
  it("never goes negative", () => expect(equipmentFree(1, 2, 0)).toBe(0));
});
