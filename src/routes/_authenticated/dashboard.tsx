import { overtimeAmount, shiftLabel, type OvertimeShift } from "@/lib/costing";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Badge, ClientBadge, Page, Panel } from "@/components/AppShell";
import { zar } from "@/lib/demo-data";
import { useBookings, useCrew, useProductions, useRequestOvertime, useRequests, useRespondToBooking, useSetRequestState } from "@/lib/db";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { useMyCrewId, useMyName } from "@/lib/site";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function DashboardRouter() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  if (role.isLoading) return <Page open title="Home"><p className="text-muted-foreground">Loading…</p></Page>;
  if (role.data === "crew") return <CrewDashboard />;
  return <Dashboard />;
}

function CrewDashboard() {
  const crewId = useMyCrewId(true).data;
  const jobs = useQuery({
    queryKey: ["crew-jobs", crewId], enabled: !!crewId,
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id, role, status, booking_date, call_time, production_id, crew_rate, days, pencil_priority, productions(name, client, address, location)").eq("crew_id", crewId!).order("booking_date");
      if (error) throw error; return data ?? [];
    },
  }).data ?? [];
  const live = jobs.filter((j) => !["cancelled", "completed", "payment_released"].includes(j.status));
  const qc = useQueryClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayJob = live.find((j) => j.booking_date === todayIso) ?? live.find((j) => (j.booking_date ?? "") >= todayIso);
  const pencils = live.filter((j) => j.status === "pencil" || j.status === "awaiting_crew_confirmation");
  const { session } = useSession();
  const myName = useMyName(session?.user.id).data ?? "Crew";
  const requestOT = useRequestOvertime();
  const [ot, setOt] = useState<{ hours: number; reason: string; shift: OvertimeShift }>({ hours: 1, reason: "", shift: "day" });
  const earned = (s: string[]) => jobs.filter((j) => s.includes(j.status)).reduce((a, j) => a + Number(j.crew_rate ?? 0) * Number(j.days ?? 1), 0);
  const paid = earned(["payment_released", "completed"]);
  const pendingPay = earned(["confirmed", "in_progress", "awaiting_review"]);
  async function logOvertime() {
    if (!todayJob) return;
    const pr = todayJob.productions as { name?: string } | null;
    try {
      await requestOT.mutateAsync({ bookingId: todayJob.id, production: pr?.name ?? "", who: myName, hours: ot.hours, amount: overtimeAmount(Number(todayJob.crew_rate ?? 0), ot.hours, todayJob.booking_date, ot.shift), reason: `${shiftLabel(todayJob.booking_date, ot.shift)} · ${ot.reason || "Ran past wrap"}` });
      toast.success("Overtime sent to the producer for approval");
      setOt({ hours: 1, reason: "", shift: "day" });
    } catch (e) { toast.error((e as Error).message); }
  }
  async function respond(id: string, accept: boolean) {
    const { error } = await supabase.from("bookings").update({ status: accept ? "confirmed" : "cancelled" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(accept ? "Job accepted" : "Job declined");
    qc.invalidateQueries({ queryKey: ["crew-jobs"] });
  }
  return (
    <Page open title="Home" subtitle="Your jobs and call times">
      {todayJob && (() => {
        const pr = todayJob.productions as { name?: string; address?: string; location?: string } | null;
        const where = pr?.address || pr?.location || "";
        return (
          <section className="mb-5 rounded-lg bg-primary p-5 text-primary-foreground shadow-sm">
            <div className="text-xs font-semibold opacity-80">{todayJob.booking_date === todayIso ? "Today" : "Next up"} · {todayJob.booking_date}</div>
            <div className="mt-1 font-display text-2xl font-semibold">{pr?.name ?? "Production"}</div>
            <div className="mt-1 text-sm opacity-90">{todayJob.role}{todayJob.call_time ? ` · call ${todayJob.call_time.slice(0, 5)}` : ""}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/productions/$id" params={{ id: todayJob.production_id }} className="rounded-md bg-background px-4 py-2 text-sm font-semibold text-foreground">Open job · check in</Link>
              {where && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`} target="_blank" rel="noreferrer" className="rounded-md border border-primary-foreground/40 px-4 py-2 text-sm font-semibold">Directions</a>}
            </div>
          </section>
        );
      })()}
      {pencils.length > 0 && (
        <div className="mb-5"><Panel title={`Job offers waiting (${pencils.length})`}>
          <ul className="divide-y divide-border text-sm">
            {pencils.map((j) => {
              const pr = j.productions as { name?: string } | null;
              return (
                <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1"><div className="font-semibold">{pr?.name ?? "Production"}</div><div className="text-xs text-muted-foreground">{j.pencil_priority === 2 ? "2nd pencil" : "1st pencil"} · {j.role} · {j.booking_date ?? ""}</div></div>
                  <button onClick={() => respond(j.id, true)} className="rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-primary-foreground">Accept</button>
                  <button onClick={() => respond(j.id, false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold">Decline</button>
                </li>
              );
            })}
          </ul>
        </Panel></div>
      )}
      <div className="mb-5 grid gap-5 md:grid-cols-2">
        <Panel title="Earnings">
          <div className="grid grid-cols-2 gap-3 p-4">
            <div className="rounded-lg bg-success/10 p-3"><div className="text-xs text-muted-foreground">Paid</div><div className="mt-1 font-display text-2xl font-semibold text-success">{zar(paid)}</div></div>
            <div className="rounded-lg bg-primary/10 p-3"><div className="text-xs text-muted-foreground">Coming</div><div className="mt-1 font-display text-2xl font-semibold text-primary">{zar(pendingPay)}</div></div>
          </div>
        </Panel>
        {todayJob && (
          <Panel title="Log overtime">
            <div className="flex flex-wrap items-end gap-2 p-4">
              <label className="text-xs text-muted-foreground">Hours<input type="number" min={0.5} step={0.5} value={ot.hours} onChange={(e) => setOt({ ...ot, hours: Number(e.target.value) })} className="mt-1 block w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground" /></label>
              <label className="text-xs text-muted-foreground">Shift<select value={ot.shift} onChange={(e) => setOt({ ...ot, shift: e.target.value as OvertimeShift })} className="mt-1 block rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground"><option value="day">Day</option><option value="night">Night (4pm–morning)</option></select></label>
              <label className="flex-1 text-xs text-muted-foreground">Reason<input value={ot.reason} onChange={(e) => setOt({ ...ot, reason: e.target.value })} placeholder="Ran past wrap" className="mt-1 block w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground" /></label>
              <button disabled={requestOT.isPending || ot.hours <= 0} onClick={logOvertime} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">Send</button>
            </div>
            <p className="px-4 pb-3 text-xs text-muted-foreground">{shiftLabel(todayJob.booking_date, ot.shift)}: {zar(overtimeAmount(Number(todayJob.crew_rate ?? 0), ot.hours, todayJob.booking_date, ot.shift))}. Weekends 1.5×, nights from 4pm 2×. Paid once the producer approves.</p>
          </Panel>
        )}
      </div>
      <Panel title={`My jobs (${live.length})`}>
        <ul className="divide-y divide-border text-sm">
          {live.length === 0 && <li className="p-4 text-muted-foreground">No jobs yet. Open Find Gigs to grab one.</li>}
          {live.map((j) => {
            const pr = j.productions as { name?: string; client?: string; address?: string; location?: string } | null;
            return (
              <li key={j.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to="/productions/$id" params={{ id: j.production_id }} className="font-semibold hover:text-primary">{pr?.name ?? "Production"}</Link>
                  <div className="text-xs text-muted-foreground">{j.role} · {pr?.address || pr?.location || ""}</div>
                </div>
                <div className="text-xs text-muted-foreground">{j.booking_date ?? ""}{j.call_time ? ` · call ${j.call_time.slice(0, 5)}` : ""}</div>
                <Badge>{j.status}</Badge>
              </li>
            );
          })}
        </ul>
      </Panel>
    </Page>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Producer Dashboard — Book a Crew" },
      { name: "description", content: "Active productions, bookings, approvals, attendance and secured funds at a glance." },
      { property: "og:title", content: "Producer Dashboard — Book a Crew" },
      { property: "og:description", content: "Your production operations in one view." },
    ],
  }),
  component: DashboardRouter,
});

function Dashboard() {
  const { session } = useSession();
  const name = useMyName(session?.user.id).data ?? "";
  const first = name.includes("@") ? "" : name.split(" ")[0];
  const productions = useProductions().data ?? [];
  const crew = useCrew().data ?? [];
  const bookings = useBookings().data ?? [];
  const reqs = useRequests().data ?? [];
  const setState = useSetRequestState();
  const respondToBooking = useRespondToBooking();
  const crewName = (id: string | null) => (id ? crew.find((c) => c.id === id)?.name ?? "—" : "Open gig");
  const prodName = (id: string) => productions.find((p) => p.id === id)?.name ?? "Production";
  const count = (s: string) => bookings.filter((b) => b.status === s).length;
  const secured = productions.reduce((a, p) => a + p.securedFunds, 0);
  const totalBudget = productions.reduce((a, p) => a + p.budget, 0);
  const budgetPct = totalBudget ? Math.round((secured / totalBudget) * 100) : 0;
  const pendingReqs = reqs.filter((r) => r.state === "Pending");
  const waitingCrew = bookings.filter((b) => b.status === "awaiting_crew_confirmation");
  const [prodFilter, setProdFilter] = useState<"Active" | "Upcoming" | "Wrapped">("Active");
  const filteredProductions = productions.filter((p) => p.status === prodFilter);
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const kpis = [
    { l: "Active productions", v: productions.filter((p) => p.status === "Active").length, s: `${productions.filter((p) => p.status === "Upcoming").length} upcoming` },
    { l: "Crew confirmed", v: count("confirmed"), s: `${count("pencil")} on pencil` },
    { l: "Needs you", v: pendingReqs.length + waitingCrew.length, s: `${pendingReqs.length} approvals` },
    { l: "Budget committed", v: `${budgetPct}%`, s: `${zar(secured)} of ${zar(totalBudget)}` },
  ];
  const onSet = productions.find((p) => p.status === "Active");
  const today = onSet ? bookings.filter((b) => b.productionId === onSet.id) : [];
  const dateLabel = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const activity = [
    ...reqs.filter((r) => r.state !== "Pending").map((r) => ({ id: `r${r.id}`, text: `${r.kind} for ${r.who} ${r.state.toLowerCase()}`, sub: r.production })),
    ...bookings.filter((b) => b.status === "confirmed").map((b) => ({ id: `b${b.id}`, text: `${crewName(b.crewId)} confirmed as ${b.role}`, sub: prodName(b.productionId) })),
  ].slice(0, 8);

  return (
    <Page title={`${greet}${first ? `, ${first}` : ""}`} subtitle={dateLabel}
      actions={<Link to="/productions" className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm">+ New production</Link>}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.l}</div>
            <div className="mt-1 font-display text-3xl font-semibold">{k.v}</div>
            <div className="mt-1 text-xs text-muted-foreground">{k.s}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Panel title="Needs you" right={<span className="text-xs text-muted-foreground">{pendingReqs.length + waitingCrew.length} open</span>}>
            <ul className="divide-y divide-border">
              {pendingReqs.length + waitingCrew.length === 0 && <li className="p-4 text-sm text-muted-foreground">All caught up.</li>}
              {pendingReqs.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex justify-between text-xs font-semibold text-primary"><span>{r.kind}</span><span>{zar(r.amount)}</span></div>
                  <div className="mt-1 text-sm">{r.detail}</div>
                  <div className="text-xs text-muted-foreground">{r.who} · {r.production}</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => setState.mutate({ id: r.id, state: "Approved" })} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Approve</button>
                    <button onClick={() => setState.mutate({ id: r.id, state: "Declined" })} className="rounded-md border border-border px-3 py-1 text-xs font-semibold">Decline</button>
                  </div>
                </li>
              ))}
              {waitingCrew.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success/20 text-success"><Check className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{crewName(b.crewId)} accepted your {b.pencilPriority === 2 ? "2nd" : "1st"} pencil</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {prodName(b.productionId)} · {b.role}{b.bookingDate ? ` · ${b.bookingDate}` : ""} · {zar(b.crewRate)} a day
                    </div>
                  </div>
                  <button onClick={() => respondToBooking.mutate({ id: b.id, status: "confirmed" })} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Confirm booking</button>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Productions" right={
            <div className="flex gap-1">
              {(["Active", "Upcoming", "Wrapped"] as const).map((s) => (
                <button key={s} onClick={() => setProdFilter(s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${prodFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  {s}
                </button>
              ))}
            </div>
          }>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {filteredProductions.length === 0 && <p className="text-sm text-muted-foreground">No {prodFilter.toLowerCase()} productions.</p>}
              {filteredProductions.map((p) => {
                const pct = p.crewNeeded ? Math.min(100, Math.round((p.crewBooked / p.crewNeeded) * 100)) : 0;
                return (
                  <Link key={p.id} to="/productions/$id" params={{ id: p.id }} className="block rounded-lg border border-border bg-background p-4 transition hover:border-primary">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{p.name}</div>
                        <div className="mt-1 flex items-center gap-2"><ClientBadge name={p.client} /><span className="truncate text-xs text-muted-foreground">{p.date}</span></div>
                      </div>
                      <Badge>{p.status}</Badge>
                    </div>
                    <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>Crew {p.crewBooked}/{p.crewNeeded}</span><span>{zar(p.budget)}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  </Link>
                );
              })}
            </div>
          </Panel>

          <Panel title={`On set today${onSet ? ` · ${onSet.name}` : ""}`}>
            <ul className="divide-y divide-border text-sm">
              {today.length === 0 && <li className="p-4 text-muted-foreground">Nobody on set today.</li>}
              {today.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 font-medium">{crewName(b.crewId)} <span className="font-normal text-muted-foreground">· {b.role}</span></span>
                  <Badge>{b.status}</Badge>
                  {b.attendance && <Badge>{b.attendance}</Badge>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Live activity" right={<span className="text-xs text-muted-foreground">Across web and mobile</span>}>
            <ul className="divide-y divide-border text-sm">
              {activity.length === 0 && <li className="p-4 text-muted-foreground">No activity yet.</li>}
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span><span className="block">{a.text}</span><span className="text-xs text-muted-foreground">{a.sub}</span></span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
