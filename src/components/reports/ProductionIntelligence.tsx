import { SearchableSelect } from "@/components/ui/searchable-select";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Coins, Gauge, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBookings, useCrew, useProductions } from "@/lib/db";
import { buildReport, BOOKED, PENCIL, type DisputeLite, type InvoiceLite } from "@/lib/reporting";
import { fmtMoney } from "@/lib/demo-data";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d?: string | null) => { if (!d) return "—"; const [y, m, day] = d.slice(0, 10).split("-"); return `${day} ${MONTHS[Number(m) - 1]} ${y}`; };

function useInvoices() {
  return useQuery({ queryKey: ["report-invoices"], queryFn: async () => {
    const { data, error } = await supabase.from("invoices").select("production_id,booking_id,status,total");
    if (error) throw error; return (data ?? []) as InvoiceLite[];
  } });
}
function useDisputes() {
  return useQuery({ queryKey: ["report-disputes"], queryFn: async () => {
    const { data, error } = await supabase.from("disputes").select("booking_id,status,amount_disputed");
    if (error) throw error; return (data ?? []) as DisputeLite[];
  } });
}

const QUESTIONS = [
  { key: "cost", label: "Costing", icon: Coins },
  { key: "crew", label: "Crew booked", icon: Users },
  { key: "schedule", label: "Schedule", icon: CalendarClock },
  { key: "attention", label: "Needs attention", icon: AlertTriangle },
  { key: "performance", label: "Performance", icon: Gauge },
] as const;
type Q = (typeof QUESTIONS)[number]["key"];

