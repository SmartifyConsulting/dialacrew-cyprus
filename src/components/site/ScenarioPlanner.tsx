import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Save, Trash2, Star, CheckCircle2, Plus, ArrowLeftRight, Users, AlertTriangle, Copy } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useBookings, useCrew, useCrewGroups } from "@/lib/db";
import { useLocationPoints } from "@/lib/site";
import { matchBrief, type MatchResult } from "@/lib/memory.functions";
import { providerTotal } from "@/lib/costing";
import { useAiUnlocked } from "@/lib/ai-access";
import { fmtMoney, zar, type Production } from "@/lib/demo-data";

type Selection = Record<string, string[]>; // crewId -> selected asset ids
type SelectionByDay = Record<string, Selection>; // YYYY-MM-DD -> that day's selection
type Asset = { id: string; crew_id: string; name: string; category: string; daily_fee: number };
type Scenario = { id: string; name: string; selByDay: SelectionByDay; total: number; created_at: string };

const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
const localYmd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const btn = "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const ghost = "inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary";

/** Scenario key: drafts for a production are stored as brief_matches rows under this client key. */
export const scenarioKey = (productionId: string) => `scenario:${productionId}`;

/** Cost of one day's selection: each chosen crew member's day rate × days plus their chosen kit fees × days. */
export function scenarioCost(sel: Selection, days: number, rates: Record<string, number>, fees: Record<string, number>) {
  return Object.entries(sel).reduce((sum, [crewId, kit]) =>
    sum + providerTotal(rates[crewId] ?? 0, days, kit.map((a) => ({ dailyFee: fees[a] ?? 0, days }))), 0);
}

/** Cost across every shoot day, since each day can now carry a different crew/kit selection. */
function scenarioCostAllDays(selByDay: SelectionByDay, rates: Record<string, number>, fees: Record<string, number>) {
  return Object.values(selByDay).reduce((sum, sel) => sum + scenarioCost(sel, 1, rates, fees), 0);
}

