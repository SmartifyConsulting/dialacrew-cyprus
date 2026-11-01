import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertProducer(db: SupabaseClient, userId: string) {
  const [p, a] = await Promise.all([
    db.rpc("has_role", { _user_id: userId, _role: "producer" }),
    db.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (!p.data && !a.data) throw new Error("Only producers can invite crew.");
}

// Sends a real invite email (via Supabase Auth's own email sending) to each newly-imported crew
// member with an address. Accepting the invite claims the crew_members row the CSV created —
// see handle_new_user's crew_id branch.
export const inviteCrewMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ crew: z.array(z.object({ crewId: z.string().min(1).max(100), email: z.string().email(), name: z.string().max(200) })).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await assertProducer(db, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let invited = 0;
    const errors: string[] = [];
    for (const c of data.crew) {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(c.email, {
        data: { role: "crew", crew_id: c.crewId, full_name: c.name },
      });
      if (error) errors.push(`${c.email}: ${error.message}`);
      else invited++;
    }
    return { invited, errors };
  });
