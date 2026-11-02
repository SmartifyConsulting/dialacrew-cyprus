import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown } from "lucide-react";
import { useBookings, useCrewGroups } from "@/lib/db";
import { useLocationPoints } from "@/lib/site";
import { fmtMoney, zar, type Production } from "@/lib/demo-data";
import { crewFitsRole, useCrewRequiredDay, useCrewRoleList, type CrewRequiredMatch } from "@/components/site/SiteTabs";
import { useScenarios, scenarioKey, type Scenario } from "@/components/site/ScenarioPlanner";

const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const localYmd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
const ghost = "inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary disabled:opacity-50";
const SIZE_TIERS = ["Small", "Medium", "Large", "Extra-Large"] as const;

type Candidate = { id: string; name: string; role: string; dayRate: number };

function CandidatePopover({ candidates, onSelect, currency }: { candidates: Candidate[]; onSelect: (c: Candidate) => void; currency?: string | undefined }) {
  return (
    <div className="absolute right-0 top-full z-20 mt-1 w-64 max-h-64 space-y-1 overflow-y-auto rounded-sm border border-border bg-card p-2 shadow-md">
      {candidates.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2 text-xs">
          <span className="min-w-0">
            <span className="font-medium">{c.name}</span>{c.role && <span className="text-muted-foreground"> · {c.role}</span>}
            <span className="block text-muted-foreground">{fmtMoney(c.dayRate, currency)} / day</span>
          </span>
          <button onClick={() => onSelect(c)} className="shrink-0 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Select</button>
        </div>
      ))}
      {candidates.length === 0 && <p className="whitespace-nowrap p-1 text-xs text-muted-foreground">No available crew for this role.</p>}
    </div>
  );
}

