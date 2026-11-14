import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { getUsdZarRate } from "@/lib/token-ledger.functions";

type Row = {
  id: string; created_at: string; provider: string; operation: string; model: string | null;
  input_tokens: number | null; output_tokens: number | null; total_tokens: number | null;
  cost_usd: number | null; status: number; error_message: string | null; user_name: string | null; production_id: string | null;
};
type Group = "operation" | "model" | "user" | "day";
const GROUPS: { key: Group; label: string }[] = [
  { key: "operation", label: "Activity" }, { key: "model", label: "Model" }, { key: "user", label: "Person" }, { key: "day", label: "Day" },
];

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const num = (n: number) => n.toLocaleString("en-ZA");
const field = "rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring";
const failed = (r: Row) => r.status >= 400;

export function TokenLedger() {
  const today = new Date();
  const [from, setFrom] = useState(ymd(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(ymd(today));
  const [group, setGroup] = useState<Group>("operation");
  const [showRand, setShowRand] = useState(true);
  const rateFn = useServerFn(getUsdZarRate);
  const rate = useQuery({ queryKey: ["usd-zar"], queryFn: () => rateFn(), staleTime: 3600_000 }).data ?? null;

  const q = useQuery({
    queryKey: ["token-ledger", from, to],
    queryFn: async () => {
      const until = new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000).toISOString();
      const { data, error } = await supabase.from("ai_usage_events").select("*")
        .gte("created_at", new Date(`${from}T00:00:00Z`).toISOString()).lt("created_at", until)
        .order("created_at", { ascending: false }).limit(5000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const rows = q.data ?? [];

  const inRand = showRand && !!rate;
  const money = (usd: number) => inRand
    ? `R${(usd * rate!.rate).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: usd < 1 ? 4 : 2 })}`;

  const totals = useMemo(() => rows.reduce((a, r) => ({
    calls: a.calls + 1, failed: a.failed + (failed(r) ? 1 : 0),
    tokens: a.tokens + (r.total_tokens ?? 0), cost: a.cost + Number(r.cost_usd ?? 0),
  }), { calls: 0, failed: 0, tokens: 0, cost: 0 }), [rows]);

  const grouped = useMemo(() => {
    const m = new Map<string, { calls: number; failed: number; tokens: number; cost: number }>();
    for (const r of rows) {
      const k = group === "operation" ? r.operation : group === "model" ? (r.model ?? "—") : group === "user" ? (r.user_name ?? "Background job") : fmtDate(r.created_at);
      const g = m.get(k) ?? { calls: 0, failed: 0, tokens: 0, cost: 0 };
      g.calls++; if (failed(r)) g.failed++; g.tokens += r.total_tokens ?? 0; g.cost += Number(r.cost_usd ?? 0);
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
  }, [rows, group]);

  function exportCsv() {
    const header = ["Date", "Time", "Activity", "Model", "Person", "Input tokens", "Output tokens", "Total tokens", "Cost USD", "Status", "Error"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = rows.map((r) => [fmtDate(r.created_at), fmtTime(r.created_at), r.operation, r.model, r.user_name, r.input_tokens, r.output_tokens, r.total_tokens, r.cost_usd, r.status, r.error_message].map(esc).join(","));
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `token-ledger_${from}_to_${to}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Panel title="Token Ledger" right={
      <div className="flex items-center gap-2">
        <button onClick={() => q.refetch()} aria-label="Refresh" className="text-muted-foreground hover:text-foreground"><RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /></button>
        <button onClick={exportCsv} disabled={!rows.length} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50"><Download className="h-3.5 w-3.5" /> CSV</button>
      </div>
    }>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="space-y-1"><span className="block text-muted-foreground">From</span><DateInput type="date" className={field} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-muted-foreground">To</span><DateInput type="date" className={field} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          <label className="space-y-1"><span className="block text-muted-foreground">Group by</span>
            <SearchableSelect className={field} value={group} onChange={(e) => setGroup(e.target.value as Group)}>{GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</SearchableSelect>
          </label>
          <div className="ml-auto inline-flex rounded-sm border border-border font-semibold">
            <button onClick={() => setShowRand(true)} disabled={!rate} className={`px-2.5 py-1.5 ${inRand ? "bg-primary text-primary-foreground" : "text-muted-foreground"} disabled:opacity-50`}>ZAR</button>
            <button onClick={() => setShowRand(false)} className={`border-l border-border px-2.5 py-1.5 ${!inRand ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>USD</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: "Estimated cost", value: money(totals.cost) },
            { label: "AI calls", value: num(totals.calls) },
            { label: "Tokens used", value: num(totals.tokens) },
            { label: "Failed calls", value: num(totals.failed), warn: totals.failed > 0 },
          ].map((s) => (
            <div key={s.label} className="rounded-sm border border-border p-3">
              <div className="text-[11px] text-muted-foreground">{s.label}</div>
              <div className={`mt-1 font-display text-lg font-semibold ${s.warn ? "text-destructive" : ""}`}>{s.value}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Costs are estimates from published per-token prices, not the provider's invoice.
          {inRand && ` Converted at R${rate!.rate.toFixed(2)} per US$ (${fmtDate(rate!.asOf)}).`}
        </p>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">{GROUPS.find((g) => g.key === group)!.label}</th><th className="px-4">Calls</th><th className="px-4">Failed</th><th className="px-4">Tokens</th><th className="px-4">Cost</th></tr></thead>
        <tbody>{grouped.map(([k, g]) => (
          <tr key={k} className="border-t border-border">
            <td className="whitespace-nowrap px-4 py-2 font-medium">{k}</td><td className="px-4">{num(g.calls)}</td>
            <td className={`px-4 ${g.failed ? "text-destructive" : "text-muted-foreground"}`}>{num(g.failed)}</td>
            <td className="px-4">{num(g.tokens)}</td><td className="px-4 font-semibold">{money(g.cost)}</td>
          </tr>
        ))}</tbody>
      </table>

      <details className="border-t border-border">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-semibold text-primary">Every call ({rows.length})</summary>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4">Activity</th><th className="px-4">Model</th><th className="px-4">Person</th><th className="px-4">Tokens</th><th className="px-4">Cost</th><th className="px-4">Result</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{fmtDate(r.created_at)} {fmtTime(r.created_at)}</td>
              <td className="px-4 font-medium">{r.operation}</td><td className="px-4 text-muted-foreground">{r.model ?? "—"}</td>
              <td className="px-4">{r.user_name ?? "Background job"}</td><td className="px-4">{r.total_tokens != null ? num(r.total_tokens) : "—"}</td>
              <td className="px-4">{money(Number(r.cost_usd ?? 0))}</td>
              <td className="px-4">{failed(r)
                ? <span title={r.error_message ?? undefined} className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Failed</span>
                : <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success">OK</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </details>
      {!q.isLoading && rows.length === 0 && <p className="border-t border-border p-4 text-sm text-muted-foreground">No AI usage recorded in this period yet.</p>}
    </Panel>
  );
}
