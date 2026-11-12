import { afterEach, describe, expect, it, vi } from "vitest";
import { googlePlacesSearch } from "@/lib/google-places.server";
import { reccePlannerDates, plannerScenarioKey } from "@/lib/crew-recce-planner";
import { recceCost } from "@/components/site/RecceSandbox";
import { locationLocalInput, locationUtc } from "@/lib/location-time";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("round-trips a saved location time without shifting it on every edit", () => {
  const utc = "2026-11-02T06:00:00.000Z";
  for (const zone of ["Africa/Johannesburg", "Europe/Nicosia", "Asia/Kolkata"]) {
    expect(locationUtc(locationLocalInput(utc, zone), zone)).toBe(utc);
  }
});
describe("Google Maps location lookup", () => {
  it("fails explicitly when no key is configured and never falls back to another provider", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(googlePlacesSearch("Nicosia")).rejects.toThrow("not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("normalizes Google coordinates and address fields, with country bias", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [{ id: "place-1", displayName: { text: "Studio" }, formattedAddress: "Studio, Nicosia, Cyprus", location: { latitude: 35.17, longitude: 33.36 }, addressComponents: [{ longText: "Nicosia", types: ["locality"] }] }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const result = await googlePlacesSearch("Studio", "cy");
    expect(result.results[0]).toMatchObject({ lat: "35.17", lon: "33.36", address: { city: "Nicosia" } });
    expect(fetcher.mock.calls[0]![0]).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ regionCode: "CY", textQuery: "Studio" });
  });
  it("surfaces provider failures instead of reporting an empty successful search", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key"); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    await expect(googlePlacesSearch("Studio")).rejects.toThrow("unavailable");
  });
});
describe("recce sandbox dates and expenses", () => {
  it("charges a shared recce date once and ignores a stale production summary", () => {
    expect(reccePlannerDates("2026-11-01", [{ recce_date: "2026-11-02" }, { recce_date: "2026-11-02" }])).toEqual(["2026-11-02"]);
    expect(reccePlannerDates("2026-11-01", [])).toEqual(["2026-11-01"]);
  });
  it("keeps recce and shoot scenarios separate on the same date", () => {
    expect(plannerScenarioKey("p1", "2026-11-02", "recce")).not.toBe(plannerScenarioKey("p1", "2026-11-02", "shoot"));
  });
  it("adds only selected crew rates for one recce day", () => {
    expect(recceCost({ director: 1200, camera: 900 })).toBe(2100);
    expect(recceCost({})).toBe(0);
  });
});
