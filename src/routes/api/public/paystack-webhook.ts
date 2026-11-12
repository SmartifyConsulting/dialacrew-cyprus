import { createFileRoute } from "@tanstack/react-router";

// Paystack signs the raw request body with HMAC-SHA512 using the secret key; we must verify over
// the exact raw bytes (not a re-stringified/re-parsed copy) before trusting anything in it. Uses
// Web Crypto (not node:crypto) so this works the same whether this route runs on Node or an edge
// runtime. This is the async confirmation path — the redirect-verify flow in
// storyboard-credits.functions.ts already allocates credits for most purchases; this webhook is
// the safety net for a browser that never returns (closed tab, crashed, etc). Both paths call the
// same idempotent allocate_storyboard_audio_credits RPC, so whichever arrives first wins.
async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === signature;
}

export const Route = createFileRoute("/api/public/paystack-webhook")({
  server: { handlers: { POST: async ({ request }) => {
    const secret = process.env["PAYSTACK_SECRET_KEY"];
    if (!secret) return new Response("Not configured", { status: 503 });

    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature");
    if (!(await verifySignature(rawBody, signature, secret))) {
      console.error("Paystack webhook: invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    let event: { event?: string; data?: { reference?: string } };
    try { event = JSON.parse(rawBody); } catch { return new Response("Invalid body", { status: 400 }); }
    if (event.event !== "charge.success" || !event.data?.reference) return new Response(null, { status: 200 });

    const reference = event.data.reference;
    try {
      if (reference.startsWith("aib_")) {
        const { settleAiTopup } = await import("@/lib/ai-balance.functions");
        await settleAiTopup(reference);
        return new Response(null, { status: 200 });
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: purchase } = await supabaseAdmin.from("storyboard_audio_purchases").select("*").eq("paystack_reference", reference).maybeSingle();
      if (!purchase) return new Response(null, { status: 200 }); // not a Storyboard Audio Credits purchase
      if (purchase.status === "paid") return new Response(null, { status: 200 }); // already allocated

      // Independently re-verify with Paystack's own API rather than trusting the webhook body alone.
      const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const verifyJson = (await verifyRes.json().catch(() => ({}))) as { status?: boolean; data?: { status?: string; amount?: number; currency?: string } };
      const tx = verifyJson.data;
      if (!verifyRes.ok || !verifyJson.status || tx?.status !== "success") return new Response(null, { status: 200 });
      if (tx.currency !== purchase.currency || Number(tx.amount) !== purchase.amount_cents) {
        console.error("Paystack webhook: amount/currency mismatch", reference);
        return new Response(null, { status: 200 });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.rpc as any)("allocate_storyboard_audio_credits", { _purchase_id: purchase.id });
      return new Response(null, { status: 200 });
    } catch (e) {
      console.error("Paystack webhook processing error", e instanceof Error ? e.message : e);
      return new Response("Retry payment verification", { status: 500 });
    }
  } } },
});
