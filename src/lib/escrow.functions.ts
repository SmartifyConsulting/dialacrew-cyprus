import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// One Escrow.com transaction per production; each crew booking is a line item inside it.
function escrowConfig() {
  const key = process.env["ESCROW_API_KEY"];
  const email = process.env["ESCROW_EMAIL"];
  if (!key || !email) throw new Error("Escrow isn't connected yet — add the Escrow.com email and API key.");
  const sandbox = (process.env["ESCROW_SANDBOX"] ?? "true") !== "false";
  const base = sandbox ? "https://api.escrow-sandbox.com/2017-09-01" : "https://api.escrow.com/2017-09-01";
  return { base, email, auth: `Basic ${btoa(`${email}:${key}`)}` };
}

async function escrowFetch(path: string, init: RequestInit) {
  const { base, auth } = escrowConfig();
  const res = await fetch(`${base}${path}`, { ...init, headers: { Authorization: auth, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const text = await res.text();
  if (!res.ok) { console.error("Escrow.com error", res.status, text); throw new Error(`Escrow.com rejected the request (${res.status}).`); }
  return text ? JSON.parse(text) : {};
}

async function assertManager(supabase: any, userId: string) {
  const [p, a] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "producer" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!p.data && !a.data) throw new Error("Only producers can manage escrow.");
}

const FUNDABLE = ["confirmed", "in_progress", "awaiting_review", "payment_required", "awaiting_release"];

export const fundProductionEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productionId: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const { data: prod } = await supabase.from("productions").select("id, name").eq("id", data.productionId).single();
    const { data: rows } = await supabase.from("bookings").select("id, role, crew_rate, days, status, crew_id").eq("production_id", data.productionId);
    const lines = (rows ?? []).filter((b) => b.crew_id && FUNDABLE.includes(b.status as string));
    if (!prod || lines.length === 0) throw new Error("No confirmed crew to fund yet.");
    const amount = lines.reduce((a, b) => a + Number(b.crew_rate) * b.days, 0);
    const { email } = escrowConfig();
    const tx = await escrowFetch("/transaction", {
      method: "POST",
      body: JSON.stringify({
        currency: "usd",
        description: `${prod.name} — crew pool`,
        parties: [
          { role: "buyer", customer: "me" },
          { role: "seller", customer: email },
        ],
        items: lines.map((b) => ({
          title: `${b.role} (${b.id})`, description: `${b.days} day(s)`, type: "general_merchandise",
          inspection_period: 259200, quantity: 1,
          schedule: [{ amount: Number(b.crew_rate) * b.days, payer_customer: "me", beneficiary_customer: email }],
        })),
      }),
    });
    await supabase.from("production_escrow").upsert({ production_id: prod.id, escrow_transaction_id: String(tx.id ?? ""), amount, status: "awaiting_funds", created_by: userId, updated_at: new Date().toISOString() });
    return { transactionId: String(tx.id ?? ""), amount };
  });

export const batchReleaseEscrow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ productionId: z.string().min(1), bookingIds: z.array(z.string()).min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertManager(supabase, userId);
    const { data: pool } = await supabase.from("production_escrow").select("*").eq("production_id", data.productionId).maybeSingle();
    if (!pool?.escrow_transaction_id) throw new Error("Fund the production escrow first.");
    const now = new Date().toISOString();
    for (const id of data.bookingIds) {
      await supabase.rpc("release_payment", { _booking: id }).then(() => undefined, () => undefined);
      await supabase.from("bookings").update({ escrow_released_at: now }).eq("id", id);
    }
    const { data: left } = await supabase.from("bookings").select("id").eq("production_id", data.productionId).not("crew_id", "is", null).is("escrow_released_at", null).neq("status", "cancelled");
    if ((left ?? []).length === 0) {
      await escrowFetch(`/transaction/${pool.escrow_transaction_id}`, { method: "PATCH", body: JSON.stringify({ action: "accept" }) });
      await supabase.from("production_escrow").update({ status: "released", updated_at: now }).eq("production_id", data.productionId);
    } else {
      await supabase.from("production_escrow").update({ status: "partially_released", updated_at: now }).eq("production_id", data.productionId);
    }
    return { released: data.bookingIds.length, remaining: (left ?? []).length };
  });
