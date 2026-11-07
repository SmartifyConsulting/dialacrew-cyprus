import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Page } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { ProductionIntelligence } from "@/components/reports/ProductionIntelligence";
import { FinanceStatement } from "@/components/admin/FinanceStatement";
import { TokenLedger } from "@/components/admin/TokenLedger";
import { GigFeesSettings } from "@/components/admin/GigFeesSettings";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Book a Crew" },
      { name: "description", content: "Production costs, crew bookings, schedule readiness and cash flow in one connected view." },
      { property: "og:title", content: "Reports — Book a Crew" },
      { property: "og:description", content: "Connected production reporting and cash flow for producers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const TABS = ["Production Intelligence", "Cash Flow"] as const;

function ReportsPage() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const isAdmin = role.data === "admin";
  const [tab, setTab] = useState<(typeof TABS)[number]>("Production Intelligence");

  if (role.isLoading) return <Page open title="Reports"><p className="text-muted-foreground">Loading…</p></Page>;
  if (!isAdmin && role.data !== "producer") return <Page open title="Reports"><p className="text-muted-foreground">Reports are for producers only.</p></Page>;

  return (
    <Page open title="Reports" subtitle="What it costs, who's booked, what's ready and what needs you.">
      <nav className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </nav>
      {tab === "Production Intelligence" && <ProductionIntelligence />}
      {tab === "Cash Flow" && (
        <div className="space-y-5">
          <FinanceStatement includeAi={isAdmin} />
          {isAdmin && <details className="rounded-sm border border-border bg-card"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">AI usage — full Token Ledger</summary><TokenLedger /></details>}
          {isAdmin && <details className="rounded-sm border border-border bg-card"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Gig fee and penalty settings</summary><GigFeesSettings /></details>}
        </div>
      )}
    </Page>
  );
}
