import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertProducerSiteMember(context: { supabase: unknown; userId: string }, productionId: string) {
  const db = (context.supabase as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> });
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const [role, member] = await Promise.all([
    rpc("has_role", { _user_id: context.userId, _role: "producer" }),
    rpc("is_site_member", { _prod: productionId }),
  ]);
  if (role.error || member.error) throw new Error("Could not verify access to this production");
  if (!role.data) throw new Error("Only producers can use Storyboard Studio");
  if (!member.data) throw new Error("Not a member of this production");
}

// Breaks a creative brief into a scene/shot list. Returns shots only — the client inserts them as
// storyboard_shots rows (via the user's own session, so normal RLS applies to the write).
export const breakdownScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productionId: z.string().min(1), brief: z.string().min(10).max(8000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProducerSiteMember(context, data.productionId);
    const { aiJson } = await import("./ai.server");
    const out = await aiJson<{ shots: { scene_number: number; shot_number: number; description: string; duration_seconds: number }[] }>({
      name: "storyboard_breakdown",
      schema: {
        type: "object", additionalProperties: false, required: ["shots"],
        properties: {
          shots: {
            type: "array", items: {
              type: "object", additionalProperties: false, required: ["scene_number", "shot_number", "description", "duration_seconds"],
              properties: {
                scene_number: { type: "integer" }, shot_number: { type: "integer" },
                description: { type: "string" }, duration_seconds: { type: "number" },
              },
            },
          },
        },
      },
      instructions:
        "You are a film storyboard artist's assistant. Break the given creative brief into a numbered sequence of shots, grouped into scenes. For each shot give a concise visual description (camera angle/framing, subject, action — written so a pencil-sketch illustrator could draw it directly) and a realistic duration in seconds (typically 2-8). Keep descriptions under 2 sentences. Return 6-20 shots depending on the brief's length.",
      input: data.brief,
      meta: { userId: context.userId, productionId: data.productionId },
    });
    return { shots: out.shots };
  });

// Generates one shot's graphite pencil storyboard illustration via OpenAI's image API, uploads it to
// storage and updates the shot row. Runs server-side (trusted) after confirming the caller is a
// producer and a member of this production, same authorization storyboard_shots' RLS enforces.
export const generateShotImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productionId: z.string().min(1), shotId: z.string().min(1), description: z.string().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProducerSiteMember(context, data.productionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new Error("AI is not configured.");

    await supabaseAdmin.from("storyboard_shots").update({ status: "generating", generation_error: null }).eq("id", data.shotId);

    // Continuity: every panel is drawn with the whole sequence in view, plus the shot right before
    // it, so characters, wardrobe, setting, props and time of day stay consistent from panel to panel.
    const { data: seq } = await supabaseAdmin.from("storyboard_shots").select("id, scene_number, shot_number, description, is_anchor").eq("production_id", data.productionId).order("sort_order");
    const list = seq ?? [];
    const idx = list.findIndex((s) => s.id === data.shotId);
    const prev = idx > 0 ? list[idx - 1] : null;
    if (idx < 0) throw new Error("Shot not found in this production.");
    let anchor: (typeof list)[number] | null = null;
    for (let i = idx - 1; i >= 0; i--) if (list[i].is_anchor) { anchor = list[i]; break; }
    const story = list.map((s) => `S${s.scene_number}.${s.shot_number}: ${s.description}`).join(" | ").slice(0, 2500);
    const prompt = [
      "Black-and-white graphite pencil storyboard panel, hand-drawn film storyboard art style, rough sketchy pencil shading, no color, no text or captions in the image.",
      "Strict continuity: this panel belongs to one continuous film sequence. Keep the same characters (faces, age, build, hairstyle, wardrobe), the same locations, props, vehicles, weather and time of day as the rest of the sequence, unless this shot explicitly changes them. Same drawing style and line weight in every panel.",
      `Full sequence for reference: ${story}`,
      anchor ? `PRIMARY VISUAL ANCHOR (Scene ${anchor.scene_number} · Shot ${anchor.shot_number}): keep exact fidelity to this reference shot — identical character faces, hairstyle, build, wardrobe, lighting and environment style: ${anchor.description}` : "",
      prev ? `Previous shot (match its characters and setting): ${prev.description}` : "",
      `Draw THIS shot: ${data.description}`,
    ].filter(Boolean).join("\n");
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "gpt-image-1-mini", prompt, size: "1024x1024", n: 1 }),
      });
      const { logAiUsage } = await import("./ai-usage.server");
      const { OPENAI_IMAGE_PER_CALL_USD } = await import("./ai-usage");
      const usageMeta = { activity: "Storyboard illustration", userId: context.userId, productionId: data.productionId };
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.error("Storyboard image generation error", res.status, t);
        await logAiUsage({ provider: "openai", operation: "Image generation", model: "gpt-image-1-mini", status: res.status, cost_usd: 0, error_message: t }, usageMeta);
        throw new Error(res.status === 402 || res.status === 403 ? "AI access is unavailable — check the OpenAI account's billing and access." : "The AI could not generate this illustration.");
      }
      await logAiUsage({ provider: "openai", operation: "Image generation", model: "gpt-image-1-mini", status: 200, cost_usd: OPENAI_IMAGE_PER_CALL_USD }, usageMeta);
      const body = (await res.json()) as { data: { b64_json: string }[] };
      const b64 = body.data[0]?.b64_json;
      if (!b64) throw new Error("The AI returned no image.");

      const path = `${data.productionId}/storyboard/${data.shotId}-${Date.now()}.png`;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const { error: uploadError } = await supabaseAdmin.storage.from("site-files").upload(path, bytes, { contentType: "image/png", upsert: true });
      if (uploadError) throw uploadError;

      await supabaseAdmin.from("storyboard_shots").update({ image_path: path, status: "generated" }).eq("id", data.shotId);
      await supabaseAdmin.from("storyboard_generations").insert({
        production_id: data.productionId, shot_id: data.shotId, kind: "image", provider: "openai", model: "gpt-image-1-mini", status: "succeeded", created_by: context.userId,
      });
      return { path };
    } catch (e) {
      const message = e instanceof Error ? e.message : "The AI could not generate this illustration.";
      await supabaseAdmin.from("storyboard_shots").update({ status: "failed", generation_error: message }).eq("id", data.shotId);
      await supabaseAdmin.from("storyboard_generations").insert({
        production_id: data.productionId, shot_id: data.shotId, kind: "image", provider: "openai", model: "gpt-image-1-mini", status: "failed", created_by: context.userId,
      });
      throw new Error(message);
    }
  });