// One day's role × scenario table: Role column, Scenario 1 (Crew Required's real bookings), then
// one column per Sandbox scenario, then an Add Scenario column. Rows line up natively since
// they're real table rows — no manual row-height matching needed.
function DayTable({ p, date, roleList, newRole, setNewRole, addRole, removeRole }: {
  p: Production; date: string; roleList: string[]; newRole: string; setNewRole: (s: string) => void; addRole: () => void; removeRole: (role: string) => void;
}) {
  const req = useCrewRequiredDay(p, date, roleList);
  const sc = useScenarios(p, date, roleList);
  const [pickKey, setPickKey] = useState<string | null>(null); // "s1:<role>" or "<scenarioId>:<role>"

  const s1Candidates = (role: string, matches: CrewRequiredMatch[]): Candidate[] =>
    req.candidatesFor(role, matches).map((c) => ({ id: c.id, name: c.name, role: c.role, dayRate: c.dayRate }));
  const scCandidates = (s: Scenario, role: string, excludeId?: string): Candidate[] =>
    sc.candidatesFor(s, role, excludeId).map((c) => ({ id: c.id, name: c.name, role: c.role, dayRate: c.dayRate }));

  // Select Crew Mix on Scenario 1 pencils each available member of that mix into whichever open role they fit.
  async function applyMixToS1(group: { name: string; memberIds: string[] }) {
    let count = 0;
    for (const id of group.memberIds) {
      const candidate = req.crew.find((c) => c.id === id);
      if (!candidate) continue;
      const role = roleList.find((r) => !req.isConfirmed(r) && req.byRole(r).length === 0 && crewFitsRole(candidate, r));
      if (!role) continue;
      await req.pencil(role, id, [], true);
      count++;
    }
    toast.success(count ? `${group.name}: pencilled ${count} role${count === 1 ? "" : "s"}` : `${group.name}: no matching open roles`);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          {/* Role column + Scenario 1 + every Sandbox scenario + Add Scenario, all equal width. */}
          {Array.from({ length: 3 + sc.scenarios.length }).map((_, i) => (
            <col key={i} style={{ width: `${100 / (3 + sc.scenarios.length)}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-border">
            <th className="min-w-[13rem] px-3 py-2 text-left"><span className="font-display text-sm font-semibold uppercase tracking-wide text-primary">Crew Required</span></th>
            <th className="min-w-[17rem] border-l-2 border-border px-3 py-2 text-left">
              <div className="flex items-center gap-2">
                <span className="flex-1 font-display text-sm font-semibold uppercase tracking-wide text-primary">Scenario 1</span>
                <select className="shrink-0 rounded-sm bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground" value=""
                  onChange={(e) => { const g = sc.crewMixes.find((x) => x.id === e.target.value); if (g) applyMixToS1(g); }} aria-label="Select Crew Mix for Scenario 1">
                  <option value="" disabled>Select Crew Mix</option>
                  {sc.crewMixes.length === 0 && <option value="" disabled>No crew mixes saved yet</option>}
                  {sc.crewMixes.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.memberIds.length}){g.productionType ? ` · ${g.productionType}` : ""}</option>)}
                </select>
              </div>
            </th>
            {sc.scenarios.map((s) => (
              <th key={s.id} className="min-w-[17rem] px-3 py-2 text-left">
                <div className="flex items-center gap-2">
                  <input defaultValue={s.name} onBlur={(e) => sc.renameScenario(s, e.target.value)} maxLength={80} aria-label="Scenario name"
                    className="min-w-0 flex-1 bg-transparent font-display text-sm font-semibold uppercase tracking-wide text-primary outline-none" />
                  <select className="shrink-0 rounded-sm bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground" value=""
                    onChange={(e) => { const g = sc.crewMixes.find((x) => x.id === e.target.value); if (g) sc.applyGroupToScenario(s, g); }} aria-label={`Select Crew Mix for ${s.name}`}>
                    <option value="" disabled>Select Crew Mix</option>
                    {sc.crewMixes.length === 0 && <option value="" disabled>No crew mixes saved yet</option>}
                    {sc.crewMixes.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.memberIds.length}){g.productionType ? ` · ${g.productionType}` : ""}</option>)}
                  </select>
                  <button onClick={() => sc.deleteScenario(s.id)} aria-label={`Delete ${s.name}`} className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </th>
            ))}
            <th className="min-w-[11rem] px-3 py-2 text-left">
              <button onClick={sc.createScenario} className={ghost}><Plus className="h-3.5 w-3.5" /> Add Scenario {sc.scenarios.length + 2}</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {roleList.map((role) => {
            const matches = req.byRole(role);
            const s1Key = `s1:${role}`;
            return (
              <tr key={role} className="border-b border-border">
                <td className="px-3 py-2.5 align-top">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{role}</span>
                    <button onClick={() => removeRole(role)} aria-label={`Remove ${role}`} className="shrink-0 font-bold text-destructive">−</button>
                  </div>
                </td>
                <td className="border-l-2 border-border px-3 py-2.5 align-top">
                  {req.isConfirmed(role) ? <span className="text-xs text-success">Confirmed</span> : (
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                        {matches.length === 0 ? "Unassigned" : matches.map((m) => (
                          <span key={m.id} className="mr-3 inline-flex items-center gap-1">
                            <span className="truncate">{m.name}</span>
                            <button onClick={() => req.cancelPencil(m.id, m.name)} aria-label={`Remove ${m.name} from ${role}`} className="font-bold text-destructive">−</button>
                          </span>
                        ))}
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{matches.map((m) => zar(m.rate)).join(", ")}</span>
                      <div className="relative shrink-0">
                        <button onClick={() => setPickKey(pickKey === s1Key ? null : s1Key)} className="inline-flex items-center rounded-sm bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
                          {matches.length === 0 ? "Find" : "Swap"}
                        </button>
                        {pickKey === s1Key && (
                          <CandidatePopover currency={p.currency} candidates={s1Candidates(role, matches)}
                            onSelect={(c) => { req.pencil(role, c.id, matches.map((m) => m.id)); setPickKey(null); }} />
                        )}
                      </div>
                    </div>
                  )}
                </td>
                {sc.scenarios.map((s) => {
                  const assigned = sc.assignedForRole(s, role);
                  const key = `${s.id}:${role}`;
                  return (
                    <td key={s.id} className="px-3 py-2.5 align-top">
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                          {assigned ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="truncate">{assigned.name}</span>
                              <button onClick={() => sc.removeFromScenario(s, assigned.id, assigned.name)} aria-label={`Remove ${assigned.name} from ${role}`} className="font-bold text-destructive">−</button>
                            </span>
                          ) : "Unassigned"}
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{assigned ? zar(assigned.dayRate) : ""}</span>
                        <div className="relative shrink-0">
                          <button onClick={() => setPickKey(pickKey === key ? null : key)} className="inline-flex items-center rounded-sm bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
                            {assigned ? "Swap" : "Find"}
                          </button>
                          {pickKey === key && (
                            <CandidatePopover currency={p.currency} candidates={scCandidates(s, role, assigned?.id)}
                              onSelect={(c) => { sc.selectForRole(s, role, c.id, assigned?.id ?? null); setPickKey(null); }} />
                          )}
                        </div>
                      </div>
                    </td>
                  );
                })}
                <td />
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className="px-3 py-3 align-top">
              <div className="flex items-center gap-2">
                <input value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRole())}
                  placeholder="Add a role" className="min-w-0 flex-1 rounded-sm border border-input bg-background px-2 py-1.5 text-sm" />
                <button onClick={addRole} className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary">+ Add role</button>
              </div>
            </td>
            <td className="border-l-2 border-border px-3 py-3 align-top text-xs"><span className="text-muted-foreground">Total:</span> <b>{fmtMoney(req.dayTotal, p.currency)}</b></td>
            {sc.scenarios.map((s) => (
              <td key={s.id} className="space-y-2 px-3 py-3 align-top">
                <div className="text-xs"><span className="text-muted-foreground">Total:</span> <b>{fmtMoney(sc.totalFor(s), p.currency)}</b></div>
                <button onClick={() => sc.commit(s)} disabled={sc.committing} className={`${ghost} w-full justify-center`}>Pencil this scenario</button>
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Crew Required + Sandbox, one independent workspace per shoot day. A producer fills each day on
// its own (crew can differ day to day); Copy to: carries one day's pencils and scenarios across
// to whichever other days are ticked, instead of starting from scratch every time.
export function CrewDayPlanner({ p }: { p: Production }) {
  const qc = useQueryClient();
  const locationPoints = useLocationPoints(p.id).data ?? [];
  const allBookings = useBookings().data ?? [];
  const groups = useCrewGroups().data ?? [];
  const sizeTypes = SIZE_TIERS.map((tier) => groups.find((g) => g.sizeTier === tier)).filter((g): g is NonNullable<typeof g> => !!g);
  const roles = useCrewRoleList(p);
  const [copying, setCopying] = useState<string | null>(null);
  const [copyOpenFor, setCopyOpenFor] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const days = Math.max(1, p.days || 1);
  const shootDays = useMemo(() => {
    const fromLocations = [...new Set(locationPoints.filter((pt) => pt.starts_at).map((pt) => localYmd(pt.starts_at!)))].sort();
    if (fromLocations.length) return fromLocations;
    if (p.date) return Array.from({ length: days }, (_, i) => addDays(p.date!, i));
    return [];
  }, [locationPoints, p.date, days]);

  const productionBookings = allBookings.filter((b) => b.productionId === p.id && b.status !== "cancelled");
  const costOf = (b: (typeof productionBookings)[number]) => b.crewRate * Math.max(1, b.days || 1);
  const totalPencilled = productionBookings.reduce((sum, b) => sum + costOf(b), 0);
  const variance = p.budget - totalPencilled;

  // Select Crew Type (a size tier) applies at the day level: pencil each member of that tier's
  // group into whichever open role they fit on this specific day.
  async function applySizeType(day: string, group: { name: string; memberIds: string[] }) {
    const [{ data: crewRows }, { data: existing }] = await Promise.all([
      supabase.from("crew_members").select("id, name, role, department, day_rate").in("id", group.memberIds),
      supabase.from("bookings").select("role").eq("production_id", p.id).eq("booking_date", day).neq("status", "cancelled"),
    ]);
    const takenRoles = new Set((existing ?? []).map((b) => b.role.toLowerCase()));
    let count = 0;
    for (const c of crewRows ?? []) {
      const role = roles.roleList.find((r) => !takenRoles.has(r.toLowerCase()) && crewFitsRole({ role: c.role, department: c.department }, r));
      if (!role) continue;
      const { error } = await supabase.from("bookings").insert({ production_id: p.id, crew_id: c.id, role, status: "pencil", booking_date: day, crew_rate: Number(c.day_rate), client_charge: Number(c.day_rate), days: 1 });
      if (!error) { takenRoles.add(role.toLowerCase()); count++; }
    }
    toast.success(count ? `${group.name}: pencilled ${count} role${count === 1 ? "" : "s"}` : `${group.name}: no matching open roles`);
    ["production-checklist", "bookings", "production-open-gigs"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  function openCopy(day: string) {
    setCopyOpenFor(copyOpenFor === day ? null : day);
    setCopyTargets(new Set());
  }
  function toggleTarget(day: string) {
    setCopyTargets((prev) => { const n = new Set(prev); if (n.has(day)) n.delete(day); else n.add(day); return n; });
  }
  function toggleSelectAll(others: string[]) {
    setCopyTargets((prev) => (prev.size === others.length ? new Set() : new Set(others)));
  }

  async function copyDay(fromDate: string, toDates: string[]) {
    setCopying(fromDate);
    try {
      const [{ data: bookings, error: bErr }, { data: scenarios, error: sErr }] = await Promise.all([
        supabase.from("bookings").select("crew_id, role, status, crew_rate, client_charge").eq("production_id", p.id).eq("booking_date", fromDate).neq("status", "cancelled"),
        supabase.from("brief_matches").select("brief, result").eq("client", scenarioKey(p.id, fromDate)),
      ]);
      if (bErr) throw bErr;
      if (sErr) throw sErr;
      for (const toDate of toDates) {
        if (bookings?.length) {
          const rows = bookings.map((b) => ({
            production_id: p.id, crew_id: b.crew_id, role: b.role, status: b.status, booking_date: toDate,
            crew_rate: b.crew_rate, client_charge: b.client_charge, days: 1,
          }));
          const { error } = await supabase.from("bookings").insert(rows);
          if (error) throw error;
        }
        if (scenarios?.length) {
          const rows = scenarios.map((s) => ({ client: scenarioKey(p.id, toDate), brief: s.brief, result: s.result }));
          const { error } = await supabase.from("brief_matches").insert(rows);
          if (error) throw error;
        }
      }
      toast.success(toDates.length > 1 ? `Copied ${dayLabel(fromDate)} to ${toDates.length} day(s)` : `Copied ${dayLabel(fromDate)} to ${dayLabel(toDates[0]!)}`);
      ["production-checklist", "bookings", "scenarios"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setCopying(null); setCopyOpenFor(null); }
  }

  if (shootDays.length === 0) {
    return <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">Set this production's start date (or add a location with a date) to start planning crew by shoot day.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-border bg-card p-3 text-sm">
        <span className="text-muted-foreground">Pencilled across the whole production:</span> <b>{fmtMoney(totalPencilled, p.currency)}</b>{" "}
        <span className={variance < 0 ? "text-destructive" : "text-success"}>({variance < 0 ? `${fmtMoney(-variance, p.currency)} over` : `${fmtMoney(variance, p.currency)} under`} budget of {fmtMoney(p.budget, p.currency)})</span>
      </div>
      {shootDays.map((day, i) => {
        const dayTotal = productionBookings.filter((b) => b.bookingDate === day).reduce((sum, b) => sum + costOf(b), 0);
        const otherDays = shootDays.filter((d) => d !== day);
        const isCollapsed = collapsed.has(day) !== (i === 0); // day 0 open by default, rest collapsed
        const toggleDay = () => setCollapsed((prev) => { const n = new Set(prev); if (n.has(day)) n.delete(day); else n.add(day); return n; });
        return (
          <section key={day} className="rounded-sm border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-primary bg-primary px-4 py-2.5 text-primary-foreground">
              <button type="button" onClick={toggleDay} className="flex min-w-0 items-center gap-2">
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                <span className="truncate font-display text-sm font-semibold uppercase tracking-wide">Day {i + 1} · {dayLabel(day)}</span>
                <span className="shrink-0 text-xs font-normal opacity-90">{fmtMoney(dayTotal, p.currency)} pencilled</span>
              </button>
              <div className="flex items-center gap-2">
                <select disabled={sizeTypes.length === 0} value=""
                  onChange={(e) => { const g = sizeTypes.find((x) => x.id === e.target.value); if (g) applySizeType(day, g); }}
                  className="rounded-sm border border-white bg-transparent px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" aria-label="Select Crew Type">
                  <option value="" disabled>Select Crew Type</option>
                  {sizeTypes.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.memberIds.length})</option>)}
                </select>
                {shootDays.length > 1 && (
                  <div className="relative">
                    <button disabled={copying === day} onClick={() => openCopy(day)}
                      className="inline-flex items-center gap-1 rounded-sm border border-white/40 px-2 py-1 text-xs text-primary-foreground hover:bg-white/10 disabled:opacity-50">
                      <Copy className="h-3 w-3" /> Copy to…
                    </button>
                    {copyOpenFor === day && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-sm border border-border bg-card p-3 text-foreground shadow-md">
                        <label className="flex items-center gap-2 border-b border-border pb-2 text-xs font-semibold">
                          <input type="checkbox" checked={copyTargets.size === otherDays.length} onChange={() => toggleSelectAll(otherDays)} className="accent-primary" />
                          Select all
                        </label>
                        <ul className="max-h-48 space-y-1 overflow-y-auto py-2">
                          {otherDays.map((d) => (
                            <li key={d}>
                              <label className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={copyTargets.has(d)} onChange={() => toggleTarget(d)} className="accent-primary" />
                                Day {shootDays.indexOf(d) + 1} · {dayLabel(d)}
                              </label>
                            </li>
                          ))}
                        </ul>
                        <button disabled={copying === day || copyTargets.size === 0} onClick={() => copyDay(day, [...copyTargets])}
                          className="w-full rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">
                          {copying === day ? "Copying…" : `Copy to ${copyTargets.size || ""} day${copyTargets.size === 1 ? "" : "s"}`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            {!isCollapsed && (
              <DayTable p={p} date={day} roleList={roles.roleList} newRole={roles.newRole} setNewRole={roles.setNewRole} addRole={roles.addRole} removeRole={roles.removeRole} />
            )}
          </section>
        );
      })}
    </div>
  );
}
