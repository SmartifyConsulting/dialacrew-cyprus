import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useBookings, useCrew, useCrewGroups } from "@/lib/db";
import { providerTotal } from "@/lib/costing";
import { fmtMoney, zar, type Production } from "@/lib/demo-data";
import { crewFitsRole } from "@/components/site/SiteTabs";

const ROW = "flex items-center gap-2 px-3 min-h-[3.5rem] border-b border-border last:border-b-0";

type Selection = Record<string, string[]>; // crewId -> selected asset ids
type SelectionByDay = Record<string, Selection>; // YYYY-MM-DD -> that day's selection
type Scenario = { id: string; name: string; selByDay: SelectionByDay; total: number; created_at: string };

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ghost = "inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary";

/** Scenario key: a shoot day's drafts are stored as brief_matches rows under this client key. */
export const scenarioKey = (productionId: string, date: string) => `scenario:${productionId}:${date}`;

/** Cost of one day's selection: each chosen crew member's day rate × days plus their chosen kit fees × days. */
export function scenarioCost(sel: Selection, days: number, rates: Record<string, number>, fees: Record<string, number>) {
  return Object.entries(sel).reduce((sum, [crewId, kit]) =>
    sum + providerTotal(rates[crewId] ?? 0, days, kit.map((a) => ({ dailyFee: fees[a] ?? 0, days }))), 0);
}

/** Cost across every shoot day, since each day can now carry a different crew/kit selection. */
function scenarioCostAllDays(selByDay: SelectionByDay, rates: Record<string, number>, fees: Record<string, number>) {
  return Object.values(selByDay).reduce((sum, sel) => sum + scenarioCost(sel, 1, rates, fees), 0);
}

