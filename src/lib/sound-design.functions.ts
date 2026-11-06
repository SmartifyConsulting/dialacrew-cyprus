import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertProducerSiteMember(context: { supabase: unknown; userId: string }, productionId: string) {
  const rpc = (context.supabase as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc;
  const [role, member] = await Promise.all([
    rpc("has_role", { _user_id: context.userId, _role: "producer" }),
    rpc("is_site_member", { _prod: productionId }),
  ]);
  if (role.error || member.error) throw new Error("Could not verify access to this production");
  if (!role.data) throw new Error("Only producers can use Storyboard Studio");
  if (!member.data) throw new Error("Not a member of this production");
}

// The AI Sound Director: reads the storyboard's scenes/shots and proposes an emotional soundtrack
// journey — a music bed per scene, key SFX per shot, and where narration would help. The producer
// reviews this and picks what to actually generate; nothing is created here.
export const proposeSoundtrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productionId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProducerSiteMember(context, data.productionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: shots, error } = await supabaseAdmin.from("storyboard_shots").select("scene_number, shot_number, description, duration_seconds").eq("production_id", data.productionId).order("sort_order");
    if (error) throw error;
    if (!shots?.length) throw new Error("Break the storyboard down into shots first, in Illustrate mode.");

    const { aiJson } = await import("./ai.server");
    const out = await aiJson<{ proposals: { kind: "music" | "sfx" | "ambience" | "narration"; scene_number: number; shot_number: number | null; label: string; prompt: string; duration_seconds: number }[] }>({
      name: "storyboard_sound_director",
      schema: {
        type: "object", additionalProperties: false, required: ["proposals"],
        properties: {
          proposals: {
            type: "array", items: {
              type: "object", additionalProperties: false, required: ["kind", "scene_number", "shot_number", "label", "prompt", "duration_seconds"],
              properties: {
                kind: { type: "string", enum: ["music", "sfx", "ambience", "narration"] },
                scene_number: { type: "integer" },
                shot_number: { type: ["integer", "null"] },
                label: { type: "string" }, prompt: { type: "string" }, duration_seconds: { type: "number" },
              },
            },
          },
        },
      },
      instructions:
        "You are a film sound director. Given this storyboard's scenes and shots, propose an emotional soundtrack journey: one 'music' cue per scene (shot_number null) describing mood/genre/instrumentation as a generation prompt; 'sfx' or 'ambience' cues for specific shots that need them (shot_number set); and 'narration' cues only where a voiceover would genuinely help tell the story, with the prompt being the line to speak. Keep prompts concrete and suitable for an AI audio generator. Propose 4-12 items total, not one per shot.",
      input: JSON.stringify(shots),
    });
    return { proposals: out.proposals };
  });

async function uploadAndLogVersion(opts: {
  productionId: string; cueId: string; bytes: Uint8Array; contentType: string; ext: string; prompt: string | null; userId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = `${opts.productionId}/storyboard-audio/${opts.cueId}-${Date.now()}.${opts.ext}`;
  const { error: uploadError } = await supabaseAdmin.storage.from("site-files").upload(path, opts.bytes, { contentType: opts.contentType, upsert: true });
  if (uploadError) throw uploadError;
  await supabaseAdmin.from("storyboard_audio_cues").update({ audio_path: path, status: "generated", generation_error: null }).eq("id", opts.cueId);
  await supabaseAdmin.from("storyboard_audio_cue_versions").insert({ cue_id: opts.cueId, production_id: opts.productionId, audio_path: path, prompt: opts.prompt, created_by: opts.userId });
  return path;
}

// Generates one audio cue. Music/SFX/ambience go through Stability AI's Stable Audio; narration
// goes through OpenAI's text-to-speech (Stability doesn't do voice). Every take is kept as a
// version row rather than overwritten, so a producer can listen back and restore an earlier one.
export const generateAudioCue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    productionId: z.string().min(1), cueId: z.string().min(1),
    kind: z.enum(["music", "sfx", "ambience", "narration"]), prompt: z.string().min(1).max(4000), durationSeconds: z.number().min(1).max(180).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProducerSiteMember(context, data.productionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("storyboard_audio_cues").update({ status: "generating", generation_error: null }).eq("id", data.cueId);

    try {
      let path: string;
      if (data.kind === "narration") {
        const key = process.env["OPENAI_API_KEY"];
        if (!key) throw new Error("AI is not configured.");
        const res = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "onyx", input: data.prompt, response_format: "mp3" }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("Narration generation error", res.status, t);
          throw new Error(res.status === 402 || res.status === 403 ? "AI access is unavailable — check the OpenAI account's billing and access." : "The AI could not generate this narration.");
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        path = await uploadAndLogVersion({ productionId: data.productionId, cueId: data.cueId, bytes, contentType: "audio/mpeg", ext: "mp3", prompt: data.prompt, userId: context.userId });
        await supabaseAdmin.from("storyboard_generations").insert({ production_id: data.productionId, shot_id: null, kind: "narration", provider: "openai", model: "gpt-4o-mini-tts", status: "succeeded", created_by: context.userId });
      } else {
        const key = process.env["STABILITY_API_KEY"];
        const base = (process.env["STABILITY_BASE_URL"] || "https://api.stability.ai").replace(/\/+$/, "");
        if (!key) throw new Error("Stability AI is not configured.");
        const form = new FormData();
        form.set("prompt", data.prompt);
        form.set("model", "stable-audio-2.5");
        form.set("output_format", "mp3");
        form.set("duration", String(Math.min(190, Math.max(1, Math.round(data.durationSeconds ?? 20)))));
        const res = await fetch(`${base}/v2beta/audio/stable-audio-2/text-to-audio`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, accept: "audio/*" },
          body: form,
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          console.error("Stable Audio generation error", res.status, t);
          throw new Error(res.status === 429 ? "Too many audio requests — try again shortly." : "The AI could not generate this audio.");
        }
        const bytes = new Uint8Array(await res.arrayBuffer());
        path = await uploadAndLogVersion({ productionId: data.productionId, cueId: data.cueId, bytes, contentType: "audio/mpeg", ext: "mp3", prompt: data.prompt, userId: context.userId });
        await supabaseAdmin.from("storyboard_generations").insert({ production_id: data.productionId, shot_id: null, kind: data.kind, provider: "stability", model: "stable-audio-2.5", status: "succeeded", created_by: context.userId });
      }
      return { path };
    } catch (e) {
      const message = e instanceof Error ? e.message : "The AI could not generate this audio.";
      await supabaseAdmin.from("storyboard_audio_cues").update({ status: "failed", generation_error: message }).eq("id", data.cueId);
      await supabaseAdmin.from("storyboard_generations").insert({ production_id: data.productionId, shot_id: null, kind: data.kind, provider: data.kind === "narration" ? "openai" : "stability", status: "failed", created_by: context.userId });
      throw new Error(message);
    }
  });

// Points a cue back at an earlier generated take instead of the current one.
export const restoreAudioVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productionId: z.string().min(1), cueId: z.string().min(1), versionId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProducerSiteMember(context, data.productionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: version, error } = await supabaseAdmin.from("storyboard_audio_cue_versions").select("audio_path").eq("id", data.versionId).eq("cue_id", data.cueId).single();
    if (error || !version) throw new Error("That version could not be found.");
    await supabaseAdmin.from("storyboard_audio_cues").update({ audio_path: version.audio_path, status: "generated" }).eq("id", data.cueId);
    return { path: version.audio_path };
  });
