import { useMemo, useState, useSyncExternalStore } from "react";
import { CREW_COUNTRIES, matchesCountry, productionCountry, setCrewCountryFilter, useCrewCountryFilter } from "@/lib/crew-country";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Copy, Pencil, Plus, Sparkles, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBookings, useCrewGroups } from "@/lib/db";
import { useLocationPoints } from "@/lib/site";
import { fmtMoney, zar, type Production } from "@/lib/demo-data";
import { crewFitsRole, useCrewRequiredDay, useCrewRoleList, type CrewRequiredMatch } from "@/components/site/SiteTabs";
import { useScenarios, scenarioKey, type Scenario } from "@/components/site/ScenarioPlanner";

const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const localYmd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
// Which sandbox the producer last pencilled for a day ("s1" or a scenario id) — remembered per browser so the
// chosen column stays highlighted (and the rest greyed out) in both the day table and the summary.
const SEL_KEY = "sandbox-selected";
const selListeners = new Set<() => void>();
const readSel = (): Record<string, string> => { try { return JSON.parse(window.localStorage.getItem(SEL_KEY) || "{}"); } catch { return {}; } };
function setSelectedSandbox(productionId: string, date: string, key: string) {
  try { window.localStorage.setItem(SEL_KEY, JSON.stringify({ ...readSel(), [`${productionId}:${date}`]: key })); } catch { /* not remembered */ }
  selListeners.forEach((l) => l());
}
function useSelectedSandbox(productionId: string, date: string): string | null {
  const raw = useSyncExternalStore((cb) => { selListeners.add(cb); return () => { selListeners.delete(cb); }; },
    () => { try { return window.localStorage.getItem(SEL_KEY) || "{}"; } catch { return "{}"; } }, () => "{}");
  try { return (JSON.parse(raw) as Record<string, string>)[`${productionId}:${date}`] ?? null; } catch { return null; }
}
const selCls = (selected: string | null, key: string) =>
  !selected ? "" : selected === key ? "bg-card ring-2 ring-inset ring-primary shadow-lg" : "opacity-50 grayscale bg-muted/40";
const ghost = "inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary disabled:opacity-50";
const SIZE_TIERS = ["Small", "Medium", "Large", "Extra-Large"] as const;

type Candidate = { id: string; name: string; role: string; dayRate: number; unavailable?: boolean; country?: string };
type RawCandidate = { id: string; name: string; role: string; dayRate: number; unavailable?: boolean; country?: string };
// Unavailable crew stay listed (a producer may reschedule for them); local crew by default.
function toCandidates(list: RawCandidate[], filter: string, local: string): Candidate[] {
  return list.filter((c) => matchesCountry(c.country, filter, local))
    .map((c) => ({ id: c.id, name: c.name, role: c.role, dayRate: c.dayRate, unavailable: !!c.unavailable, country: c.country ?? "ZA" }))
    .sort((a, b) => Number(a.unavailable) - Number(b.unavailable));
}
const onlyAvailable = (l: Candidate[]) => l.filter((c) => !c.unavailable);
const UnavailableTag = () => <span className="mt-0.5 inline-block rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">Unavailable · reschedule shoot?</span>;

function CandidatePopover({ candidates, onSelect, currency }: { candidates: Candidate[]; onSelect: (c: Candidate) => void; currency?: string | undefined }) {
  return (
    <div className="absolute right-0 top-full z-20 mt-1 w-64 max-h-64 space-y-1 overflow-y-auto rounded-sm border border-border bg-card p-2 shadow-md">
      {candidates.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2 text-xs">
          <span className="min-w-0">
            <span className="font-medium">{c.name}</span>{c.role && <span className="text-muted-foreground"> · {c.role}</span>}
            <span className="block text-muted-foreground">{fmtMoney(c.dayRate, currency)} / day · {c.country}</span>
            {c.unavailable && <UnavailableTag />}
          </span>
          <button onClick={() => { if (c.unavailable) toast.warning(`${c.name} is not free on these dates — you will need to reschedule the shoot.`); onSelect(c); }} className="shrink-0 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Select</button>
        </div>
      ))}
      {candidates.length === 0 && <p className="whitespace-nowrap p-1 text-xs text-muted-foreground">No crew for this role in this country.</p>}
    </div>
  );
}

