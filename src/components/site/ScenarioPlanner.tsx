import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Save, Trash2, Star, CheckCircle2, Plus, ArrowLeftRight, Users, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { useBookings, useCrew, useCrewGroups } from "@/lib/db";
import { matchBrief, type MatchResult } from "@/lib/memory.functions";
import { providerTotal } from "@/lib/costing";
import { zar, type Production } from "@/lib/demo-data";

type Selection = Record<string, string[]>; // crewId -> selected asset ids
type Asset = { id: string; crew_id: string; name: string; category: string; daily_fee: number };
type Scenario = { id: string; name: string; selection: Selection; total: number; created_at: string };

const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const btn = "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const ghost = "inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary";

/** Scenario key: drafts for a production are stored as brief_matches rows under this client key. */
export const scenarioKey = (productionId: string) => `scenario:${productionId}`;

/** Cost of one scenario: each chosen crew member's day rate × days plus their chosen kit fees × days. */
export function scenarioCost(sel: Selection, days: number, rates: Record<string, number>, fees: Record<string, number>) {
  return Object.entries(sel).reduce((sum, [crewId, kit]) =>
    sum + providerTotal(rates[crewId] ?? 0, days, kit.map((a) => ({ dailyFee: fees[a] ?? 0, days }))), 0);
}

