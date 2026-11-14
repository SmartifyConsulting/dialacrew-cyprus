import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/use-countries",()=>({useCountries:()=>[]}));
import { countryOptions } from "@/lib/country-options";
describe("worldwide country choices",()=>{
 it("includes all 249 ISO country/territory codes without duplicates",()=>{const options=countryOptions();expect(options).toHaveLength(249);expect(new Set(options.map(c=>c.code)).size).toBe(249);for(const code of ["GR","GH","CA","CN","BR","PK","ZA","CY"])expect(options.some(c=>c.code===code)).toBe(true);});
 it("preserves admin country labels and custom entries",()=>{expect(countryOptions([{code:"GB",name:"UK"},{code:"XK",name:"Kosovo"}]).find(c=>c.code==="GB")?.name).toBe("UK");expect(countryOptions([{code:"XK",name:"Kosovo"}]).some(c=>c.code==="XK")).toBe(true);});
});
