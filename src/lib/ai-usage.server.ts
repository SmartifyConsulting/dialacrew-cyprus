// Server-only. Records each paid AI call in ai_usage_events for the Admin > Finance Token Ledger.
// Best-effort: logging never fails the AI call itself.
import { estimateChatCostUsd } from "./ai-usage";

export type UsageMeta = { activity?: string; userId?: string | null; productionId?: string | null };

const names = new Map<string, string | null>();

export async function logAiUsage(row: {
  provider: string; operation: string; model: string | null; input_tokens?: number | null; output_tokens?: number | null;
  cost_usd?: number | null; status: number; error_message?: string | null;
}, meta?: UsageMeta) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = meta?.userId ?? null;
    let userName: string | null = null;
    if (userId) {
      if (names.has(userId)) userName = names.get(userId) ?? null;
      else {
        const { data } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", userId).maybeSingle();
        userName = (data?.full_name as string | null)?.trim() || (data?.email as string | null) || null;
        names.set(userId, userName);
      }
    }
    const input = row.input_tokens ?? null;
    const output = row.output_tokens ?? null;
    await supabaseAdmin.from("ai_usage_events").insert({
      provider: row.provider,
      operation: meta?.activity ?? row.operation,
      model: row.model,
      input_tokens: input,
      output_tokens: output,
      total_tokens: input != null || output != null ? (input ?? 0) + (output ?? 0) : null,
      cost_usd: row.cost_usd ?? estimateChatCostUsd(row.model, input, output),
      status: row.status,
      error_message: row.error_message ? row.error_message.slice(0, 400) : null,
      user_id: userId,
      user_name: userName,
      production_id: meta?.productionId ?? null,
    });
  } catch (e) {
    console.warn("[ai-usage] could not record usage", e);
  }
}
