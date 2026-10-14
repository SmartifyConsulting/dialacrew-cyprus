import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Page, Panel } from "@/components/AppShell";
import { useApproveJob, useBookings, useCrew, useProductions, useReleasePayment } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Book a Crew" },
      { name: "description", content: "Track crew payments from booking to release." },
      { property: "og:title", content: "Payments — Book a Crew" },
      { property: "og:description", content: "Crew disbursement tracker and payment totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

const rand = (n: number) => `R ${Math.round(n).toLocaleString("en-ZA")}`;
const STAGE: Record<string, string> = {
  confirmed: "Booked", accepted: "Booked", in_progress: "On set", awaiting_review: "Awaiting approval",
  payment_required: "Payment due", awaiting_release: "Ready to release", release_authorised: "Paid",
};

function PaymentsPage() {
  const bookings = useBookings().data ?? [];
  const crew = useCrew().data ?? [];
  const prods = useProductions().data ?? [];
  const approve = useApproveJob();
  const release = useReleasePayment();
  const rows = bookings.filter((b) => STAGE[b.status]);
  const total = (b: (typeof rows)[number]) => b.crewRate * b.days;
  const sum = (f: (s: string) => boolean) => rows.filter((b) => f(b.status)).reduce((a, b) => a + total(b), 0);
  const tiles = [
    { label: "Total committed", value: sum(() => true) },
    { label: "Awaiting approval", value: sum((s) => s === "awaiting_review" || s === "payment_required") },
    { label: "Ready to release", value: sum((s) => s === "awaiting_release") },
    { label: "Paid out", value: sum((s) => s === "release_authorised") },
  ];

  return (
    <Page title="Payments" subtitle="Every crew payment, from booking to money released.">
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{rand(t.value)}</p>
          </div>
        ))}
      </div>
      <Panel title="Crew payments">
        {rows.length === 0 ? <p className="text-muted-foreground">No payments yet.</p> : (
          <div className="divide-y divide-border">
            {rows.map((b) => {
              const c = crew.find((x) => x.id === b.crewId);
              const p = prods.find((x) => x.id === b.productionId);
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-48 flex-1">
                    <p className="font-semibold text-foreground">{c?.name ?? "Crew"}</p>
                    <p className="text-sm text-muted-foreground">{b.role} · {p?.name ?? "Project"} · {b.days} day{b.days === 1 ? "" : "s"}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{STAGE[b.status]}</span>
                  <span className="w-28 text-right font-semibold text-foreground">{rand(total(b))}</span>
                  {b.status === "awaiting_review" && (
                    <button className="rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" onClick={() => approve.mutate(b.id, { onSuccess: () => toast.success("Job approved"), onError: (e) => toast.error(e.message) })}>Approve</button>
                  )}
                  {(b.status as string) === "awaiting_release" && (
                    <button className="rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" onClick={() => release.mutate(b.id, { onSuccess: () => toast.success("Payment released"), onError: (e) => toast.error(e.message) })}>Release payment</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </Page>
  );
}
