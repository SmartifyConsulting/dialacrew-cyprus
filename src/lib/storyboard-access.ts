import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function assertProducerSiteMember(context: { supabase: unknown; userId: string }, productionId: string) {
  const db = (context.supabase as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> });
  // Enforce caller-session visibility before service-role writes or paid generation.
  const { data: visibleProduction, error: visibilityError } = await (context.supabase as SupabaseClient<Database>).from("productions").select("id").eq("id", productionId).maybeSingle();
  if (visibilityError || !visibleProduction) throw new Error("Production is not accessible to this account");
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
  const [role, member, admin] = await Promise.all([
    rpc("has_role", { _user_id: context.userId, _role: "producer" }),
    rpc("is_site_member", { _prod: productionId }),
    rpc("has_role", { _user_id: context.userId, _role: "admin" }),
  ]);
  if (role.error || member.error || admin.error) throw new Error("Could not verify access to this production");
  if (!role.data && !admin.data) throw new Error("Only producers can use Storyboard Studio");
  if (!member.data && !admin.data) throw new Error("Not a member of this production");
}