export function ProductionIntelligence() {
  const productions = useProductions();
  const bookings = useBookings();
  const crew = useCrew();
  const invoices = useInvoices();
  const disputes = useDisputes();
  const [scope, setScope] = useState<string>("all");
  const [q, setQ] = useState<Q>("cost");

  const reports = useMemo(() => (productions.data ?? []).filter((p) => p.status !== "Draft")
    .map((p) => buildReport(p, bookings.data ?? [], invoices.data ?? [], disputes.data ?? [])),
  [productions.data, bookings.data, invoices.data, disputes.data]);
  const shown = scope === "all" ? reports : reports.filter((r) => r.production.id === scope);
  const crewName = (id: string | null) => crew.data?.find((c) => c.id === id)?.name ?? "Unassigned";

  const tot = shown.reduce((a, r) => ({ budget: a.budget + r.budget, committed: a.committed + r.committed, paid: a.paid + r.paid, booked: a.booked + r.booked, pencilled: a.pencilled + r.pencilled, unfilled: a.unfilled + r.unfilled, attention: a.attention + r.attention.length }), { budget: 0, committed: 0, paid: 0, booked: 0, pencilled: 0, unfilled: 0, attention: 0 });
  const health = shown.length ? Math.round(shown.reduce((s, r) => s + r.health, 0) / shown.length) : 0;
  const money = (n: number) => fmtMoney(Math.round(n), shown[0]?.production.currency ?? "ZAR");

  if (productions.isLoading || bookings.isLoading) return <p className="text-sm text-muted-foreground">Loading reports…</p>;

  const kpis = [
    { label: "Budget", value: money(tot.budget) },
    { label: "Committed", value: money(tot.committed) },
    { label: "Paid", value: money(tot.paid) },
    { label: "Crew booked", value: `${tot.booked}` , sub: `${tot.pencilled} pencilled · ${tot.unfilled} unfilled` },
    { label: "Needs attention", value: `${tot.attention}` },
    { label: "Health", value: `${health}%` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-muted-foreground">Production</label>
        <SearchableSelect value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-sm border border-input bg-background px-3 py-1.5 text-sm">
          <option value="all">All productions ({reports.length})</option>
          {reports.map((r) => <option key={r.production.id} value={r.production.id}>{r.production.jobId ? `${r.production.jobId} · ` : ""}{r.production.name}</option>)}
        </SearchableSelect>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-sm border border-border bg-card p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-1 whitespace-nowrap font-display text-xl font-semibold">{k.value}</div>
            {k.sub && <div className="text-[11px] text-muted-foreground">{k.sub}</div>}
          </div>
        ))}
      </div>

      <nav className="flex gap-1 overflow-x-auto">
        {QUESTIONS.map((x) => (
          <button key={x.key} onClick={() => setQ(x.key)} className={`flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold ${q === x.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
            <x.icon className="h-3.5 w-3.5" aria-hidden /> {x.label}
          </button>
        ))}
      </nav>

      <div className="space-y-3">
        {shown.length === 0 && <p className="rounded-sm border border-border bg-card p-6 text-center text-sm text-muted-foreground">No productions to report on yet.</p>}
        {shown.map((r) => {
          const rows = (bookings.data ?? []).filter((b) => b.productionId === r.production.id && b.status !== "cancelled");
          const cur = (n: number) => fmtMoney(Math.round(n), r.production.currency ?? "ZAR");
          return (
            <details key={r.production.id} open={scope !== "all"} className="rounded-sm border border-border bg-card">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-semibold">{r.production.name} {r.production.jobId && <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{r.production.jobId}</span>}</span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {q === "cost" && `${cur(r.committed)} of ${cur(r.budget)} (${r.budgetUsedPct}%)`}
                  {q === "crew" && `${r.booked}/${r.needed} booked · ${r.pencilled} pencilled`}
                  {q === "schedule" && `${fmtDate(r.production.date)}${r.daysToShoot !== null ? ` · ${r.daysToShoot >= 0 ? `in ${r.daysToShoot} days` : "started"}` : ""}`}
                  {q === "attention" && (r.attention.length ? `${r.attention.length} item${r.attention.length === 1 ? "" : "s"}` : "All clear")}
                  {q === "performance" && `Health ${r.health}%`}
                </span>
              </summary>
              <div className="border-t border-border px-4 py-3 text-sm">
                {q === "cost" && (
                  <div className="space-y-2">
                    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full ${r.budgetUsedPct > 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, r.budgetUsedPct)}%` }} /></div>
                    <div className="grid grid-cols-3 gap-2 text-xs"><span>Budget <b>{cur(r.budget)}</b></span><span>Committed <b>{cur(r.committed)}</b></span><span>Paid <b>{cur(r.paid)}</b></span></div>
                    <ul className="divide-y divide-border text-xs">{rows.filter((b) => BOOKED.includes(b.status)).map((b) => <li key={b.id} className="flex justify-between py-1.5"><span>{crewName(b.crewId)} · {b.role}</span><span className="whitespace-nowrap">{cur(b.crewRate)} × {Math.max(1, b.days)}d</span></li>)}</ul>
                  </div>
                )}
                {q === "crew" && (
                  <ul className="divide-y divide-border text-xs">{rows.map((b) => (
                    <li key={b.id} className="flex items-center justify-between py-1.5">
                      <span>{b.crewId ? <Link to="/crew/$id" params={{ id: b.crewId }} className="font-medium hover:underline">{crewName(b.crewId)}</Link> : "Unassigned"} · {b.role}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${BOOKED.includes(b.status) ? "bg-success/15 text-success" : PENCIL.includes(b.status) ? "bg-warning/20 text-foreground" : "bg-muted text-muted-foreground"}`}>{b.status.replace(/_/g, " ")}</span>
                    </li>))}
                    {r.unfilled > 0 && <li className="py-1.5 text-destructive">{r.unfilled} role{r.unfilled === 1 ? "" : "s"} still unfilled</li>}
                  </ul>
                )}
                {q === "schedule" && (
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <span>Shoot: <b>{fmtDate(r.production.date)}</b>{r.production.endDate ? ` – ${fmtDate(r.production.endDate)}` : ""} ({r.production.days} days)</span>
                    <span>Recce: <b>{fmtDate(r.production.recceDate)}</b></span>
                    <span>Gear pickup: <b>{fmtDate(r.production.gearPickupDate)}</b></span>
                    <span>Gear return: <b>{fmtDate(r.production.gearDropoffDate)}</b></span>
                    <span>Location: <b>{r.production.location || "—"}</b></span>
                    <span>Status: <b>{r.production.status}</b></span>
                  </div>
                )}
                {q === "attention" && (r.attention.length
                  ? <ul className="list-disc space-y-1 pl-5 text-xs">{r.attention.map((a) => <li key={a}>{a}</li>)}</ul>
                  : <p className="text-xs text-muted-foreground">Nothing needs your attention.</p>)}
                {q === "performance" && (
                  <div className="grid gap-2 text-xs sm:grid-cols-3">
                    <span>Health score <b>{r.health}%</b></span>
                    <span>Roster filled <b>{r.needed ? Math.round((r.booked / r.needed) * 100) : 100}%</b></span>
                    <span>Open disputes <b>{r.openDisputes}</b>{r.disputedAmount ? ` (${cur(r.disputedAmount)})` : ""}</span>
                  </div>
                )}
                <Link to="/productions/$id" params={{ id: r.production.id }} className="mt-3 inline-block text-xs font-semibold text-primary hover:underline">Open production →</Link>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
