import { renderHook, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { COUNTRIES } from "@/lib/countries";

const setting = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/lib/auth", () => ({ usePlatformSetting: () => setting }));
import { useCountries } from "@/lib/use-countries";

afterEach(cleanup);

it("offers every admin-configured country, including countries outside the old crew shortlist", () => {
  setting.data = [
    { code: "GB", name: "United Kingdom", currency: "GBP" },
    { code: "GH", name: "Ghana", currency: "GHS" },
  ];
  expect(renderHook(() => useCountries()).result.current).toEqual(setting.data);
});

it.each([undefined, null, []])("offers the full built-in list while countries are unavailable: %s", (data) => {
  setting.data = data;
  const { result } = renderHook(() => useCountries());
  expect(result.current).toEqual(COUNTRIES);
  expect(result.current.some((country) => country.code === "GB")).toBe(true);
});
