import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type NominatimResult = {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

// Address lookup against OpenStreetMap's free Nominatim search, called server-side. Nominatim's
// usage policy requires a real identifying User-Agent — something a browser's own fetch() can't
// set (it's a forbidden header there), which otherwise gets requests silently rate-limited or
// dropped. Routing through a server function lets us send one.
export const geocodeSearch = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ q: z.string().min(3).max(200), country: z.string().regex(/^[a-z]{2}$/i).optional() }).parse(d))
  .handler(async ({ data }) => {
    const run = async (country?: string) => {
      const cc = country ? `&countrycodes=${country.toLowerCase()}` : "";
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(data.q)}${cc}`, {
        headers: { "User-Agent": "BookACrew/1.0 (+https://bookacrew.film)", Accept: "application/json" },
      });
      if (!res.ok) return [] as NominatimResult[];
      return (await res.json()) as NominatimResult[];
    };
    // Search the production's own country first so "26 Heng…" doesn't jump to China or Norway; only go
    // worldwide when nothing local matches.
    let results = data.country ? await run(data.country) : [];
    if (results.length === 0) results = await run();
    return { results };
  });
