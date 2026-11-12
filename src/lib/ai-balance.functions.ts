import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { storyboardPrices } from "./ai-balance.server";

let fx: { expires: number; rates: Record<string, number> } | undefined;
export async function usdRates() {
  if (fx && fx.expires > Date.now()) return fx.rates;
  const response = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(10000) });
  const result = await response.json() as { result: string; rates: Record<string, number> };
  if (!response.ok || result.result !== "success" || !(result.rates['ZAR']! > 0)) throw new Error("Exchange rates are temporarily unavailable. Please try again.");
  fx = { expires: Date.now() + 3600000, rates: result.rates };
  return fx.rates;
}
const currencyInput = z.string().regex(/^[A-Z]{3}$/);
export const getAiBalance = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ currency: currencyInput }).parse(input))
  .handler(async ({ data, context }) => {
    const [rates, prices, balance] = await Promise.all([usdRates(), storyboardPrices(), supabaseAdmin.from("ai_balances").select("balance_micros").eq("user_id", context.userId).maybeSingle()]);
    if (balance.error) throw new Error("Could not load AI balance");
    if (!(rates[data.currency]! > 0)) throw new Error("That currency is unavailable");
    return { usd: Number(balance.data?.balance_micros ?? 0) / 1_000_000, minimumUsd: Math.ceil(200 / rates['ZAR']! * 100) / 100, localPerUsd: rates[data.currency]!, currency: data.currency, prices, paymentsConnected: !!process.env["PAYSTACK_SECRET_KEY"] };
  });

async function paystack(path: string, body?: unknown) {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("AI balance payments are not connected");
  const response = await fetch(`https://api.paystack.co${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json() as { status: boolean; data?: { authorization_url?: string; status?: string; amount?: number; currency?: string; reference?: string } };
  if (!response.ok || !result.status || !result.data) throw new Error("Payment provider could not process this currency or request. Please contact support.");
  return result.data;
}
export const startAiTopup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ productionId: z.string().min(1), currency: currencyInput, usd: z.number().finite().positive().max(10000) }).parse(input))
  .handler(async ({ data, context }) => {
    const rates = await usdRates();
    const rate = rates[data.currency];
    if (!rate || data.usd < Math.ceil(200 / rates['ZAR']! * 100) / 100) throw new Error("Top up at least the equivalent of R200");
    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("Your account needs an email address");
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: data.currency }).resolvedOptions().maximumFractionDigits ?? 2;
    const usdMicros = Math.round(data.usd * 1_000_000);
    const amount = Math.ceil(usdMicros / 1_000_000 * rate * 10 ** digits);
    const reference = `aib_${crypto.randomUUID()}`;
    const { error } = await supabaseAdmin.from("ai_balance_purchases").insert({ reference, user_id: context.userId, amount_minor: amount, currency: data.currency, usd_micros: usdMicros, fx_rate: rate });
    if (error) throw new Error("Could not start AI top-up");
    const origin = process.env["APP_URL"] || getRequestHeader("origin");
    if (!origin || !/^https?:\/\//.test(origin)) throw new Error("Payment return URL is not configured");
    const callback = `${origin}/productions/${encodeURIComponent(data.productionId)}?tab=Storyboard&ai_topup=${reference}`;
    const tx = await paystack("/transaction/initialize", { email, amount, currency: data.currency, reference, callback_url: callback, metadata: { purpose: "ai_balance", user_id: context.userId } });
    if (!tx.authorization_url || new URL(tx.authorization_url).hostname !== "checkout.paystack.com") throw new Error("Invalid checkout destination");
    return { url: tx.authorization_url, reference, amount, currency: data.currency };
  });

export async function settleAiTopup(reference: string, userId?: string) {
  const { data: purchase, error } = await supabaseAdmin.from("ai_balance_purchases").select("*").eq("reference", reference).maybeSingle();
  if (error) throw new Error("Could not load AI payment");
  if (!purchase) return false;
  if (userId && purchase.user_id !== userId) throw new Error("This payment does not belong to you");
  if (purchase.status === "paid") return true;
  const tx = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (tx.status !== "success" || tx.currency !== purchase.currency || Number(tx.amount) !== purchase.amount_minor || tx.reference !== reference) throw new Error("Payment is not confirmed or its amount does not match");
  const allocation = await supabaseAdmin.rpc("credit_ai_purchase", { p_reference: reference });
  if (allocation.error) throw new Error("Payment received; balance update needs retry. Please verify again.");
  return true;
}
export const verifyAiTopup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ reference: z.string().regex(/^aib_[\w-]+$/).max(100) }).parse(input))
  .handler(async ({ data, context }) => ({ paid: await settleAiTopup(data.reference, context.userId) }));
