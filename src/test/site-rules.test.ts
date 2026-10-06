import { describe, expect, it } from "vitest";
import { providerTotal } from "@/lib/costing";
import { distanceMeters, isOnSite } from "@/lib/geo";

describe("asset fees add to provider total", () => {
  it("adds each selected asset's fee × days to the provider's day rate × days", () => {
    expect(providerTotal(8500, 2, [{ dailyFee: 1500, days: 2 }, { dailyFee: 500, days: 1 }])).toBe(20500);
  });
  it("is just the crew rate when no assets are selected", () => {
    expect(providerTotal(8500, 3, [])).toBe(25500);
  });
});

describe("geofence", () => {
  it("counts someone ~100m away as on site with a 200m radius", () => {
    const d = distanceMeters(-33.9249, 18.4241, -33.9258, 18.4241);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
    expect(isOnSite(d, 200)).toBe(true);
  });
  it("counts someone 1km away as off site", () => {
    expect(isOnSite(distanceMeters(-33.9249, 18.4241, -33.9339, 18.4241), 200)).toBe(false);
  });
});
