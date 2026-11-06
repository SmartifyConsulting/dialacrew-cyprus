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
  .inputValidator((d) => z.object({ q: z.string().min(3).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(data.q)}`, {
      headers: { "User-Agent": "BookACrew/1.0 (+https://bookacrew.film)", Accept: "application/json" },
    });
    if (!res.ok) return { results: [] as NominatimResult[] };
    const results = (await res.json()) as NominatimResult[];
    return { results };
  });
