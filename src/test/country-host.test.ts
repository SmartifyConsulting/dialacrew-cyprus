import { describe, expect, it } from "vitest";
import { countryFromHost } from "@/lib/country-logos";

describe("countryFromHost", () => {
  it("maps the Cyprus subdomain to CY", () => expect(countryFromHost("cyprus.bookacrew.film")).toBe("CY"));
  it("leaves the main domain unbranded", () => expect(countryFromHost("bookacrew.film")).toBeNull());
});