// A Sandbox column (Scenario 1 or a drafted Sandbox), abstracted so the AI Crew Wizard can fill
// either kind the same way: which roles are still open, who's available for one, and how to assign.
type WizardTarget = {
  key: string; label: string;
  openRoles: () => string[];
  candidatesFor: (role: string) => Candidate[];
  assign: (role: string, candidateId: string) => Promise<void> | void;
};

function WizardMenu({ target, open, onToggle, onRunAuto, onGuided }: {
  target: WizardTarget; open: boolean; onToggle: () => void;
  onRunAuto: (strategy: "cheapest" | "bestfit") => void; onGuided: () => void;
}) {
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={onToggle} title="AI Crew Wizard" aria-label={`AI Crew Wizard for ${target.label}`}
        className="inline-flex items-center justify-center rounded-sm border border-primary bg-background p-1 text-primary">
        <Sparkles className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-44 space-y-1 rounded-sm border border-border bg-card p-1.5 shadow-md">
          <button onClick={() => onRunAuto("cheapest")} className="block w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted">Cheapest available</button>
          <button onClick={() => onRunAuto("bestfit")} className="block w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted">Best fit</button>
          <button onClick={onGuided} className="block w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted">Step-by-step</button>
        </div>
      )}
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
  const selected = useSelectedSandbox(p.id, date);
  const countryFilter = useCrewCountryFilter();
  const localCountry = productionCountry(p.currency);
  const [pickKey, setPickKey] = useState<string | null>(null); // "s1:<role>" or "<scenarioId>:<role>"

  const s1Candidates = (role: string, matches: CrewRequiredMatch[]): Candidate[] =>
    toCandidates(req.candidatesFor(role, matches), countryFilter, localCountry);
  const scCandidates = (s: Scenario, role: string, excludeId?: string): Candidate[] =>
    toCandidates(sc.candidatesFor(s, role, excludeId), countryFilter, localCountry);

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

  // AI Crew Wizard: three ways to fill a Sandbox's open roles — cheapest, best-fit by experience, or
  // a guided one-role-at-a-time picker. "Best fit" ranks candidates by how many times they've
  // worked on this production before (ties broken by day rate).
  const allBookings = useBookings().data ?? [];
  const experienceCount = (crewId: string) => allBookings.filter((b) => b.crewId === crewId && b.status !== "cancelled").length;
  const [wizardMenuFor, setWizardMenuFor] = useState<string | null>(null);
  const [guidedFor, setGuidedFor] = useState<{ targetKey: string; roles: string[]; idx: number } | null>(null);

  const s1Target: WizardTarget = {
    key: "s1", label: "Sandbox 1",
    openRoles: () => roleList.filter((r) => !req.isConfirmed(r) && req.byRole(r).length === 0),
    candidatesFor: (role) => onlyAvailable(s1Candidates(role, req.byRole(role))),
    assign: async (role, id) => { await req.pencil(role, id, [], true); },
  };
  const scTarget = (s: Scenario): WizardTarget => ({
    key: s.id, label: s.name,
    openRoles: () => roleList.filter((r) => !sc.assignedForRole(s, r)),
    candidatesFor: (role) => onlyAvailable(scCandidates(s, role)),
    assign: async (role, id) => { await sc.selectForRole(s, role, id, null); },
  });
  function getTarget(key: string): WizardTarget | undefined {
    if (key === "s1") return s1Target;
    const s = sc.scenarios.find((x) => x.id === key);
    return s ? scTarget(s) : undefined;
  }
  function rankedCandidates(target: WizardTarget, role: string) {
    return [...target.candidatesFor(role)].sort((a, b) => (experienceCount(b.id) - experienceCount(a.id)) || (a.dayRate - b.dayRate));
  }
  async function runAutoWizard(target: WizardTarget, strategy: "cheapest" | "bestfit") {
    const used = new Set<string>();
    let count = 0;
    for (const role of target.openRoles()) {
      const candidates = target.candidatesFor(role).filter((c) => !used.has(c.id));
      if (candidates.length === 0) continue;
      const sorted = strategy === "cheapest"
        ? [...candidates].sort((a, b) => a.dayRate - b.dayRate)
        : rankedCandidates({ ...target, candidatesFor: () => candidates }, role);
      const pick = sorted[0]!;
      await target.assign(role, pick.id);
      used.add(pick.id);
      count++;
    }
    toast.success(count ? `AI Crew Wizard filled ${count} role${count === 1 ? "" : "s"} for ${target.label}` : `${target.label}: no open roles to fill`);
  }
  function startGuided(target: WizardTarget) {
    const roles = target.openRoles();
    if (!roles.length) { toast.success(`${target.label}: no open roles to fill`); return; }
    setGuidedFor({ targetKey: target.key, roles, idx: 0 });
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
            <th className="min-w-[8rem] px-2 py-2 text-left sm:min-w-[13rem] sm:px-3"><span className="font-display text-xs font-semibold uppercase tracking-wide text-primary sm:text-sm">Crew Required</span></th>
            <th className={`min-w-[10rem] border-l-2 border-border px-2 py-2 text-left sm:min-w-[17rem] sm:px-3 ${selCls(selected, "s1")}`}>
              <div className="flex items-center gap-2">
                <span className="flex-1 font-display text-xs font-semibold uppercase tracking-wide text-primary sm:text-sm">Sandbox 1</span>
                <select className="w-20 shrink-0 rounded-sm bg-primary px-1.5 py-1 text-[9px] font-semibold text-primary-foreground sm:w-28 sm:text-[10px]" value=""
                  onChange={(e) => { const g = sc.crewMixes.find((x) => x.id === e.target.value); if (g) applyMixToS1(g); }} aria-label="Favourites for Sandbox 1">
                  <option value="" disabled className="bg-background text-foreground">Favourites</option>
                  {sc.crewMixes.length === 0 && <option value="" disabled className="bg-background text-foreground">No crew mixes saved yet</option>}
                  {sc.crewMixes.map((g) => <option key={g.id} value={g.id} className="bg-background text-foreground">{g.name} ({g.memberIds.length}){g.productionType ? ` · ${g.productionType}` : ""}</option>)}
                </select>
                <WizardMenu target={s1Target} open={wizardMenuFor === "s1"} onToggle={() => setWizardMenuFor(wizardMenuFor === "s1" ? null : "s1")}
                  onRunAuto={(strategy) => { setWizardMenuFor(null); runAutoWizard(s1Target, strategy); }}
                  onGuided={() => { setWizardMenuFor(null); startGuided(s1Target); }} />
              </div>
            </th>
            {sc.scenarios.map((s) => {
              const target = scTarget(s);
              return (
                <th key={s.id} className={`min-w-[10rem] border-l-2 border-border px-2 py-2 text-left sm:min-w-[17rem] sm:px-3 ${selCls(selected, s.id)}`}>
                  <div className="flex items-center gap-2">
                    <input defaultValue={s.name} onBlur={(e) => sc.renameScenario(s, e.target.value)} maxLength={80} aria-label="Sandbox name"
                      className="min-w-0 flex-1 bg-transparent font-display text-xs font-semibold uppercase tracking-wide text-primary outline-none sm:text-sm" />
                    <select className="w-20 shrink-0 rounded-sm bg-primary px-1.5 py-1 text-[9px] font-semibold text-primary-foreground sm:w-28 sm:text-[10px]" value=""
                      onChange={(e) => { const g = sc.crewMixes.find((x) => x.id === e.target.value); if (g) sc.applyGroupToScenario(s, g); }} aria-label={`Favourites for ${s.name}`}>
                      <option value="" disabled className="bg-background text-foreground">Favourites</option>
                      {sc.crewMixes.length === 0 && <option value="" disabled className="bg-background text-foreground">No crew mixes saved yet</option>}
                      {sc.crewMixes.map((g) => <option key={g.id} value={g.id} className="bg-background text-foreground">{g.name} ({g.memberIds.length}){g.productionType ? ` · ${g.productionType}` : ""}</option>)}
                    </select>
                    <WizardMenu target={target} open={wizardMenuFor === s.id} onToggle={() => setWizardMenuFor(wizardMenuFor === s.id ? null : s.id)}
                      onRunAuto={(strategy) => { setWizardMenuFor(null); runAutoWizard(target, strategy); }}
                      onGuided={() => { setWizardMenuFor(null); startGuided(target); }} />
                    <button onClick={() => sc.deleteScenario(s.id)} aria-label={`Delete ${s.name}`} className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </th>
              );
            })}
            <th className="min-w-[7rem] px-2 py-2 text-left sm:min-w-[11rem] sm:px-3">
              <button onClick={sc.createScenario} className={`${ghost} whitespace-nowrap`}><Plus className="h-3.5 w-3.5 shrink-0" /> <span className="hidden sm:inline">Add Sandbox {sc.scenarios.length + 2}</span><span className="sm:hidden">Add</span></button>
            </th>
          </tr>
        </thead>
        <tbody>
          {roleList.map((role) => {
            const matches = req.byRole(role);
            const s1Key = `s1:${role}`;
            return (
              <tr key={role} className="border-b border-border">
                <td className="px-2 py-2 align-top text-xs sm:px-3 sm:py-2.5 sm:text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{role}</span>
                    <button onClick={() => removeRole(role)} aria-label={`Remove ${role}`} className="shrink-0 font-bold text-destructive">−</button>
                  </div>
                </td>
                <td className={`border-l-2 border-border px-2 py-2 align-top text-xs sm:px-3 sm:py-2.5 sm:text-sm ${selCls(selected, "s1")}`}>
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
                      <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground sm:w-16 sm:text-xs">{matches.map((m) => zar(m.rate)).join(", ")}</span>
                      <div className="relative shrink-0">
                        <button onClick={() => setPickKey(pickKey === s1Key ? null : s1Key)} title={matches.length === 0 ? "Find" : "Swap"}
                          aria-label={matches.length === 0 ? `Find crew for ${role}` : `Swap crew for ${role}`}
                          className="inline-flex items-center justify-center rounded-sm bg-primary p-1.5 text-primary-foreground">
                          {matches.length === 0 ? <UserPlus className="h-3.5 w-3.5" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
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
                    <td key={s.id} className={`border-l-2 border-border px-2 py-2 align-top text-xs sm:px-3 sm:py-2.5 sm:text-sm ${selCls(selected, s.id)}`}>
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                          {assigned ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="truncate">{assigned.name}</span>
                              <button onClick={() => sc.removeFromScenario(s, assigned.id, assigned.name)} aria-label={`Remove ${assigned.name} from ${role}`} className="font-bold text-destructive">−</button>
                            </span>
                          ) : "Unassigned"}
                        </span>
                        <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground sm:w-16 sm:text-xs">{assigned ? zar(assigned.dayRate) : ""}</span>
                        <div className="relative shrink-0">
                          <button onClick={() => setPickKey(pickKey === key ? null : key)} title={assigned ? "Swap" : "Find"}
                            aria-label={assigned ? `Swap crew for ${role}` : `Find crew for ${role}`}
                            className="inline-flex items-center justify-center rounded-sm bg-primary p-1.5 text-primary-foreground">
                            {assigned ? <ArrowLeftRight className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
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
            <td className="px-2 py-2 align-top sm:px-3 sm:py-3">
              <div className="flex items-center gap-2">
                <input value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRole())}
                  placeholder="Add a role" className="min-w-0 flex-1 rounded-sm border border-input bg-background px-2 py-1.5 text-sm" />
                <button onClick={addRole} className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary">+ Add role</button>
              </div>
            </td>
            <td className={`space-y-2 border-l-2 border-border px-2 py-2 align-top sm:px-3 sm:py-3 ${selCls(selected, "s1")}`}>
              <div className="text-xs"><span className="text-muted-foreground">Total:</span> <b>{fmtMoney(req.dayTotal, p.currency)}</b></div>
              <button onClick={() => { setSelectedSandbox(p.id, date, "s1"); toast.success("Crew Required is already pencilled — Find/Swap updates it instantly."); }} className={`${ghost} w-full justify-center`}>Pencil this Crew</button>
            </td>
            {sc.scenarios.map((s) => (
              <td key={s.id} className={`space-y-2 border-l-2 border-border px-2 py-2 align-top sm:px-3 sm:py-3 ${selCls(selected, s.id)}`}>
                <div className="text-xs"><span className="text-muted-foreground">Total:</span> <b>{fmtMoney(sc.totalFor(s), p.currency)}</b></div>
                <button onClick={() => { setSelectedSandbox(p.id, date, s.id); sc.commit(s); }} disabled={sc.committing} className={`${ghost} w-full justify-center`}>Pencil this Crew</button>
              </td>
            ))}
            <td />
          </tr>
        </tfoot>
      </table>
      {guidedFor && (() => {
        const target = getTarget(guidedFor.targetKey);
        if (!target) return null;
        if (guidedFor.idx >= guidedFor.roles.length) {
          return (
            <Dialog open onOpenChange={() => setGuidedFor(null)}>
              <DialogContent className="max-w-sm">
                <DialogHeader><DialogTitle>AI Crew Wizard · {target.label}</DialogTitle><DialogDescription>Done — every open role has been reviewed.</DialogDescription></DialogHeader>
                <DialogFooter><Button type="button" onClick={() => setGuidedFor(null)}>Close</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          );
        }
        const role = guidedFor.roles[guidedFor.idx]!;
        const candidates = rankedCandidates(target, role);
        const advance = () => setGuidedFor((g) => (g ? { ...g, idx: g.idx + 1 } : g));
        return (
          <Dialog open onOpenChange={(o) => { if (!o) setGuidedFor(null); }}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>AI Crew Wizard · {target.label}</DialogTitle>
                <DialogDescription>Role {guidedFor.idx + 1} of {guidedFor.roles.length}: {role}</DialogDescription>
              </DialogHeader>
              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {candidates.length === 0 && <p className="text-xs text-muted-foreground">No available crew fit this role.</p>}
                {candidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-sm border border-border px-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium">{c.name}</span>
                      <span className="block text-muted-foreground">{fmtMoney(c.dayRate, p.currency)} / day · {experienceCount(c.id)} past booking{experienceCount(c.id) === 1 ? "" : "s"}</span>
                    </span>
                    <button onClick={async () => { await target.assign(role, c.id); advance(); }} className="shrink-0 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Select</button>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setGuidedFor(null)}>Stop</Button>
                <Button type="button" variant="ghost" onClick={advance}>Skip role</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

// How many sandboxes exist for each shoot day, so the summary matrix knows how many columns to
// draw before any day section has been expanded (DayTable/useScenarios only run while open).
function useScenarioCountsByDay(p: Production, shootDays: string[]) {
  return useQuery({
    queryKey: ["scenario-counts", p.id, shootDays],
    queryFn: async () => {
      if (!shootDays.length) return {} as Record<string, number>;
      const keys = shootDays.map((d) => scenarioKey(p.id, d));
      const { data, error } = await supabase.from("brief_matches").select("client").in("client", keys);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.client] = (counts[row.client] ?? 0) + 1;
      return shootDays.reduce((acc, d) => { acc[d] = counts[scenarioKey(p.id, d)] ?? 0; return acc; }, {} as Record<string, number>);
    },
  });
}

// One column of the summary matrix: a Sandbox's total for this day, who's allocated to it (for the
// tooltip), which roles are still open, and how to pencil a candidate into one of them.
type SummaryCol = {
  total: number; names: string[]; openRoles: string[];
  candidatesFor: (role: string) => Candidate[];
  assign: (role: string, candidateId: string) => Promise<void> | void;
};

// One row of the summary matrix: mounts the same pure data hooks DayTable uses, just to read
// totals, so the matrix stays accurate even for days whose section is currently collapsed.
function DaySummaryRow({ p, date, dayIndex, roleList, maxCols }: {
  p: Production; date: string; dayIndex: number; roleList: string[]; maxCols: number;
}) {
  const req = useCrewRequiredDay(p, date, roleList);
  const sc = useScenarios(p, date, roleList);
  const countryFilter = useCrewCountryFilter();
  const localCountry = productionCountry(p.currency);
  const [pencilFor, setPencilFor] = useState<number | null>(null);
  const [pencilRole, setPencilRole] = useState<string | null>(null);

  const s1Candidates = (role: string, matches: CrewRequiredMatch[]): Candidate[] =>
    toCandidates(req.candidatesFor(role, matches), countryFilter, localCountry);
  const scCandidates = (s: Scenario, role: string): Candidate[] =>
    toCandidates(sc.candidatesFor(s, role), countryFilter, localCountry);

  const s1Col: SummaryCol = {
    total: req.dayTotal,
    names: roleList.flatMap((r) => req.byRole(r).map((m) => `${m.name} — ${r}`)),
    openRoles: roleList.filter((r) => !req.isConfirmed(r) && req.byRole(r).length === 0),
    candidatesFor: (role) => s1Candidates(role, req.byRole(role)),
    assign: async (role, id) => { await req.pencil(role, id, [], true); },
  };
  const scCols: SummaryCol[] = sc.scenarios.map((s) => ({
    total: sc.totalFor(s),
    names: roleList.map((r) => { const c = sc.assignedForRole(s, r); return c ? `${c.name} — ${r}` : null; }).filter((x): x is string => !!x),
    openRoles: roleList.filter((r) => !sc.assignedForRole(s, r)),
    candidatesFor: (role) => scCandidates(s, role),
    assign: async (role, id) => { await sc.selectForRole(s, role, id, null); },
  }));
  const cols: (SummaryCol | null)[] = [s1Col, ...scCols];
  const selected = useSelectedSandbox(p.id, date);
  const colKeys = ["s1", ...sc.scenarios.map((s) => s.id)];
  while (cols.length < maxCols) cols.push(null);

  function closePencil() { setPencilFor(null); setPencilRole(null); }

  return (
    <tr className="border-t border-border">
      <td className="px-3 py-2 font-medium">Day {dayIndex + 1} · {dayLabel(date)}</td>
      {cols.map((col, i) => (
        <td key={i} className={`px-3 py-2 text-right tabular-nums ${colKeys[i] ? selCls(selected, colKeys[i]!) : ""}`}>
          {col == null ? "—" : (
            <div className="relative inline-flex items-center justify-end gap-1.5">
              <span title={col.names.length ? col.names.join("\n") : "No crew allocated yet"}>{fmtMoney(col.total, p.currency)}</span>
            </div>
          )}
        </td>
      ))}
    </tr>
  );
}

// Crew Required + Sandbox, one independent workspace per shoot day. A producer fills each day on
// its own (crew can differ day to day); Copy to: carries one day's pencils and scenarios across
// to whichever other days are ticked, instead of starting from scratch every time.
export function CrewDayPlanner({ p }: { p: Production }) {
  const crewCountry = useCrewCountryFilter();
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

  const scenarioCounts = useScenarioCountsByDay(p, shootDays).data ?? {};
  const maxCols = 1 + Math.max(0, ...Object.values(scenarioCounts));

  if (shootDays.length === 0) {
    return <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">Set this production's start date (or add a location with a date) to start planning crew by shoot day.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-sm border border-border bg-card p-3 text-sm">
        <span className="text-muted-foreground">Pencilled across the whole production:</span> <b>{fmtMoney(totalPencilled, p.currency)}</b>{" "}
        <span className={variance < 0 ? "text-destructive" : "text-success"}>({variance < 0 ? `${fmtMoney(-variance, p.currency)} over` : `${fmtMoney(variance, p.currency)} under`} budget of {fmtMoney(p.budget, p.currency)})</span>
        <label className="ml-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">Crew from
          <select value={crewCountry} onChange={(e) => setCrewCountryFilter(e.target.value)} className="rounded-sm border border-input bg-background px-2 py-1 text-xs text-foreground">
            <option value="local">Local ({CREW_COUNTRIES.find((c) => c.code === productionCountry(p.currency))?.label})</option>
            {CREW_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            <option value="ALL">All countries</option>
          </select>
        </label>
      </div>
      <section className="rounded-sm border border-border bg-card">
        <div className="border-b border-primary bg-primary px-4 py-2.5 text-primary-foreground">
          <span className="font-display text-sm font-semibold uppercase tracking-wide">Sandbox Summary</span>
          <span className="ml-2 text-xs font-normal opacity-90">Sandbox 1 is the real pencilled crew; the rest are options</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Day</th>
                {Array.from({ length: maxCols }).map((_, i) => (
                  <th key={i} className="px-3 py-2 text-right">{i === 0 ? "Sandbox 1" : `Sandbox ${i + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shootDays.map((day, i) => (
                <DaySummaryRow key={day} p={p} date={day} dayIndex={i} roleList={roles.roleList} maxCols={maxCols} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
                  <option value="" disabled className="bg-background text-foreground">Select Crew Type</option>
                  {sizeTypes.map((g) => <option key={g.id} value={g.id} className="bg-background text-foreground">{g.name} ({g.memberIds.length})</option>)}
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
