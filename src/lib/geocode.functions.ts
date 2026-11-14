import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { serpMapsSearch } from "./serpapi-maps.server";
export const geocodeSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().min(3).max(200), country: z.string().regex(/^[a-z]{2}$/i).optional() }).parse(d))
  .handler(async ({ data }) => serpMapsSearch(data.q, data.country));
