import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Page, Panel } from "@/components/AppShell";
import { useApproveJob, useBookings, useCrew, useProductions } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { batchReleaseEscrow, fundProductionEscrow } from "@/lib/escrow.functions";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Book a Crew" },
      { name: "description", content: "Fund one escrow pool per production and release crew pay in one click." },
      { property: "og:title", content: "Payments — Book a Crew" },
      { property: "og:description", content: "Production escrow pools and batch crew payouts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

const rand = (n: number) => `R ${Math.round(n).toLocaleString("en-ZA")}`;
const STAGE: Record<string, string> = {
  confirmed: "Booked", accepted: "Booked", in_progress: "On set", awaiting_review: "Awaiting approval",
  payment_required: "Payment due", awaiting_release: "Ready to release", release_authorised: "Paid", payment_released: "Paid",
};
const POOL: Record<string, string> = { awaiting_funds: "Awaiting funds", in_escrow: "Funded", partially_released: "Partly paid out", released: "All paid out" };

function usePools() {
  return useQuery({
    queryKey: ["production-escrow"],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_escrow").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function PaymentsPage() {
  const bookings = useBookings().data ?? [];
  const crew = useCrew().data ?? [];
  const prods = useProductions().data ?? [];
  const pools = usePools().data ?? [];
  const approve = useApproveJob();
  const qc = useQueryClient();
  const fund = useServerFn(fundProductionEscrow);
  const release = useServerFn(batchReleaseEscrow);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const rows = bookings.filter((b) => STAGE[b.status] && b.crewId);
  const total = (b: (typeof rows)[number]) => b.crewRate * b.days;
  const released = (b: (typeof rows)[number]) => !!(b as { escrowReleasedAt?: string | null }).escrowReleasedAt || (b.status as string) === "release_authorised";
  const sum = (f: (b: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((a, b) => a + total(b), 0);
  const tiles = [
    { label: "Total committed", value: sum(() => true) },
    { label: "Held in escrow", value: pools.filter((p) => p.status !== "released").reduce((a, p) => a + Number(p.amount), 0) },
    { label: "Awaiting approval", value: sum((b) => b.status === "awaiting_review") },
    { label: "Paid out", value: sum(released) },
  ];
  const refresh = () => { qc.invalidateQueries({ queryKey: ["production-escrow"] }); qc.invalidateQueries(); };

  async function doFund(pid: string) {
    setBusy(pid);
    try { const r = await fund({ data: { productionId: pid } }); toast.success(`Escrow created for ${rand(r.amount)} — fund it on Escrow.com`); refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  async function doRelease(pid: string, ids: string[]) {
    if (!ids.length) { toast.error("Tick at least one crew member."); return; }
    setBusy(pid);
    try { const r = await release({ data: { productionId: pid, bookingIds: ids } }); toast.success(`Released pay for ${r.released} crew`); setPicked({}); refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  const byProd = prods.map((p) => ({ p, list: rows.filter((b) => b.productionId === p.id) })).filter((x) => x.list.length);

  return (
    <Page title="Payments" subtitle="One escrow pool per production. Release everyone's pay in one click at wrap.">
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{rand(t.value)}</p>
          </div>
        ))}
      </div>
      {byProd.length === 0 && <p className="text-muted-foreground">No payments yet.</p>}
      <div className="space-y-6">
        {byProd.map(({ p, list }) => {
          const pool = pools.find((x) => x.production_id === p.id);
          const open = list.filter((b) => !released(b));
          const ids = open.filter((b) => picked[b.id] ?? true).map((b) => b.id);
          return (
            <Panel key={p.id} title={p.name} right={
              <div className="flex items-center gap-2">
                {pool && <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">Escrow: {POOL[pool.status] ?? pool.status}</span>}
                {!pool && <button disabled={busy === p.id} onClick={() => doFund(p.id)} className="rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Fund production escrow</button>}
                {pool && open.length > 0 && <button disabled={busy === p.id} onClick={() => doRelease(p.id, ids)} className="rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Release {ids.length} selected</button>}
              </div>
            }>
              <div className="divide-y divide-border px-4">
                {list.map((b) => {
                  const c = crew.find((x) => x.id === b.crewId);
                  const done = released(b);
                  return (
                    <div key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                      <input type="checkbox" aria-label={`Include ${c?.name ?? "crew"}`} disabled={done || !pool} checked={done ? false : picked[b.id] ?? true} onChange={(e) => setPicked((s) => ({ ...s, [b.id]: e.target.checked }))} className="h-4 w-4" />
                      <div className="min-w-48 flex-1">
                        <p className="font-semibold text-foreground">{c?.name ?? "Crew"}</p>
                        <p className="text-sm text-muted-foreground">{b.role} · {b.days} day{b.days === 1 ? "" : "s"}</p>
                      </div>
                      <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">{done ? "Paid" : STAGE[b.status]}</span>
                      <span className="w-28 text-right font-semibold text-foreground">{rand(total(b))}</span>
                      {b.status === "awaiting_review" && (
                        <button className="rounded-xl border border-border px-3 py-1.5 text-sm font-medium" onClick={() => approve.mutate(b.id, { onSuccess: () => toast.success("Job approved"), onError: (e) => toast.error(e.message) })}>Approve</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </div>
    </Page>
  );
}
