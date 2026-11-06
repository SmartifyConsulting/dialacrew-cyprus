// Server-only helper: streamed, schema-constrained JSON from OpenAI's Responses API.
// Every call is recorded in the Token Ledger (ai_usage_events).
import { logAiUsage, type UsageMeta } from "./ai-usage.server";

const URL_ = "https://api.openai.com/v1/responses";
export const AI_MODEL = "gpt-4.1-mini";

const ACTIVITY: Record<string, string> = {
  storyboard_breakdown: "Storyboard shot breakdown",
  polish_description: "Polish with AI",
  storyboard_sound_director: "Sound design proposals",
  content_translation: "Translation",
  company_memory: "MemoryBank relearn",
};

export async function aiJson<T>(opts: { name: string; schema: Record<string, unknown>; instructions: string; input: string; meta?: UsageMeta }): Promise<T> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  const meta: UsageMeta = { ...opts.meta, activity: opts.meta?.activity ?? ACTIVITY[opts.name] ?? opts.name.replace(/_/g, " ") };
  const res = await fetch(URL_, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: AI_MODEL,
      instructions: opts.instructions,
      input: opts.input,
      store: false,
      stream: true,
      text: { format: { type: "json_schema", name: opts.name, strict: true, schema: opts.schema } },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    console.error("AI gateway error", res.status, t);
    await logAiUsage({ provider: "openai", operation: "Chat", model: AI_MODEL, status: res.status, cost_usd: 0, error_message: t }, meta);
    if (res.status === 402 || res.status === 403) throw new Error("AI access is unavailable — check the OpenAI account's billing and access.");
    if (res.status === 429) throw new Error("Too many AI requests — try again in a minute.");
    throw new Error("The AI could not complete this request.");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let done = "";
  let usage: { input_tokens?: number; output_tokens?: number } | null = null;
  let model: string = AI_MODEL;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "response.output_text.done") done = ev.text ?? "";
        else if (ev.type === "response.completed") { usage = ev.response?.usage ?? null; model = ev.response?.model ?? model; }
        else if (ev.type === "error" || ev.type === "response.failed") throw new Error("The AI could not complete this request.");
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("The AI")) {
          await logAiUsage({ provider: "openai", operation: "Chat", model, status: 500, cost_usd: 0, error_message: "Response failed" }, meta);
          throw e;
        }
      }
    }
  }
  await logAiUsage({ provider: "openai", operation: "Chat", model, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null, status: 200 }, meta);
  const out = done || text;
  if (!out) throw new Error("The AI returned no answer.");
  return JSON.parse(out) as T;
}
