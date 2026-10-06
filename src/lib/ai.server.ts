// Server-only helper: streamed, schema-constrained JSON from the AI Gateway (Responses API).
const URL_ = "https://ai.gateway.lovable.dev/v1/responses";
export const AI_MODEL = "openai/gpt-6-astra";

export async function aiJson<T>(opts: { name: string; schema: Record<string, unknown>; instructions: string; input: string }): Promise<T> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured.");
  const res = await fetch(URL_, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: AI_MODEL,
      instructions: opts.instructions,
      input: opts.input,
      reasoning: { effort: "low" },
      store: false,
      stream: true,
      text: { format: { type: "json_schema", name: opts.name, strict: true, schema: opts.schema } },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    console.error("AI gateway error", res.status, t);
    if (res.status === 402) throw new Error("AI credits have run out — top up in Settings → Plans & credits.");
    if (res.status === 429) throw new Error("Too many AI requests — try again in a minute.");
    if (res.status === 403) throw new Error("AI access is blocked for this workspace.");
    throw new Error("The AI could not complete this request.");
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let done = "";
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
        else if (ev.type === "error" || ev.type === "response.failed") throw new Error("The AI could not complete this request.");
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("The AI")) throw e;
      }
    }
  }
  const out = done || text;
  if (!out) throw new Error("The AI returned no answer.");
  return JSON.parse(out) as T;
}
