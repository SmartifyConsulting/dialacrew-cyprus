import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Download, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusPill, statusTone } from "@/components/admin/StatusPill";
import { getUsdZarRate } from "@/lib/token-ledger.functions";
import { friendlyError } from "@/lib/errors";
import { CATEGORIES, cashOf, dedupe, totals, type Section, type Txn } from "@/lib/finance";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso: string) => { if (!iso) return "—"; const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const money = (n: number) => `${n < 0 ? "−" : ""}R${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const field = "rounded-sm border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring";
const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"] as const;
const PAYMENT_STATUSES = ["not_required", "payment_required", "payment_received", "funds_held", "awaiting_release", "release_authorised", "payment_released", "payment_failed", "payment_disputed"] as const;
const name = (v: unknown) => (v as { name?: string } | null)?.name ?? "—";

export function FinanceStatement({ includeAi }: { includeAi: boolean }) {
  const qc = useQueryClient();
  const rateFn = useServerFn(getUsdZarRate);
  const rate = useQuery({ queryKey: ["usd-zar"], queryFn: () => rateFn(), staleTime: 3600_000 }).data?.rate ?? 18.5;
  const today = new Date();
  const [from, setFrom] = useState(ymd(new Date(today.getFullYear(), 0, 1)));
  const [to, setTo] = useState(ymd(today));
  const [type, setType] = useState<"all" | Section>("all");
  const [party, setParty] = useState("");
  const [project, setProject] = useState("");
  const [status, setStatus] = useState("all");
  const [showUnpaid, setShowUnpaid] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sel, setSel] = useState<Txn | null>(null);

  const q = useQuery({
    queryKey: ["finance-statement", includeAi, rate],
    queryFn: async () => {
      const [inv, gigs, pay, ai] = await Promise.all([
        supabase.from("invoices").select("id, invoice_number, created_at, total, status, service_description, crew_members(name), productions(name)"),
        supabase.from("community_gigs").select("id, title, secure_fee, status, secured_at, secured_name, created_at, country").not("secured_by", "is", null),
        supabase.from("bookings").select("id, role, crew_rate, days, payment_status, escrow_released_at, booking_date, crew_members(name), productions(name)").neq("payment_status", "not_required"),
        includeAi ? supabase.from("ai_usage_events").select("id, created_at, provider, operation, model, user_name, production_id, total_tokens, cost_usd, status").order("created_at", { ascending: false }).limit(5000) : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of [inv, gigs, pay, ai]) if (r.error) throw r.error;
      const out: Txn[] = [];
      for (const i of inv.data ?? []) {
        const total = Number(i.total) || 0; const isPaid = i.status === "paid";
        out.push({ key: `inv:${i.id}`, section: "income", category: "Invoice payments received", date: i.created_at, ref: i.invoice_number, party: name(i.crew_members), project: name(i.productions), description: i.service_description || "Booking invoice", amount: total, paid: isPaid ? total : 0, status: i.status, link: `/invoices/${i.id}`, sourceId: i.id, sourceType: "invoice" });
      }
      for (const g of gigs.data ?? []) {
        const fee = Number(g.secure_fee) || 0;
        out.push({ key: `gig:${g.id}`, section: "income", category: "Gig securing fees received", date: g.secured_at ?? g.created_at, ref: `GIG-${g.id.slice(0, 8).toUpperCase()}`, party: g.secured_name ?? "—", project: g.title, description: `Securing fee · ${g.country ?? ""}`, amount: fee, paid: g.status === "cancelled" ? 0 : fee, status: g.status, sourceId: g.id, sourceType: "gig" });
      }
      for (const b of pay.data ?? []) {
        const amt = (Number(b.crew_rate) || 0) * (Number(b.days) || 0); const released = b.payment_status === "payment_released";
        out.push({ key: `pay:${b.id}`, section: "expenses", category: "Crew payouts released", date: b.escrow_released_at ?? b.booking_date ?? "", ref: `BKG-${b.id.slice(0, 8).toUpperCase()}`, party: name(b.crew_members), project: name(b.productions), description: b.role ?? "Crew booking", amount: amt, paid: released ? amt : 0, status: b.payment_status, sourceId: b.id, sourceType: "booking" });
      }
      for (const a of (ai.data ?? []) as { id: string; created_at: string; provider: string; operation: string; model: string | null; user_name: string | null; production_id: string | null; total_tokens: number | null; cost_usd: number | null; status: number }[]) {
        const zar = Number(a.cost_usd ?? 0) * rate;
        out.push({ key: `ai:${a.id}`, section: "expenses", category: "AI API usage and token costs", date: a.created_at, ref: a.id.slice(0, 8).toUpperCase(), party: a.provider, project: a.user_name ?? "Background job", description: `${a.operation}${a.model ? ` · ${a.model}` : ""}`, amount: zar, paid: zar, status: a.status >= 400 ? "failed" : "completed", tokens: a.total_tokens, sourceId: a.id, sourceType: "ai" });
      }
      return dedupe(out);
    },
  });

  const rows = useMemo(() => {
    const f = new Date(`${from}T00:00:00Z`).getTime(); const t = new Date(`${to}T00:00:00Z`).getTime() + 86_400_000;
    return (q.data ?? []).filter((r) => {
      const d = r.date ? new Date(r.date).getTime() : f;
      if (d < f || d >= t) return false;
      if (type !== "all" && r.section !== type) return false;
      if (party && !r.party.toLowerCase().includes(party.toLowerCase())) return false;
      if (project && !r.project.toLowerCase().includes(project.toLowerCase())) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!showUnpaid && cashOf(r) === 0) return false;
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [q.data, from, to, type, party, project, status, showUnpaid]);

  const sum = totals(rows);
  const statuses = useMemo(() => [...new Set((q.data ?? []).map((r) => r.status))].sort(), [q.data]);
  const outstanding = (q.data ?? []).filter((r) => cashOf(r) < r.amount).reduce((a, r) => a + (r.amount - cashOf(r)), 0);
  const cats = CATEGORIES.filter((c) => includeAi || c.name !== "AI API usage and token costs");
  const setAll = (v: boolean) => setOpen(Object.fromEntries(cats.map((c) => [c.name, v])));

  async function updateStatus(t: Txn, s: string) {
    const res = t.sourceType === "invoice"
      ? await supabase.from("invoices").update({ status: s }).eq("id", t.sourceId!)
      : await supabase.from("bookings").update({ payment_status: s as (typeof PAYMENT_STATUSES)[number] }).eq("id", t.sourceId!);
    if (res.error) { toast.error(friendlyError(res.error)); return; }
    toast.success("Status updated"); setSel({ ...t, status: s });
    qc.invalidateQueries({ queryKey: ["finance-statement"] });
  }

  const header = ["Section", "Category", "Date", "Reference", "Party", "Project", "Description", "Tokens", "Amount ZAR", "Cash ZAR", "Status"];
  const line = (r: Txn) => [r.section, r.category, fmtDate(r.date), r.ref, r.party, r.project, r.description, r.tokens ?? "", r.amount.toFixed(2), cashOf(r).toFixed(2), r.status];
  function download(content: string, mime: string, ext: string) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = `cash-flow_${from}_to_${to}.${ext}`; a.click(); URL.revokeObjectURL(a.href);
  }
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const html = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const tableHtml = () => `<table border="1"><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${line(r).map((c) => `<td>${html(c)}</td>`).join("")}</tr>`).join("")}<tr><td colspan="9">Total income</td><td>${sum.income.toFixed(2)}</td></tr><tr><td colspan="9">Total expenses</td><td>${sum.expenses.toFixed(2)}</td></tr><tr><td colspan="9">Net cash flow</td><td>${sum.net.toFixed(2)}</td></tr></table>`;
  const exportCsv = () => download([header.map(esc).join(","), ...rows.map((r) => line(r).map(esc).join(","))].join("\n"), "text/csv", "csv");
  const exportXls = () => download(`<html><head><meta charset="utf-8"></head><body>${tableHtml()}</body></html>`, "application/vnd.ms-excel", "xls");
  function exportPdf() {
    const w = window.open("", "_blank"); if (!w) return;
    w.document.write(`<html><head><title>Cash flow statement</title><style>body{font-family:sans-serif;font-size:11px}table{border-collapse:collapse;width:100%}td,th{padding:4px;border:1px solid #ccc}</style></head><body><h2>Cash flow statement · ${fmtDate(from)} – ${fmtDate(to)}</h2>${tableHtml()}<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {([["Total income", sum.income, ""], ["Total expenses", sum.expenses, "text-destructive"], ["Net cash flow", sum.net, sum.net < 0 ? "text-destructive" : "text-success"]] as const).map(([l, v, c]) => (
          <div key={l} className="rounded-sm border border-border bg-card p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</div>
            <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${c}`}>{money(v)}</div>
          </div>
        ))}
      </div>

      <Panel title="Cash flow statement" right={
        <div className="flex items-center gap-3 text-xs font-semibold">
          <button onClick={() => q.refetch()} aria-label="Refresh" className="text-muted-foreground hover:text-foreground"><RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /></button>
          {[["CSV", exportCsv], ["Excel", exportXls], ["PDF", exportPdf]].map(([l, fn]) => (
            <button key={l as string} onClick={fn as () => void} disabled={!rows.length} className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"><Download className="h-3.5 w-3.5" />{l as string}</button>
          ))}
        </div>
      }>
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4 text-xs">
          <label className="space-y-1"><span className="block text-muted-foreground">From</span><input type="date" className={field} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-muted-foreground">To</span><input type="date" className={field} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-muted-foreground">Type</span>
            <select className={field} value={type} onChange={(e) => setType(e.target.value as typeof type)}><option value="all">All</option><option value="income">Income</option><option value="expenses">Expenses</option></select></label>
          <label className="space-y-1"><span className="block text-muted-foreground">Supplier / party</span><input className={field} value={party} onChange={(e) => setParty(e.target.value)} placeholder="Any" /></label>
          <label className="space-y-1"><span className="block text-muted-foreground">Project</span><input className={field} value={project} onChange={(e) => setProject(e.target.value)} placeholder="Any" /></label>
          <label className="space-y-1"><span className="block text-muted-foreground">Status</span>
            <select className={field} value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All</option>{statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></label>
          <label className="flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={showUnpaid} onChange={(e) => setShowUnpaid(e.target.checked)} /> Show unpaid / outstanding ({money(outstanding)})</label>
          <div className="ml-auto flex gap-3 pb-1.5 font-semibold text-primary">
            <button onClick={() => setAll(true)} className="hover:underline">Expand all</button>
            <button onClick={() => setAll(false)} className="hover:underline">Collapse all</button>
          </div>
        </div>

        {q.error && <p role="alert" className="p-4 text-sm text-destructive">{friendlyError(q.error)}</p>}
        {(["income", "expenses"] as const).map((sec) => {
          if (type !== "all" && type !== sec) return null;
          const secRows = rows.filter((r) => r.section === sec);
          const secTotal = sec === "income" ? sum.income : sum.expenses;
          return (
            <section key={sec}>
              <div className="flex items-center justify-between border-b-2 border-border bg-muted px-4 py-2.5">
                <h3 className="font-display text-sm font-bold uppercase tracking-wide">{sec === "income" ? "Income" : "Expenses"}</h3>
                <span className={`font-display text-sm font-bold tabular-nums ${sec === "expenses" ? "text-destructive" : ""}`}>{money(secTotal)}</span>
              </div>
              {cats.filter((c) => c.section === sec).map((c) => {
                const list = secRows.filter((r) => r.category === c.name);
                const sub = list.reduce((a, r) => a + cashOf(r), 0);
                const isOpen = !!open[c.name];
                return (
                  <div key={c.name} className="border-b border-border">
                    <button onClick={() => setOpen({ ...open, [c.name]: !isOpen })} aria-expanded={isOpen}
                      className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-muted/50">
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">({list.length})</span>
                      <span className="ml-auto tabular-nums">{money(sub)}</span>
                    </button>
                    {isOpen && (list.length === 0
                      ? <p className="px-10 pb-3 text-xs text-muted-foreground">No transactions recorded in this period.</p>
                      : <div className="overflow-x-auto px-4 pb-3"><table className="w-full text-xs">
                          <thead className="text-left text-[11px] text-muted-foreground"><tr>
                            <th className="py-1.5 pl-6">Date</th><th>Reference</th><th>Party</th><th>Project / user</th><th>Description</th>
                            {c.name.startsWith("AI") && <th className="text-right">Tokens</th>}
                            <th className="text-right">Amount</th><th className="text-right">Cash</th><th className="pl-3">Status</th></tr></thead>
                          <tbody>{list.map((r) => (
                            <tr key={r.key} onClick={() => setSel(r)} className="cursor-pointer border-t border-border hover:bg-muted/50">
                              <td className="whitespace-nowrap py-1.5 pl-6">{fmtDate(r.date)}</td>
                              <td className="font-mono">{r.ref}</td><td>{r.party}</td><td>{r.project}</td>
                              <td className="max-w-56 truncate">{r.description}</td>
                              {c.name.startsWith("AI") && <td className="text-right tabular-nums">{r.tokens?.toLocaleString("en-ZA") ?? "—"}</td>}
                              <td className="whitespace-nowrap text-right tabular-nums">{money(r.amount)}</td>
                              <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(cashOf(r))}</td>
                              <td className="pl-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${statusTone(r.status)}`}>{r.status.replace(/_/g, " ")}</span></td>
                            </tr>
                          ))}</tbody></table></div>)}
                  </div>
                );
              })}
            </section>
          );
        })}
        <div className="flex justify-between border-t-2 border-border px-4 py-3 font-display text-sm font-bold">
          <span>Net cash flow</span><span className={`tabular-nums ${sum.net < 0 ? "text-destructive" : "text-success"}`}>{money(sum.net)}</span>
        </div>
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">Cash basis: only money actually received or paid is counted. AI costs are estimates converted at R{rate.toFixed(2)}/US$.</p>
      </Panel>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {sel && <>
            <SheetHeader><SheetTitle>{sel.category}</SheetTitle></SheetHeader>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {([["Date", fmtDate(sel.date)], ["Reference", sel.ref], ["Party", sel.party], ["Project / user", sel.project], ["Description", sel.description], ...(sel.tokens != null ? [["Tokens", sel.tokens.toLocaleString("en-ZA")]] : []), ["Amount", money(sel.amount)], ["Cash moved", money(cashOf(sel))], ["Outstanding", money(sel.amount - cashOf(sel))]] as [string, string][]).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
              <dt className="text-muted-foreground">Status</dt>
              <dd>{sel.sourceType === "invoice"
                ? <StatusPill value={sel.status as (typeof INVOICE_STATUSES)[number]} options={INVOICE_STATUSES} label={(s) => s} onChange={(s) => updateStatus(sel, s)} />
                : sel.sourceType === "booking"
                  ? <StatusPill value={sel.status as (typeof PAYMENT_STATUSES)[number]} options={PAYMENT_STATUSES} label={(s) => s.replace(/_/g, " ")} onChange={(s) => updateStatus(sel, s)} />
                  : <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(sel.status)}`}>{sel.status}</span>}</dd>
            </dl>
            {sel.link && <Link to="/invoices/$id" params={{ id: sel.sourceId! }} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><FileText className="h-4 w-4" /> View / download invoice</Link>}
          </>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
