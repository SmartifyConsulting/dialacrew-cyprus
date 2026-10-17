import { useRole, useSession } from "@/lib/auth";
import { useAiLearningPhase } from "@/lib/site";

/** Whether the AI crew and kit suggestions should show for the signed-in user: admins always, producers once
 *  AI_MIN_REVIEWS reviews have been saved to AI memory. */
export function useAiUnlocked() {
  const { session } = useSession();
  const userId = session?.user.id;
  const role = useRole(userId).data;
  const phase = useAiLearningPhase(role === "producer" ? userId : undefined);
  return role === "admin" || (role === "producer" && phase.isReady && !phase.learning);
}
