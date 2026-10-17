import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const polishDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    text: z.string().min(3).max(4000), name: z.string().max(200), type: z.string().max(60), client: z.string().max(200),
  }).parse(d))
  .handler(async ({ data }) => {
    const { aiJson } = await import("./ai.server");
    const out = await aiJson<{ polished: string }>({
      name: "polish_description",
      schema: { type: "object", additionalProperties: false, required: ["polished"], properties: { polished: { type: "string" } } },
      instructions:
        "You polish the description of a film or commercial production so the crew understand it at a glance. Keep every fact the writer gave, do not invent details, and keep it concise and professional (2-4 sentences). Write in plain English. Return only the polished description.",
      input: JSON.stringify(data),
    });
    return { polished: out.polished.trim() };
  });