export function ScenarioPlanner({ p }: { p: Production }) {
  const qc = useQueryClient();
  const match = useServerFn(matchBrief);
  const crew = useCrew().data ?? [];
  const allBookings = useBookings().data ?? [];
  const locationPoints = useLocationPoints(p.id).data ?? [];
  const aiUnlocked = useAiUnlocked();
  const days = Math.max(1, p.days || 1);

  // One subtab per shoot day — from this production's scheduled locations where possible (real
  // dates), falling back to an evenly spaced range from the production's own start date.
  const shootDays = useMemo(() => {
    const fromLocations = [...new Set(locationPoints.filter((pt) => pt.starts_at).map((pt) => localYmd(pt.starts_at!)))].sort();
    if (fromLocations.length) return fromLocations;
    if (p.date) return Array.from({ length: days }, (_, i) => addDays(p.date!, i));
    return [];
  }, [locationPoints, p.date, days]);
  const blankSelByDay = (): SelectionByDay => Object.fromEntries(shootDays.map((d) => [d, {}]));

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
    queryKey: ["scenarios", p.id, shootDays.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("brief_matches").select("id, brief, result, created_at").eq("client", scenarioKey(p.id)).order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => {
        const result = r.result as { selection?: Selection; selByDay?: SelectionByDay; total: number };
        const selByDay = result.selByDay ?? Object.fromEntries(shootDays.map((d) => [d, result.selection ?? {}]));
        return { id: r.id, name: r.brief, created_at: r.created_at, selByDay, total: result.total } as Scenario;
      });
    },
  });

  const [selByDay, setSelByDay] = useState<SelectionByDay>(blankSelByDay);
  const [activeDay, setActiveDay] = useState<string>(shootDays[0] ?? "");
  const [name, setName] = useState("Option A");
  const [brief, setBrief] = useState(p.summary ?? "");
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<MatchResult | null>(null);
  const [filter, setFilter] = useState("");
  const [activeId, setActiveId] = useState<string>(""); // "" = new scenario
  const [committing, setCommitting] = useState(false);
  const groups = useCrewGroups().data ?? [];
  const [mixOpen, setMixOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [mixNotice, setMixNotice] = useState<{ name: string; total: number; unavailable: string[] } | null>(null);

  const sel = selByDay[activeDay] ?? {};
  const setSel = (updater: Selection | ((prev: Selection) => Selection)) => {
    setSelByDay((prev) => ({ ...prev, [activeDay]: typeof updater === "function" ? (updater as (p: Selection) => Selection)(prev[activeDay] ?? {}) : updater }));
  };

  const rates = useMemo(() => Object.fromEntries(crew.map((c) => [c.id, c.dayRate])), [crew]);
  const fees = useMemo(() => Object.fromEntries((assets.data ?? []).map((a) => [a.id, a.daily_fee])), [assets.data]);
  const kitBy = useMemo(() => {
    const m: Record<string, Asset[]> = {};
    for (const a of assets.data ?? []) (m[a.crew_id] ??= []).push(a);
    return m;
  }, [assets.data]);
  const crewName = (id: string) => crew.find((c) => c.id === id)?.name ?? "Unknown";
  const total = scenarioCostAllDays(selByDay, rates, fees);
  const variance = p.budget - total;

  const toggleCrew = (id: string) => setSel((s) => { const n = { ...s }; if (n[id]) delete n[id]; else n[id] = []; return n; });
  const toggleKit = (crewId: string, assetId: string) => setSel((s) => {
    const cur = s[crewId] ?? [];
    return { ...s, [crewId]: cur.includes(assetId) ? cur.filter((x) => x !== assetId) : [...cur, assetId] };
  });
  function applyDayToAll() {
    if (shootDays.length < 2) return;
    setSelByDay((prev) => Object.fromEntries(shootDays.map((d) => [d, prev[activeDay] ?? {}])));
    toast.success(`Applied ${dayLabel(activeDay)}'s crew to every other day`);
  }

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
    if (!Object.values(selByDay).some((s) => Object.keys(s).length)) { toast.error("Select at least one crew member."); return; }
    const clean = name.trim() || "Untitled option";
    const dup = scenarios.data?.find((x) => x.name.toLowerCase() === clean.toLowerCase() && x.id !== activeId);
    if (dup) { toast.error(`"${clean}" already exists — pick it from the list to update it, or use another name.`); return; }
    const result = { selByDay, total };
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
    setActiveDay(shootDays[0] ?? "");
    if (!id) { setSelByDay(blankSelByDay()); setName(`Option ${String.fromCharCode(65 + Math.min(scenarios.data?.length ?? 0, 25))}`); return; }
    const s = scenarios.data?.find((x) => x.id === id);
    if (s) { setSelByDay(s.selByDay); setName(s.name); }
  }
  function swap(from: string, to: string) {
    if (!to) return;
    setSel((s) => { const n = { ...s }; delete n[from]; n[to] = []; return n; });
    toast.success(`Swapped ${crewName(from)} for ${crewName(to)}`);
  }
  // Apply a saved Crew Combos: add every available member to the active day, and flag whoever's
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
  // Commit: pencil the chosen group's crew + kit on the production (one booking per contiguous
  // run of days a crew member is on, since different days can now carry different people), then
  // drop the other sandbox options.
  async function commit(s: Scenario) {
    if (!(await confirmDialog(`Commit "${s.name}"? Its crew will be pencilled in and the other options removed.`))) return;
    setCommitting(true);
    try {
      const byCrew = new Map<string, string[]>();
      for (const day of shootDays) {
        for (const crewId of Object.keys(s.selByDay[day] ?? {})) {
          if (!byCrew.has(crewId)) byCrew.set(crewId, []);
          byCrew.get(crewId)!.push(day);
        }
      }
      const rows: { production_id: string; crew_id: string; role: string; status: "pencil"; booking_date: string; crew_rate: number; client_charge: number; days: number }[] = [];
      const kitForRow: string[][] = [];
      for (const [crewId, assignedDays] of byCrew) {
        let runStart = assignedDays[0]!, prev = assignedDays[0]!, kit = s.selByDay[runStart]?.[crewId] ?? [];
        const flush = (start: string, end: string, k: string[]) => {
          const len = Math.round((+new Date(`${end}T00:00:00`) - +new Date(`${start}T00:00:00`)) / 86400000) + 1;
          rows.push({ production_id: p.id, crew_id: crewId, role: crew.find((c) => c.id === crewId)?.role ?? "Crew", status: "pencil", booking_date: start, crew_rate: rates[crewId] ?? 0, client_charge: rates[crewId] ?? 0, days: len });
          kitForRow.push(k);
        };
        for (let i = 1; i <= assignedDays.length; i++) {
          const d = assignedDays[i];
          if (d && addDays(prev, 1) === d) { prev = d; continue; }
          flush(runStart, prev, kit);
          if (d) { runStart = d; prev = d; kit = s.selByDay[d]?.[crewId] ?? []; }
        }
      }
      const { data: made, error } = await supabase.from("bookings").insert(rows).select("id");
      if (error) throw error;
      const kitRows = (made ?? []).flatMap((b, i) => (kitForRow[i] ?? []).map((a) => ({ booking_id: b.id, asset_id: a, daily_fee: fees[a] ?? 0, days: rows[i]!.days })));
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
      <Panel title={`Sandbox · ${shootDays.length || days} day(s)`} right={<input className="w-40 rounded-sm border border-input bg-background px-2 py-1 text-xs" placeholder="Filter crew" value={filter} onChange={(e) => setFilter(e.target.value)} />}>
        {/* Options: cards you click to switch between, instead of a dropdown + a separate comparison table. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          {(scenarios.data ?? []).map((s) => {
            const cost = scenarioCostAllDays(s.selByDay, rates, fees);
            const crewCount = new Set(Object.values(s.selByDay).flatMap((d) => Object.keys(d))).size;
            return (
              <button key={s.id} onClick={() => pick(s.id)}
                className={`rounded-sm border px-3 py-2 text-left text-xs ${activeId === s.id ? "border-primary bg-primary/10" : "border-border hover:border-primary"}`}>
                <div className="font-semibold">{s.name}</div>
                <div className="text-muted-foreground">{crewCount} crew · {zar(cost)}</div>
              </button>
            );
          })}
          <button onClick={() => pick("")} className={ghost}><Plus className="h-3 w-3" /> New option</button>
          <input className="min-w-40 flex-1 rounded-sm border border-input bg-background px-2 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="Option name" placeholder="Option name" />
          {aiUnlocked && (
            <div className="relative">
              <button className={ghost} onClick={() => setSuggestOpen(!suggestOpen)}><Sparkles className="h-3 w-3" /> Suggest crew & kit</button>
              {suggestOpen && (
                <div className="absolute right-0 z-20 mt-1 w-72 space-y-2 rounded-sm border border-border bg-card p-3 shadow-md">
                  <textarea className={`${field} min-h-20 text-xs`} maxLength={4000} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Describe the brief: look, shots, crew size…" />
                  <button onClick={async () => { await suggest(); setSuggestOpen(false); }} disabled={busy} className={`${ghost} w-full justify-center`}><Sparkles className="h-3.5 w-3.5" />{busy ? "Matching…" : "Suggest crew & kit"}</button>
                  {ai?.warnings.length ? <ul className="list-disc pl-5 text-xs text-destructive">{ai.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
                </div>
              )}
            </div>
          )}
          <div className="relative">
            <button className={ghost} onClick={() => setMixOpen(!mixOpen)}><Users className="h-3 w-3" /> Crew Combos</button>
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
        {/* Day subtabs: each shoot day gets its own crew selection. */}
        {shootDays.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2">
            {shootDays.map((d, i) => (
              <button key={d} onClick={() => setActiveDay(d)}
                className={`rounded-sm px-2 py-1 text-xs font-semibold ${activeDay === d ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                Day {i + 1} · {dayLabel(d)}
              </button>
            ))}
            {shootDays.length > 1 && <button onClick={applyDayToAll} className={`${ghost} ml-auto`}><Copy className="h-3 w-3" /> Apply this day's crew to all days</button>}
          </div>
        )}
        {mixNotice && (
          <div className="border-b border-border bg-primary/5 p-3 text-xs">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <div className="flex-1">
                {mixNotice.unavailable.length === 0 ? (
                  <span>"{mixNotice.name}" added — everyone in this combo is available for these dates.</span>
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
        <div className="border-b border-border px-4 py-3"><BudgetBar used={total} budget={p.budget} currency={p.currency} /></div>
        <ul className="max-h-[520px] divide-y divide-border overflow-y-auto">
          {shown.map((c) => {
            const on = !!sel[c.id];
            const kit = kitBy[c.id] ?? [];
            const line = on ? providerTotal(c.dayRate, 1, (sel[c.id] ?? []).map((a) => ({ dailyFee: fees[a] ?? 0, days: 1 }))) : 0;
            return (
              <li key={c.id} className={`px-4 py-2.5 ${on ? "bg-primary/5" : ""}`}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={on} onChange={() => toggleCrew(c.id)} className="h-4 w-4 accent-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{c.name} <span className="font-normal text-muted-foreground">· {aiWhy[c.id]?.suggested_role ?? c.role}</span></div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 text-primary" /> {c.rating.toFixed(1)} · {zar(c.dayRate)}/day ·{" "}
                      <span className={c.available && availableForRange(c.id) ? "text-success" : "text-destructive"}>
                        {c.available && availableForRange(c.id) ? `Available ${rangeStart ? "for these dates" : ""}` : "Unavailable"}
                      </span>
                    </div>
                    {aiWhy[c.id]
                      ? <div className="mt-1 rounded-sm bg-primary/10 px-2 py-1.5 text-xs text-foreground"><span className="font-semibold">Why the AI picked {c.name}:</span> {aiWhy[c.id]?.why || "No reason was given. Check before selecting."}</div>
                      : null}
                  </div>
                  {on && <span className="text-sm font-semibold">{zar(line)}<span className="font-normal text-muted-foreground"> / this day</span></span>}
                </label>
                {on && (
                  <div className="ml-7 mt-2 flex items-center gap-2 text-xs">
                    <ArrowLeftRight className="h-3 w-3 text-muted-foreground" />
                    <select className="rounded-sm border border-input bg-background px-2 py-1 text-xs" value="" onChange={(e) => swap(c.id, e.target.value)} aria-label={`Swap ${c.name}`}>
                      <option value="">Swap for…</option>
                      {crew.filter((o) => !sel[o.id] && o.id !== c.id).sort((a, b) => Number(b.department === c.department) - Number(a.department === c.department)).map((o) => (
                        <option key={o.id} value={o.id}>{`${o.name} · ${o.role} · ${zar(o.dayRate)}/day${(kitBy[o.id] ?? []).length ? ` · Gear: ${(kitBy[o.id] ?? []).map((a) => a.name).join(", ")}` : " · No gear listed"}`}</option>
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
            <div><span className="text-muted-foreground">Estimate:</span> <b>{fmtMoney(total, p.currency)}</b> across {shootDays.length || days} day(s)</div>
            <div className={`text-xs ${variance < 0 ? "text-destructive" : "text-success"}`}>{variance < 0 ? `${fmtMoney(-variance, p.currency)} over` : `${fmtMoney(variance, p.currency)} under`} budget of {fmtMoney(p.budget, p.currency)}</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={save} className={btn}><Save className="h-4 w-4" /> {activeId ? "Update option" : "Save option"}</button>
            {activeId && <button className={ghost} disabled={committing} onClick={() => { const s = scenarios.data?.find((x) => x.id === activeId); if (s) commit(s); }}><CheckCircle2 className="h-3.5 w-3.5" /> Commit</button>}
            {activeId && <button className={ghost} aria-label="Delete option" onClick={() => remove(activeId)}><Trash2 className="h-3.5 w-3.5" /> Delete</button>}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** Budget usage %: green under 85%, amber 85–100%, red over budget. */
export function budgetPct(used: number, budget: number) { return budget > 0 ? Math.round((used / budget) * 100) : 0; }

function BudgetBar({ used, budget, compact, currency = "ZAR" }: { used: number; budget: number; compact?: boolean; currency?: string | undefined }) {
  const pct = budgetPct(used, budget);
  const tone = pct > 100 ? "bg-destructive" : pct >= 85 ? "bg-chart-3" : "bg-success";
  return (
    <div>
      {!compact && <div className="mb-1 flex justify-between text-xs"><span className="text-muted-foreground">Budget used</span><span className="font-semibold">{pct}% · {fmtMoney(used, currency)} of {fmtMoney(budget, currency)}</span></div>}
      <div className={`${compact ? "h-1.5" : "h-2.5"} overflow-hidden rounded-full bg-muted`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {compact && <div className="text-[10px] font-semibold">{pct}%</div>}
    </div>
  );
}
