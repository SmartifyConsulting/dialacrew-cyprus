import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";

/** A producer's first productions give the AI no feedback to learn from, so its suggestions stay hidden until after this many. */
export const AI_MIN_PRODUCTIONS = 5;

/** Whether the AI crew and kit suggestions should show for the signed-in user. Admins always see them. */
export function useAiUnlocked() {
  const { session } = useSession();
  const userId = session?.user.id;
  const role = useRole(userId).data;
  const count = useQuery({
    queryKey: ["my-production-count", userId],
    enabled: !!userId && role === "producer",
    queryFn: async () => {
      const { count: n, error } = await supabase.from("productions").select("id", { count: "exact", head: true }).eq("created_by", userId!);
      if (error) throw error;
      return n ?? 0;
    },
  });
  return role === "admin" || (role === "producer" && (count.data ?? 0) > AI_MIN_PRODUCTIONS);
}
