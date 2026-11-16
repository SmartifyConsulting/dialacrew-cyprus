import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sendBrandedEmail } from "@/lib/email/resend.server";

const requestSchema = z.object({ id: z.string().uuid(), token: z.string().uuid() }).strict();
const jobSchema = z.object({ id: z.string().uuid(), notificationId: z.string().uuid(), email: z.string(), title: z.string(), body: z.string(), productionId: z.string().nullable(), kind: z.string() });

export const Route = createFileRoute("/api/public/notification-email")({
  server: { handlers: { POST: async ({ request }) => {
    const input = requestSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return new Response("Invalid request", { status: 400 });
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key || !process.env["RESEND_API_KEY"]) return new Response("Email service unavailable", { status: 503 });
    const client = createClient(url, key, { auth: { persistSession: false }, global: { fetch: (r, init) => {
      const h = new Headers(init?.headers);
      if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
      h.set("apikey", key);
      return fetch(r, { ...init, headers: h });
    } } });
    // The per-job unguessable token authorizes exactly one send.
    const { data, error } = await client.rpc("claim_notification_email", { p_id: input.data.id, p_token: input.data.token });
    if (error) return new Response("Could not claim email", { status: 503 });
    if (!data) return new Response(null, { status: 204 });
    const job = jobSchema.safeParse(data);
    if (!job.success) return new Response("Invalid job", { status: 500 });
    const j = job.data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const link = j.productionId ? `https://bookacrew.film/productions/${j.productionId}` : "https://bookacrew.film/dashboard";
    try {
      await sendBrandedEmail({ to: j.email, eventId: `notification/${j.notificationId}`, content: {
        subject: j.title, heading: j.title, paragraphs: j.body ? [j.body] : [], action: { label: "Open Book a Crew", url: link },
      } });
      await supabaseAdmin.from("notification_email_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", j.id);
      return Response.json({ accepted: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Send failed";
      console.error(`Notification email failed: ${msg}`);
      await supabaseAdmin.from("notification_email_outbox").update({ status: "pending", error: msg }).eq("id", j.id);
      return Response.json({ error: msg }, { status: 502 });
    }
  } } },
});
