import { createFileRoute } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Page, Panel } from "@/components/AppShell";
import { useMyCrewId, useOnTimePct, useReviews } from "@/lib/site";
import { useProductions } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/reviews")({
  head: () => ({
    meta: [
      { title: "My Reviews — Book a Crew" },
      { name: "description", content: "Your ratings from every production set." },
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
  const productions = useProductions().data ?? [];
  const onTime = useOnTimePct(crewId).data;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const prodName = (id: string | null) => (id ? productions.find((p) => p.id === id)?.name ?? "Production" : "Production");
  return (
    <Page open title="Reviews" subtitle="Feedback on production sets">
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
              {/* Crew see their star rating, which production it's for, and a date/time stamp — never the comment or who left it. */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}
                <span className="ml-2 text-sm font-medium">{prodName(r.production_id)}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</div>
            </li>
          ))}
        </ul>
      </Panel>
    </Page>
  );
}
