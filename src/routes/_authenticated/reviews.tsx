import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Page, Panel } from "@/components/AppShell";
import { useMyCrewId, useOnTimePct, useReviews } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/reviews")({
  head: () => ({
    meta: [
      { title: "My Reviews — Book a Crew" },
      { name: "description", content: "Your ratings and comments from producers and co-workers." },
      { property: "og:title", content: "My Reviews — Book a Crew" },
      { property: "og:description", content: "Ratings and feedback from every job." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  const crewId = useMyCrewId(true).data ?? undefined;
  const reviews = useReviews(crewId).data ?? [];
  const onTime = useOnTimePct(crewId).data;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  return (
    <Page open title="Reviews" subtitle="What people said about working with you">
      <div className="mb-5 grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-border bg-border">
        {[[avg ? avg.toFixed(1) : "—", "Average rating"], [String(reviews.length), "Reviews"], [onTime != null ? `${onTime}%` : "—", "On-time"]].map(([v, l]) => (
          <div key={l} className="bg-card p-3"><div className="font-display text-2xl font-bold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
        ))}
      </div>
      <Panel title="All reviews">
        <ul className="divide-y divide-border">
          {reviews.length === 0 && <li className="p-4 text-sm text-muted-foreground">No reviews yet. People on your jobs can rate you from the Members list.</li>}
          {reviews.map((r) => (
            <li key={r.id} className="p-4">
              <div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}<span className="ml-2 text-xs text-muted-foreground">{r.reviewer_name} · {new Date(r.created_at).toLocaleDateString("en-ZA")}</span></div>
              {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}
