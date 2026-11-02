import { mobileConfig } from "@/lib/mobile-config";

export type PushJob = { id: string; alias: string; notificationId: string; productionId: string | null; kind: string };
export function pushPayload(job: PushJob) {
  const headings: Record<string, string> = { gig_offer: "New gig offer", schedule_change: "Schedule changed", booking_update: "Booking updated" };
  // Lock-screen content deliberately excludes rates, names, addresses and job descriptions.
  return {
    app_id: mobileConfig.oneSignalAppId,
    include_aliases: { external_id: [job.alias] },
    target_channel: "push",
    headings: { en: headings[job.kind] ?? "Book a Crew update" },
    contents: { en: "Open Book a Crew to view your update." },
    data: { path: job.productionId ? `/productions/${encodeURIComponent(job.productionId)}` : "/gigs", notification_id: job.notificationId },
    idempotency_key: job.id,
  };
}

export function classifyPushFailure(status: number): "retry" | "failed" {
  return status === 429 || status >= 500 ? "retry" : "failed";
}