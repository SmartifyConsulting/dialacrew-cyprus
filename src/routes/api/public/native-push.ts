import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { classifyPushFailure, pushPayload, type PushJob } from "@/lib/push-payload";

const requestSchema = z.object({ id: z.string().uuid(), token: z.string().uuid() }).strict();
const jobSchema = z.object({ id: z.string().uuid(), alias: z.string().uuid(), notificationId: z.string().uuid(), productionId: z.string().nullable(), kind: z.enum(["gig_offer", "schedule_change", "booking_update"]) });

export const Route = createFileRoute("/api/public/native-push")({
  server: { handlers: { POST: async ({ request }) => {
    const input = requestSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return new Response("Invalid request", { status: 400 });
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const projectKey = process.env["LOVABLE_API_KEY"];
    const connectionKey = process.env["UDC_ONESIGNAL_API_KEY"];
    if (!url || !key || !projectKey || !connectionKey) return new Response("Push service unavailable", { status: 503 });
    const publicClient = createClient(url, key, {
      auth: { persistSession: false },
      global: { fetch: (resource, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(resource, { ...init, headers });
      } },
    });
    // Per-job unguessable capability, not the public publishable key, authorizes exactly one send.
    const { data, error } = await publicClient.rpc("claim_native_push", { p_id: input.data.id, p_token: input.data.token });
    if (error) return new Response("Could not claim alert", { status: 503 });
    if (!data) return new Response(null, { status: 204 });
    const parsed = jobSchema.safeParse(data);
    if (!parsed.success) return new Response("Invalid queued alert", { status: 500 });
    const job: PushJob = parsed.data;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Provider failures are stored without bodies that could expose subscription identifiers.
    try {
      const response = await fetch("https://connector-gateway.lovable.dev/udc_onesignal/notifications", {
        method: "POST",
        headers: { Authorization: `Bearer ${projectKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
        body: JSON.stringify(pushPayload(job)),
      });
      if (!response.ok) {
        const body = await response.text();
        // Provider response retained for diagnostics, but never log request credentials, alias or capability.
        console.error(`OneSignal failed [${response.status}]: ${body}`);
        const retry = classifyPushFailure(response.status) === "retry";
        await supabaseAdmin.from("native_push_outbox").update({ status: retry ? "pending" : "failed", error: `OneSignal HTTP ${response.status}` }).eq("id", job.id);
        return Response.json({ error: body, providerStatus: response.status }, { status: retry ? 503 : 502 });
      }
      const result = await response.json() as { id?: string; errors?: unknown };
      if (!result.id || result.errors) {
        await supabaseAdmin.from("native_push_outbox").update({ status: "failed", error: "No subscribed recipients or provider rejected message" }).eq("id", job.id);
        return Response.json({ error: result.errors ?? "No subscribed recipients" }, { status: 502 });
      }
      const saved = await supabaseAdmin.from("native_push_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", job.id);
      if (saved.error) return new Response("Could not record delivery", { status: 503 });
      return Response.json({ accepted: true }); // Provider acceptance is not device delivery or acknowledgement.
    } catch {
      await supabaseAdmin.from("native_push_outbox").update({ status: "pending", error: "Network failure" }).eq("id", job.id);
      return new Response("Push service unavailable", { status: 503 });
    }
  } } },
});