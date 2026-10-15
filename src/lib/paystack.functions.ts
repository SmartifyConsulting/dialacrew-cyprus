import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Paystack: crew pay the securing fee once; the reusable card token is saved for automatic penalties.
async function paystack(path: string, init: RequestInit = {}) {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Card payments aren't connected yet — add the Paystack secret key.");
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const json = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: any };
  if (!res.ok || !json.status) {
    console.error("Paystack error", res.status, json.message);
    throw new Error(json.message || `Paystack rejected the request (${res.status}).`);
  }
  return json.data;
}

export const startGigCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ gigId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: gig, error } = await context.supabase.from("community_gigs").select("id, status, secure_fee, posted_by, expires_at").eq("id", data.gigId).maybeSingle();
    if (error || !gig) throw new Error("Gig not found");
    if (gig.status !== "open" || new Date(gig.expires_at) <= new Date()) throw new Error("This gig is no longer available");
    if (gig.posted_by === context.userId) throw new Error("You cannot secure your own gig");
    const email = (context.claims as { email?: string }).email;
    if (!email) throw new Error("Your account needs an email address");
    const origin = getRequestHeader("origin") || "";
    const tx = await paystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email,
        amount: Math.round(Number(gig.secure_fee) * 100),
        currency: "ZAR",
        callback_url: origin ? `${origin}/gigs` : undefined,
        metadata: { gig_id: gig.id, user_id: context.userId, purpose: "gig_secure" },
      }),
    });
    return { url: tx.authorization_url as string };
  });

export const verifyGigCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reference: z.string().min(4).max(100).regex(/^[\w.-]+$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const tx = await paystack(`/transaction/verify/${encodeURIComponent(data.reference)}`);
    const meta = tx.metadata ?? {};
    if (tx.status !== "success") throw new Error("The payment was not completed.");
    if (meta.user_id !== context.userId || meta.purpose !== "gig_secure") throw new Error("This payment doesn't belong to you.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gig } = await supabaseAdmin.from("community_gigs").select("secure_fee, secured_by").eq("id", meta.gig_id).maybeSingle();
    if (!gig) throw new Error("Gig not found");
    if (Number(tx.amount) < Math.round(Number(gig.secure_fee) * 100)) throw new Error("The amount paid is too low.");
    const auth = tx.authorization ?? {};
    if (auth.reusable && auth.authorization_code) {
      await supabaseAdmin.from("payment_cards").upsert({
        user_id: context.userId, authorization_code: auth.authorization_code, email: tx.customer?.email ?? "",
        last4: auth.last4 ?? null, card_type: auth.card_type ?? null, bank: auth.bank ?? null, updated_at: new Date().toISOString(),
      });
    }
    if (gig.secured_by === context.userId) return { ok: true, already: true };
    const { error } = await supabaseAdmin.rpc("secure_gig_paid", { _gig: meta.gig_id, _user: context.userId });
    if (error) throw new Error(`${error.message}. Contact support for a refund of your fee.`);
    return { ok: true, already: false };
  });

// Charge pending penalties on a gig to the saved card. Callable by the penalised crew member or the gig poster.
export const chargeGigPenalties = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ gigId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gig } = await supabaseAdmin.from("community_gigs").select("posted_by").eq("id", data.gigId).maybeSingle();
    if (!gig) throw new Error("Gig not found");
    const { data: pens } = await supabaseAdmin.from("gig_penalties").select("*").eq("gig_id", data.gigId).eq("status", "pending");
    let charged = 0, failed = 0;
    for (const p of pens ?? []) {
      if (p.user_id !== context.userId && gig.posted_by !== context.userId) continue;
      const { data: card } = await supabaseAdmin.from("payment_cards").select("authorization_code, email").eq("user_id", p.user_id).maybeSingle();
      if (!card) { await supabaseAdmin.from("gig_penalties").update({ status: "failed", failure: "No saved card" }).eq("id", p.id); failed++; continue; }
      try {
        const tx = await paystack("/transaction/charge_authorization", {
          method: "POST",
          body: JSON.stringify({ email: card.email, amount: Math.round(Number(p.amount) * 100), currency: "ZAR", authorization_code: card.authorization_code, metadata: { penalty_id: p.id } }),
        });
        const ok = tx.status === "success";
        await supabaseAdmin.from("gig_penalties").update({ status: ok ? "charged" : "failed", reference: tx.reference, charged_at: ok ? new Date().toISOString() : null, failure: ok ? null : tx.gateway_response }).eq("id", p.id);
        ok ? charged++ : failed++;
      } catch (e) {
        await supabaseAdmin.from("gig_penalties").update({ status: "failed", failure: (e as Error).message }).eq("id", p.id);
        failed++;
      }
    }
    return { charged, failed };
  });
