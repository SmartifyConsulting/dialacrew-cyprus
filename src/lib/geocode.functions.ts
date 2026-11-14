import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serpMapsSearch } from "./serpapi-maps.server";
export const geocodeSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(3).max(200), country: z.string().regex(/^[a-z]{2}$/i).optional() }).parse(d))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return serpMapsSearch(data.q, data.country);
  });