// Sandbox: alternative crew line-ups for one shoot day, laid out as columns next to that day's
// Crew Required (which is scenario 1 for all practical purposes), numbered from 2. Every action
// here writes straight to the saved scenario — there's no separate draft/save step, it's a live workspace.
export function ScenarioPlanner({ p, date, roleList }: { p: Production; date: string; roleList: string[] }) {
  const qc = useQueryClient();
  const crew = useCrew().data ?? [];
  const allBookings = useBookings().data ?? [];
  const days = Math.max(1, p.days || 1);
  const shootDays = useMemo(() => [date], [date]);
  const blankSelByDay = (): SelectionByDay => ({ [date]: {} });

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
    queryFn: async () => { const { data, error } = await supabase.from("crew_assets").select("id, crew_id, name, category, daily_fee"); if (error) throw error; return (data ?? []).map((a) => ({ ...a, daily_fee: Number(a.daily_fee) })); },
  });
  const scenarios = useQuery({
    queryKey: ["scenarios", p.id, date],
    queryFn: async () => {
      const { data, error } = await supabase.from("brief_matches").select("id, brief, result, created_at").eq("client", scenarioKey(p.id, date)).order("created_at");
      if (error) throw error;
      return (data ?? []).map((r) => {
        const result = r.result as { selection?: Selection; selByDay?: SelectionByDay; total: number };
        const selByDay = result.selByDay ?? Object.fromEntries(shootDays.map((d) => [d, result.selection ?? {}]));
        return { id: r.id, name: r.brief, created_at: r.created_at, selByDay, total: result.total } as Scenario;
      });
    },
  });

  const groups = useCrewGroups().data ?? [];
  const sortedGroups = useMemo(() => [...groups].sort((a, b) => Number(b.productionType === p.type) - Number(a.productionType === p.type)), [groups, p.type]);
  const [committing, setCommitting] = useState(false);
  const [pickKey, setPickKey] = useState<string | null>(null); // `${scenarioId}:${role}`

  const rates = useMemo(() => Object.fromEntries(crew.map((c) => [c.id, c.dayRate])), [crew]);
  const fees = useMemo(() => Object.fromEntries((assets.data ?? []).map((a) => [a.id, a.daily_fee])), [assets.data]);

  function crewIdsIn(s: Scenario) { return new Set(Object.values(s.selByDay).flatMap((sel) => Object.keys(sel))); }
  function assignedForRole(s: Scenario, role: string) {
    const ids = crewIdsIn(s);
    return crew.find((c) => ids.has(c.id) && crewFitsRole(c, role));
  }
  function withEveryDay(s: Scenario, fn: (day: Selection) => Selection): SelectionByDay {
    const next: SelectionByDay = {};
    for (const d of shootDays) next[d] = fn({ ...(s.selByDay[d] ?? {}) });
    return next;
  }
  async function mutateScenario(s: Scenario, nextSelByDay: SelectionByDay) {
    const total = scenarioCostAllDays(nextSelByDay, rates, fees);
    const { error } = await supabase.from("brief_matches").update({ result: { selByDay: nextSelByDay, total } }).eq("id", s.id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["scenarios", p.id, date] });
  }
  async function selectForRole(s: Scenario, role: string, newId: string, oldId: string | null) {
    const next = withEveryDay(s, (day) => { if (oldId) delete day[oldId]; day[newId] = day[newId] ?? []; return day; });
    await mutateScenario(s, next);
    setPickKey(null);
    const name = crew.find((c) => c.id === newId)?.name ?? "Crew member";
    toast.success(oldId ? `Swapped in ${name} as ${role}` : `${name} added as ${role}`);
  }
  async function removeFromScenario(s: Scenario, crewId: string, name: string) {
    const next = withEveryDay(s, (day) => { delete day[crewId]; return day; });
    await mutateScenario(s, next);
    toast.success(`${name} removed`);
  }
  async function applyGroupToScenario(s: Scenario, group: { name: string; memberIds: string[] }) {
    const unavailable: string[] = [];
    const next = withEveryDay(s, (day) => day);
    for (const id of group.memberIds) {
      const c = crew.find((x) => x.id === id);
      if (!c) continue;
      if (!c.available || !availableForRange(id)) { unavailable.push(c.name); continue; }
      for (const d of shootDays) if (next[d] && !(id in next[d]!)) next[d]![id] = [];
    }
    await mutateScenario(s, next);
    toast.success(unavailable.length ? `${group.name} added — unavailable: ${unavailable.join(", ")}` : `${group.name} added`);
  }
  async function renameScenario(s: Scenario, name: string) {
    const clean = name.trim();
    if (!clean || clean === s.name) return;
    const dup = scenarios.data?.find((x) => x.name.toLowerCase() === clean.toLowerCase() && x.id !== s.id);
    if (dup) { toast.error(`"${clean}" already exists.`); return; }
    const { error } = await supabase.from("brief_matches").update({ brief: clean }).eq("id", s.id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["scenarios", p.id, date] });
  }
  async function createScenario() {
    const nextNum = (scenarios.data?.length ?? 0) + 2;
    const { error } = await supabase.from("brief_matches").insert({ client: scenarioKey(p.id, date), brief: `Scenario ${nextNum}`, result: { selByDay: blankSelByDay(), total: 0 } });
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["scenarios", p.id, date] });
  }
  async function deleteScenario(id: string) {
    if (!(await confirmDialog("Delete this scenario?", { destructive: true }))) return;
    const { error } = await supabase.from("brief_matches").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["scenarios", p.id, date] });
  }
  // Pencil: commit the chosen scenario's crew (one booking per contiguous run of days a crew
  // member is on, since different days can carry different people), then drop the alternatives.
  async function commit(s: Scenario) {
    if (!(await confirmDialog(`Pencil "${s.name}"? Its crew will be pencilled in and the other scenarios removed.`))) return;
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
      toast.success(`"${s.name}" pencilled in`);
      ["scenarios", "bookings", "productions", "production-open-gigs"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setCommitting(false); }
  }

  return (
    <div className="flex items-start gap-4 overflow-x-auto pb-2">
      {(scenarios.data ?? []).map((s) => {
        const total = scenarioCostAllDays(s.selByDay, rates, fees);
        return (
          <div key={s.id} className="w-80 shrink-0">
            <Panel title={
              <input defaultValue={s.name} onBlur={(e) => renameScenario(s, e.target.value)} maxLength={80}
                className="w-full bg-transparent font-display text-sm font-semibold uppercase tracking-wide text-primary outline-none" aria-label="Scenario name" />
            } right={
              <div className="flex shrink-0 items-center gap-2">
                <select className="min-w-0 rounded-sm bg-primary px-2 py-1.5 text-[11px] font-semibold text-primary-foreground"
                  value="" onChange={(e) => { const g = sortedGroups.find((x) => x.id === e.target.value); if (g) applyGroupToScenario(s, g); }} aria-label={`Select Crew Type for ${s.name}`}>
                  <option value="" disabled>Select Crew Type</option>
                  {sortedGroups.length === 0 && <option value="" disabled>No crew templates saved yet</option>}
                  {sortedGroups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name} ({g.memberIds.length}){g.productionType ? ` · ${g.productionType}` : ""}</option>
                  ))}
                </select>
                <button onClick={() => deleteScenario(s.id)} aria-label={`Delete ${s.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            }>
              <ul className="text-sm">
                {roleList.map((role) => {
                  const assigned = assignedForRole(s, role);
                  const pickOpen = pickKey === `${s.id}:${role}`;
                  return (
                    <li key={role} className={ROW}>
                      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                        {assigned ? <>{assigned.name} · {zar(assigned.dayRate)}/day</> : "Unassigned"}
                      </span>
                      {assigned && <button onClick={() => removeFromScenario(s, assigned.id, assigned.name)} aria-label={`Remove ${assigned.name} from ${role}`} className="shrink-0 text-muted-foreground hover:text-destructive">✕</button>}
                      <div className="relative shrink-0">
                        <button onClick={() => setPickKey(pickOpen ? null : `${s.id}:${role}`)} className="inline-flex items-center rounded-sm bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
                          {assigned ? "Swap" : "Find"}
                        </button>
                        {pickOpen && (
                          <div className="absolute right-0 top-full z-20 mt-1 w-64 max-h-64 space-y-1 overflow-y-auto rounded-sm border border-border bg-card p-2 shadow-md">
                            {crew.filter((c) => crewFitsRole(c, role) && c.id !== assigned?.id && c.available && availableForRange(c.id)).map((c) => (
                              <div key={c.id} className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2 text-xs">
                                <span className="min-w-0">
                                  <span className="font-medium">{c.name}</span>{c.role && <span className="text-muted-foreground"> · {c.role}</span>}
                                  <span className="block text-muted-foreground">{fmtMoney(c.dayRate, p.currency)} / day</span>
                                </span>
                                <button onClick={() => selectForRole(s, role, c.id, assigned?.id ?? null)} className="shrink-0 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Select</button>
                              </div>
                            ))}
                            {!crew.some((c) => crewFitsRole(c, role) && c.id !== assigned?.id && c.available && availableForRange(c.id)) && <p className="whitespace-nowrap p-1 text-xs text-muted-foreground">No available crew listed as {role}.</p>}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="space-y-2 border-t border-border p-3">
                <div className="text-xs"><span className="text-muted-foreground">This day's estimate:</span> <b>{fmtMoney(total, p.currency)}</b></div>
                <button onClick={() => commit(s)} disabled={committing} className={`${ghost} w-full justify-center`}><CheckCircle2 className="h-3.5 w-3.5" /> Pencil this scenario</button>
              </div>
            </Panel>
          </div>
        );
      })}
      <div className="w-56 shrink-0 pt-9">
        <button onClick={createScenario} className={`${ghost} w-full justify-center`}><Plus className="h-3.5 w-3.5" /> Add Scenario {(scenarios.data?.length ?? 0) + 2}</button>
      </div>
    </div>
  );
}

/** Budget usage %: green under 85%, amber 85–100%, red over budget. */
export function budgetPct(used: number, budget: number) { return budget > 0 ? Math.round((used / budget) * 100) : 0; }
