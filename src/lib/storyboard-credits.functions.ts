import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Same Paystack helper shape as paystack.functions.ts (kept separate so this file's purpose —
// Storyboard Audio Credits only — stays obvious; it never touches any other wallet or fee).
async function paystack(path: string, init: RequestInit = {}) {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Card payments aren't connected yet.");
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: any };
  if (!res.ok || !json.status) {
    console.error("Paystack error", res.status, json.message);
    throw new Error(json.message || `Paystack rejected the request (${res.status}).`);
  }
  return json.data;
}

async function assertProducerSiteMember(context: { supabase: unknown; userId: string }, productionId: string) {
  const db = (context.supabase as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> });
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const [role, member] = await Promise.all([
    rpc("has_role", { _user_id: context.userId, _role: "producer" }),
    rpc("is_site_member", { _prod: productionId }),
  ]);
  if (role.error || member.error) throw new Error("Could not verify access to this production");
  if (!role.data) throw new Error("Only producers can manage Storyboard Audio Credits");
  if (!member.data) throw new Error("Not a member of this production");
}

// Step 1-3 of the purchase flow: create a pending purchase row with a unique reference, then ask
// Paystack to initialise the transaction. Nothing is credited here — only the redirect-verify and
// webhook paths (both idempotent via allocate_storyboard_audio_credits) ever allocate credits.
export const startAudioCreditsCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productionId: z.string().min(1), packageKey: z.enum(["starter", "creator", "studio"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProducerSiteMember(context, data.productionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pkg, error: pkgError } = await supabaseAdmin.from("storyboard_audio_packages").select("*").eq("key", data.packageKey).eq("active", true).single();
    if (pkgError || !pkg) throw new Error("That package is not available.");
    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("Your account needs an email address");

    const reference = `sac_${data.productionId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { data: purchase, error } = await supabaseAdmin.from("storyboard_audio_purchases").insert({
      production_id: data.productionId, package_key: pkg.key, credits: pkg.credits, amount_cents: pkg.price_cents, currency: pkg.currency,
      paystack_reference: reference, status: "pending", created_by: context.userId,
    }).select("id").single();
    if (error || !purchase) throw new Error("Could not start the purchase.");

    const origin = getRequestHeader("origin") || process.env["PAYSTACK_CALLBACK_URL"] || "";
    const tx = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email, amount: pkg.price_cents, currency: pkg.currency,
        reference,
        callback_url: origin ? `${origin}/productions/${data.productionId}?tab=Storyboard&audio_ref=${reference}` : undefined,
        metadata: { purchase_id: purchase.id, production_id: data.productionId, user_id: context.userId, purpose: "storyboard_audio_credits" },
      }),
    });
    return { url: tx.authorization_url as string, reference };
  });

// Step 6-9: verify the transaction directly with Paystack's own API (never trust the browser
// return alone), confirm status/amount/currency match what we initialised, then allocate credits
// through the idempotent RPC. Safe to call more than once for the same reference.
export const verifyAudioCreditsCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reference: z.string().min(4).max(120).regex(/^[\w.-]+$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: purchase } = await supabaseAdmin.from("storyboard_audio_purchases").select("*").eq("paystack_reference", data.reference).maybeSingle();
    if (!purchase) throw new Error("We couldn't find that payment.");
    if (purchase.created_by !== context.userId) throw new Error("This payment doesn't belong to you.");

    if (purchase.status !== "paid") {
      const tx = await paystack(`/transaction/verify/${encodeURIComponent(data.reference)}`);
      if (tx.status !== "success") {
        await supabaseAdmin.from("storyboard_audio_purchases").update({ status: "failed" }).eq("id", purchase.id).eq("status", "pending");
        throw new Error("The payment was not completed.");
      }
      if (tx.currency !== purchase.currency || Number(tx.amount) !== purchase.amount_cents) {
        throw new Error("The payment amount or currency didn't match — contact support.");
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await (supabaseAdmin.rpc as any)("allocate_storyboard_audio_credits", { _purchase_id: purchase.id })).data?.[0];
      return { credited: !!result?.allocated, credits: purchase.credits, productionId: purchase.production_id };
    }
    return { credited: false, credits: purchase.credits, productionId: purchase.production_id, already: true };
  });
