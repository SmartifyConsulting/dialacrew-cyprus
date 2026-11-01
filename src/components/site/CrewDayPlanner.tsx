import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { useBookings } from "@/lib/db";
import { useLocationPoints } from "@/lib/site";
import { fmtMoney, type Production } from "@/lib/demo-data";
import { CrewRequiredColumn, CrewRoleStatus, useCrewRoleList } from "@/components/site/SiteTabs";
import { ScenarioPlanner, scenarioKey } from "@/components/site/ScenarioPlanner";

const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const localYmd = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayLabel = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
const ghost = "inline-flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary disabled:opacity-50";

// Crew Required + Sandbox, one independent workspace per shoot day. A producer fills each day on
// its own (crew can differ day to day); Copy to: carries one day's pencils and scenarios across
// to whichever other days are ticked, instead of starting from scratch every time.
export function CrewDayPlanner({ p }: { p: Production }) {
  const qc = useQueryClient();
  const locationPoints = useLocationPoints(p.id).data ?? [];
  const allBookings = useBookings().data ?? [];
  const roles = useCrewRoleList(p);
  const [copying, setCopying] = useState<string | null>(null);
  const [copyOpenFor, setCopyOpenFor] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());

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
        return (
          <Panel key={day} title={`Day ${i + 1} · ${dayLabel(day)}`} collapsible defaultCollapsed={i > 0}
            badge={<span className="text-xs font-normal text-muted-foreground">{fmtMoney(dayTotal, p.currency)} pencilled</span>}
            right={shootDays.length > 1 && (
              <div className="relative">
                <button disabled={copying === day} onClick={() => openCopy(day)} className={ghost}><Copy className="h-3 w-3" /> Copy to…</button>
                {copyOpenFor === day && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-60 rounded-sm border border-border bg-card p-3 shadow-md">
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
            )}>
            <div className="flex items-start gap-4 overflow-x-auto p-4">
              <div className="w-56 shrink-0"><CrewRequiredColumn {...roles} /></div>
              <div className="w-72 shrink-0"><CrewRoleStatus p={p} date={day} roleList={roles.roleList} /></div>
              <ScenarioPlanner p={p} date={day} roleList={roles.roleList} />
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
