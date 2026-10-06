import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ audio: z.string().min(10).max(30_000_000), mime: z.string().max(100) }).parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Transcription is not configured.");
    const bytes = Buffer.from(data.audio, "base64");
    const type = data.mime.split(";")[0] || "audio/webm";
    const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("model", "openai/gpt-transcribe");
    form.append("file", new File([bytes], `note.${ext}`, { type }));
    form.append("response_format", "json");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text();
      console.error("transcribe failed", res.status, t);
      if (res.status === 402) throw new Error("AI credits have run out — top up to keep transcribing.");
      if (res.status === 429) throw new Error("Too many requests — try again in a moment.");
      throw new Error("Could not transcribe this recording.");
    }
    const json = (await res.json()) as { text?: string };
    return { text: json.text ?? "" };
  });
