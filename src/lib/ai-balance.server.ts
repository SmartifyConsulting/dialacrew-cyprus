import { supabaseAdmin } from "@/integrations/supabase/client.server";
export type StoryboardAction = "breakdown" | "references" | "image" | "pdf";
export async function storyboardPrices() {
  const { data, error } = await supabaseAdmin.from("platform_settings").select("value").eq("key", "storyboard_ai_prices_usd").single();
  if (error || !data) throw new Error("AI pricing is not configured");
  const prices = data.value as Record<StoryboardAction, number>;
  for (const action of ["breakdown", "references", "image", "pdf"] as const) if (!(Number(prices[action]) > 0)) throw new Error("AI pricing is not configured");
  return prices;
}
export async function billStoryboardAction<T>(userId: string, action: StoryboardAction, work: () => Promise<T>) {
  const prices = await storyboardPrices();
  const amount = Math.ceil(Number(prices[action]) * 1_000_000);
  const operation = crypto.randomUUID();
  const { error } = await supabaseAdmin.rpc("change_ai_balance", { p_user: userId, p_operation: operation, p_kind: "charge", p_amount: amount, p_activity: action });
  if (error) throw new Error(error.message);
  try { return await work(); }
  catch (error) {
    const refund = await supabaseAdmin.rpc("change_ai_balance", { p_user: userId, p_operation: operation, p_kind: "refund", p_amount: amount, p_activity: action });
    if (refund.error) console.error("AI balance refund requires reconciliation", { operation });
    throw error;
  }
}
