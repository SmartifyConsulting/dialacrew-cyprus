import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const retryNativePush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [producer, admin] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "producer" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
    if (producer.error || admin.error || (!producer.data && !admin.data)) throw new Error("Only producers and admins can retry job alerts");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error: readError } = await supabaseAdmin.from("native_push_outbox").select("id,dispatch_token").eq("status", "pending").lt("attempts", 4).order("created_at").limit(20);
    if (readError) throw readError;
    const results = await Promise.all((data ?? []).map(async (job) => {
      const response = await fetch("https://bookacrew.film/api/public/native-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: job.id, token: job.dispatch_token }) });
      return response.ok;
    }));
    return { processed: results.filter(Boolean).length, attempted: results.length };
  });