export function ScenarioPlanner({ p }: { p: Production }) {
  const qc = useQueryClient();
  const match = useServerFn(matchBrief);
  const crew = useCrew().data ?? [];
  const allBookings = useBookings().data ?? [];
  const days = Math.max(1, p.days || 1);

  // This production's full shoot date range — crew with a clashing booking elsewhere aren't available for it.
  const rangeStart = p.date || null;
  const rangeEnd = p.endDate || (p.date ? addDays(p.date, days - 1) : null);
  const availableForRange = useMemo(() => {
    const busy = new Set<string>();
    if (rangeStart && rangeEnd) {
      for (const b of allBookings) {
        if (b.productionId === p.id || !b.bookingDate || b.status === "cancelled") continue;
        const bEnd = addDays(b.bookingDate, Math.max(1, b.days || 1) - 1);
        if (b.bookingDate <= rangeEnd && bEnd >= rangeStart && b.crewId) busy.add(b.crewId);
      }
    }
    return (crewId: string) => !busy.has(crewId);
  }, [allBookings, p.id, rangeStart, rangeEnd]);
  const assets = useQuery({
    queryKey: ["all-crew-assets"],
    queryFn: async () => { const { data, error } = await supabase.from("crew_assets").select("id, crew_id, name, category, daily_fee"); if (error) throw error; return (data ?? []).map((a) => ({ ...a, daily_fee: Number(a.daily_fee) })) as Asset[]; },
  });
  const scenarios = useQuery({
    queryKey: ["scenarios", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("brief_matches").select("id, brief, result, created_at").eq("client", scenarioKey(p.id)).order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => ({ id: r.id, name: r.brief, created_at: r.created_at, ...(r.result as { selection: Selection; total: number }) })) as Scenario[];
    },
  });

  const [sel, setSel] = useState<Selection>({});
  const [name, setName] = useState("Option A");
  const [brief, setBrief] = useState(p.summary ?? "");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<MatchResult | null>(null);
  const [filter, setFilter] = useState("");
  const [activeId, setActiveId] = useState<string>(""); // "" = new scenario
  const [committing, setCommitting] = useState(false);
  const groups = useCrewGroups().data ?? [];
  const [mixOpen, setMixOpen] = useState(false);
  const [mixNotice, setMixNotice] = useState<{ name: string; total: number; unavailable: string[] } | null>(null);

  const rates = useMemo(() => Object.fromEntries(crew.map((c) => [c.id, c.dayRate])), [crew]);
  const fees = useMemo(() => Object.fromEntries((assets.data ?? []).map((a) => [a.id, a.daily_fee])), [assets.data]);
  const kitBy = useMemo(() => {
    const m: Record<string, Asset[]> = {};
    for (const a of assets.data ?? []) (m[a.crew_id] ??= []).push(a);
    return m;
  }, [assets.data]);
  const crewName = (id: string) => crew.find((c) => c.id === id)?.name ?? "Unknown";
  const total = scenarioCost(sel, days, rates, fees);
  const variance = p.budget - total;

  const toggleCrew = (id: string) => setSel((s) => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = []; return n; });
  const toggleKit = (crewId: string, assetId: string) => setSel((s) => {
    const cur = s[crewId] ?? [];
    return { ...s, [crewId]: cur.includes(assetId) ? cur.filter((x) => x !== assetId) : [...cur, assetId] };
  });

  async function suggest() {
    if (brief.trim().length < 10) { toast.error("Describe the brief in a sentence or two."); return; }
    setBusy(true);
    try {
      const r = await match({ data: { client: p.client, brief, days, location: p.address || p.location } });
      setAi(r);
      const next: Selection = {};
      for (const c of r.crew) next[c.crew_id] = [];
      for (const k of r.kit) { const owner = assets.data?.find((a) => a.id === k.asset_id)?.crew_id; if (owner) (next[owner] ??= []).push(k.asset_id); }
      setSel(next);
      toast.success("AI selection loaded — adjust crew and kit, then save as a draft");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Matching failed."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!Object.keys(sel).length) { toast.error("Select at least one crew member."); return; }
    const clean = name.trim() || "Untitled option";
    const dup = scenarios.data?.find((x) => x.name.toLowerCase() === clean.toLowerCase() && x.id !== activeId);
    if (dup) { toast.error(`"${clean}" already exists — pick it from the dropdown to update it, or use another name.`); return; }
    const result = { selection: sel, total };
    const res = activeId
      ? await supabase.from("brief_matches").update({ brief: clean, result }).eq("id", activeId).select("id").single()
      : await supabase.from("brief_matches").insert({ client: scenarioKey(p.id), brief: clean, result }).select("id").single();
    if (res.error) { toast.error(res.error.message); return; }
    setActiveId(res.data.id);
    toast.success(activeId ? `Updated "${clean}"` : `Saved "${clean}"`);
    qc.invalidateQueries({ queryKey: ["scenarios", p.id] });
  }
  function pick(id: string) {
    setActiveId(id);
    if (!id) { setSel({}); setName(`Option ${String.fromCharCode(65 + Math.min(scenarios.data?.length ?? 0, 25))}`); return; }
    const s = scenarios.data?.find((x) => x.id === id);
    if (s) { setSel(s.selection); setName(s.name); }
  }
  function swap(from: string, to: string) {
    if (!to) return;
    setSel((s) => { const n = { ...s }; delete n[from]; n[to] = []; return n; });
    toast.success(`Swapped ${crewName(from)} for ${crewName(to)}`);
  }
  // Apply a saved Favourite Mix: add every available member to the sandbox, and flag whoever's
  // booked elsewhere across this production's dates so they can be swapped out.
  function applyMix(group: { id: string; name: string; memberIds: string[] }) {
    const unavailable: string[] = [];
    setSel((s) => {
      const n = { ...s };
      for (const id of group.memberIds) {
        const c = crew.find((x) => x.id === id);
        if (!c) continue;
        if (!c.available || !availableForRange(id)) { unavailable.push(c.name); continue; }
        if (!n[id]) n[id] = [];
      }
      return n;
    });
    setMixOpen(false);
    setMixNotice({ name: group.name, total: group.memberIds.length, unavailable });
  }
  // Commit: pencil the chosen group's crew + kit on the production, then drop the other sandbox groups.
  async function commit(s: Scenario) {
    if (!confirm(`Commit "${s.name}"? Its crew will be pencilled in and the other options removed.`)) return;
    setCommitting(true);
    try {
      const rows = Object.keys(s.selection).map((crewId) => ({
        production_id: p.id, crew_id: crewId, role: crew.find((c) => c.id === crewId)?.role ?? "Crew", status: "pencil" as const,
        booking_date: p.date || null, crew_rate: rates[crewId] ?? 0, client_charge: rates[crewId] ?? 0, days,
      }));
      const { data: made, error } = await supabase.from("bookings").insert(rows).select("id, crew_id");
      if (error) throw error;
      const kitRows = (made ?? []).flatMap((b) => (s.selection[b.crew_id ?? ""] ?? []).map((a) => ({ booking_id: b.id, asset_id: a, daily_fee: fees[a] ?? 0, days })));
      if (kitRows.length) { const k = await supabase.from("booking_assets").insert(kitRows); if (k.error) throw k.error; }
      const others = (scenarios.data ?? []).filter((x) => x.id !== s.id).map((x) => x.id);
      if (others.length) await supabase.from("brief_matches").delete().in("id", others);
      if (p.status === "Draft") await supabase.from("productions").update({ status: "Upcoming" }).eq("id", p.id);
      toast.success(`"${s.name}" committed — crew pencilled in`);
      ["scenarios", "bookings", "productions", "production-open-gigs"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      qc.invalidateQueries({ queryKey: ["scenarios", p.id] });
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setCommitting(false); }
  }
  async function remove(id: string) {
    const { error } = await supabase.from("brief_matches").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    if (id === activeId) pick("");
    qc.invalidateQueries({ queryKey: ["scenarios", p.id] });
  }

  const shown = crew.filter((c) => !filter || `${c.name} ${c.role} ${c.department}`.toLowerCase().includes(filter.toLowerCase()));
  const aiWhy = Object.fromEntries((ai?.crew ?? []).map((c) => [c.crew_id, c]));

  return (
    <div className="w-full space-y-5">
      <Panel title="Find crew · AI MemoryBank">
        <div className="grid gap-3 p-4">
          <p className="text-xs text-muted-foreground">Uses what the AI has learned about {p.client}. The AI picks crew and kit; you can change anything before saving.</p>
          <textarea className={`${field} min-h-24`} maxLength={4000} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Describe the brief: look, shots, crew size…" />
          <button onClick={suggest} disabled={busy} className={`${btn} justify-center`}><Sparkles className="h-4 w-4" />{busy ? "Matching…" : "Suggest crew & kit"}</button>
          {ai && (
            <div className="space-y-2 rounded-sm border border-border p-3 text-sm">
              <p>{ai.analysis}</p>
              {ai.memory_insights?.length > 0 && <ul className="list-disc pl-5 text-xs text-muted-foreground">{ai.memory_insights.map((m) => <li key={m}>{m}</li>)}</ul>}
              {ai.warnings.length > 0 && <ul className="list-disc pl-5 text-xs text-destructive">{ai.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
            </div>
          )}
        </div>
      </Panel>

      <Panel title={`Sandbox · ${days} day(s)`} right={<input className="w-40 rounded-sm border border-input bg-background px-2 py-1 text-xs" placeholder="Filter crew" value={filter} onChange={(e) => setFilter(e.target.value)} />}>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <select className="rounded-sm border border-input bg-background px-2 py-2 text-sm" value={activeId} onChange={(e) => pick(e.target.value)} aria-label="Option">
            <option value="">+ New option</option>
            {(scenarios.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="min-w-40 flex-1 rounded-sm border border-input bg-background px-2 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Option name" placeholder="Option name" />
          {activeId && <button className={ghost} onClick={() => pick("")}><Plus className="h-3 w-3" /> New</button>}
          <div className="relative">
            <button className={ghost} onClick={() => setMixOpen(!mixOpen)}><Users className="h-3 w-3" /> Favourite Mix</button>
            {mixOpen && (
              <div className="absolute right-0 z-20 mt-1 w-64 rounded-sm border border-border bg-card shadow-md">
                <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                  {groups.length === 0 && <li className="p-3 text-xs text-muted-foreground">No mixes saved yet — build one from the Crew directory.</li>}
                  {groups.map((g) => (
                    <li key={g.id}>
                      <button onClick={() => applyMix(g)} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                        {g.name} <span className="text-xs text-muted-foreground">({g.memberIds.length})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        {mixNotice && (
          <div className="border-b border-border bg-primary/5 p-3 text-xs">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="flex-1">
                {mixNotice.unavailable.length === 0 ? (
                  <span>"{mixNotice.name}" added — everyone in this mix is available for these dates.</span>
                ) : (
                  <span>
                    "{mixNotice.name}" added. <span className="inline-flex items-center gap-1 font-semibold text-destructive"><AlertTriangle className="h-3 w-3" /> {mixNotice.unavailable.length} of {mixNotice.total} member(s)</span>{" "}
                    {mixNotice.unavailable.length === 1 ? "isn't" : "aren't"} available for these dates: <strong>{mixNotice.unavailable.join(", ")}</strong>. They weren't added — swap in a replacement from the list below.
                  </span>
                )}
              </div>
              <button onClick={() => setMixNotice(null)} className="shrink-0 text-muted-foreground hover:text-foreground">✕</button>
            </div>
          </div>
        )}
        <div className="border-b border-border px-4 py-3"><BudgetBar used={total} budget={p.budget} /></div>
        <ul className="max-h-[520px] divide-y divide-border overflow-y-auto">
          {shown.map((c) => {
            const on = !!sel[c.id];
            const kit = kitBy[c.id] ?? [];
            const line = on ? providerTotal(c.dayRate, days, (sel[c.id] ?? []).map((a) => ({ dailyFee: fees[a] ?? 0, days }))) : 0;
            return (
              <li key={c.id} className={`px-4 py-2.5 ${on ? "bg-primary/5" : ""}`}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={on} onChange={() => toggleCrew(c.id)} className="h-4 w-4 accent-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{c.name} <span className="font-normal text-muted-foreground">· {aiWhy[c.id]?.suggested_role ?? c.role}</span></div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 text-primary" /> {c.rating.toFixed(1)} · {zar(c.dayRate)}/day ·{" "}
                      <span className={c.available && availableForRange(c.id) ? "text-success" : "text-destructive"}>
                        {!c.available ? "Unavailable" : availableForRange(c.id) ? `Available ${rangeStart ? "for these dates" : ""}` : "Booked these dates"}
                      </span>
                    </div>
                    {aiWhy[c.id] && <div className="text-xs text-primary">AI: {aiWhy[c.id]?.why}</div>}
                  </div>
                  {on && <span className="text-sm font-semibold">{zar(line)}</span>}
                </label>
                {on && (
                  <div className="ml-7 mt-2 flex items-center gap-2 text-xs">
                    <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                    <select className="rounded-sm border border-input bg-background px-2 py-1 text-xs" value="" onChange={(e) => swap(c.id, e.target.value)} aria-label={`Swap ${c.name}`}>
                      <option value="">Swap for…</option>
                      {crew.filter((o) => !sel[o.id] && o.id !== c.id).sort((a, b) => Number(b.department === c.department) - Number(a.department === c.department)).map((o) => (
                        <option key={o.id} value={o.id}>{o.name} · {o.role} · {zar(o.dayRate)}/day</option>
                      ))}
                    </select>
                  </div>
                )}
                {on && kit.length > 0 && (
                  <div className="ml-7 mt-2 flex flex-wrap gap-2">
                    {kit.map((a) => {
                      const k = (sel[c.id] ?? []).includes(a.id);
                      return (
                        <button key={a.id} type="button" onClick={() => toggleKit(c.id, a.id)}
                          className={`rounded-sm border px-2 py-1 text-xs ${k ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary"}`}>
                          {k ? "✓ " : "+ "}{a.name} · {zar(a.daily_fee)}/day
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
          <div className="text-sm">
            <div><span className="text-muted-foreground">Estimate:</span> <b>{zar(total)}</b> for {Object.keys(sel).length} crew</div>
            <div className={`text-xs ${variance < 0 ? "text-destructive" : "text-success"}`}>{variance < 0 ? `${zar(-variance)} over` : `${zar(variance)} under`} budget of {zar(p.budget)}</div>
          </div>
          <button onClick={save} className={`${btn} ml-auto`}><Save className="h-4 w-4" /> {activeId ? "Update option" : "Save option"}</button>
        </div>
      </Panel>

      <Panel title={`Compare options (${scenarios.data?.length ?? 0})`}>
        {!scenarios.data?.length ? <p className="p-4 text-sm text-muted-foreground">No drafts yet. Save one above, then build another with a different group to compare.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-2">Draft</th><th className="px-2">Crew</th><th className="px-2">Kit items</th><th className="px-2">Estimate</th><th className="px-2 w-40">Budget used</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scenarios.data.map((s) => {
                  const cost = scenarioCost(s.selection, days, rates, fees);
                  const v = p.budget - cost;
                  const kitCount = Object.values(s.selection).reduce((a, k) => a + k.length, 0);
                  return (
                    <tr key={s.id}>
                      <td className="px-4 py-2"><div className="font-semibold">{s.name}</div><div className="text-xs text-muted-foreground">{Object.keys(s.selection).map(crewName).join(", ")}</div></td>
                      <td className="px-2">{Object.keys(s.selection).length}</td>
                      <td className="px-2">{kitCount}</td>
                      <td className="px-2 font-semibold">{zar(cost)}</td>
                      <td className="px-2"><BudgetBar used={cost} budget={p.budget} compact /><div className={`text-[10px] ${v < 0 ? "text-destructive" : "text-muted-foreground"}`}>{v < 0 ? `${zar(-v)} over` : `${zar(v)} left`}</div></td>
                      <td className="whitespace-nowrap px-2 text-right">
                        <button className={ghost} onClick={() => pick(s.id)}>Edit</button>{" "}
                        <button className={ghost} disabled={committing} onClick={() => commit(s)}><CheckCircle2 className="h-3 w-3" /> Commit</button>{" "}
                        <button className={ghost} aria-label="Delete draft" onClick={() => remove(s.id)}><Trash2 className="h-3 w-3" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Budget usage %: green under 85%, amber 85–100%, red over budget. */
export function budgetPct(used: number, budget: number) { return budget > 0 ? Math.round((used / budget) * 100) : 0; }

function BudgetBar({ used, budget, compact }: { used: number; budget: number; compact?: boolean }) {
  const pct = budgetPct(used, budget);
  const tone = pct > 100 ? "bg-destructive" : pct >= 85 ? "bg-chart-3" : "bg-success";
  return (
    <div>
      {!compact && <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Budget used</span><span className="font-semibold">{pct}% · {zar(used)} of {zar(budget)}</span></div>}
      <div className={`${compact ? "h-1.5" : "h-2.5"} overflow-hidden rounded-full bg-muted`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {compact && <div className="text-[10px] font-semibold">{pct}%</div>}
    </div>
  );
}
