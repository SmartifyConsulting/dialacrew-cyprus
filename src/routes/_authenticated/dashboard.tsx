import type React from "react";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Badge, ClientBadge, Page, Panel, clientColor } from "@/components/AppShell";
import { zar, type Booking, type Production } from "@/lib/demo-data";
import { useBookings, useCrew, useProductions, useRequests, useRespondToBooking, useSetRequestState } from "@/lib/db";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { useMyCrewId, useMyName } from "@/lib/site";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";

function DashboardRouter() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  if (role.isLoading) return <Page open title="Home"><p className="text-muted-foreground">Loading…</p></Page>;
  if (role.data === "crew") return <CrewDashboard />;
  if (role.data === "client") return <PendingGate><Dashboard /></PendingGate>;
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
  const uid = session?.user.id;
  const gigValue = useQuery({
    queryKey: ["crew-gig-value", uid], enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("community_gigs").select("posted_by, status, amount").eq("secured_by", uid!);
      if (error) throw error;
      const rows = data ?? [];
      return {
        count: rows.length,
        connections: new Set(rows.map((r) => r.posted_by)).size,
        earned: rows.filter((r) => r.status === "completed").reduce((a, r) => a + Number(r.amount ?? 0), 0),
      };
    },
  }).data ?? { count: 0, connections: 0, earned: 0 };
  async function respond(id: string, accept: boolean) {
    const { error } = await supabase.from("bookings").update({ status: accept ? "confirmed" : "cancelled" }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(accept ? "Job accepted" : "Job declined");
    qc.invalidateQueries({ queryKey: ["crew-jobs"] });
  }
  return (
    <Page open title="Home" subtitle="Your jobs and call times">
      {pencils.map((j) => {
        const pr = j.productions as { name?: string; client?: string; address?: string; location?: string } | null;
        const days = Number(j.days ?? 1);
        const rate = Number(j.crew_rate ?? 0);
        return (
          <section key={j.id} className="mb-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-warning/20 px-3 py-1 text-xs font-semibold text-foreground">{j.pencil_priority === 2 ? "2nd pencil" : "1st pencil"}</span>
              <span className="text-xs text-muted-foreground">New pencil</span>
            </div>
            <div className="mt-3 font-display text-xl font-semibold">{pr?.name ?? "Production"}</div>
            <div className="text-sm text-muted-foreground">{pr?.client ?? ""}{pr?.client ? " · " : ""}{j.role}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-xs text-muted-foreground">Date</div>{j.booking_date ?? "TBC"}{days > 1 ? ` · ${days} days` : ""}</div>
              <div><div className="text-xs text-muted-foreground">Where</div>{pr?.address || pr?.location || "TBC"}</div>
              <div><div className="text-xs text-muted-foreground">Day rate</div>{zar(rate)}</div>
              <div><div className="text-xs text-muted-foreground">Total</div><span className="font-semibold">{zar(rate * days)}</span></div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => respond(j.id, false)} className="rounded-xl bg-destructive py-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90">Decline</button>
              <button onClick={() => respond(j.id, true)} className="rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground">Accept pencil</button>
            </div>
          </section>
        );
      })}
      {todayJob && !pencils.some((p) => p.id === todayJob.id) && (() => {
        const pr = todayJob.productions as { name?: string; address?: string; location?: string } | null;
        const where = pr?.address || pr?.location || "";
        return (
          <section className="mb-5 rounded-2xl bg-foreground p-5 text-background shadow-sm">
            <div className="text-xs font-semibold opacity-70">{todayJob.booking_date === todayIso ? "Today" : "Next up"} · {todayJob.booking_date}</div>
            <div className="mt-1 font-display text-2xl font-semibold">{pr?.name ?? "Production"}</div>
            <div className="mt-1 text-sm opacity-80">{todayJob.role}{where ? ` · ${where}` : ""}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-xs opacity-60">Call</div><div className="font-display text-xl font-semibold">{todayJob.call_time?.slice(0, 5) ?? "TBC"}</div></div>
              <div><div className="text-xs opacity-60">Wrap</div><div className="font-display text-xl font-semibold">{todayJob.call_time ? `${String((Number(todayJob.call_time.slice(0, 2)) + 12) % 24).padStart(2, "0")}${todayJob.call_time.slice(2, 5)}` : "TBC"}</div></div>
              <div><div className="text-xs opacity-60">Status</div><div className="font-semibold capitalize">{todayJob.status.replace(/_/g, " ")}</div></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/productions/$id" params={{ id: todayJob.production_id }} className="flex-1 rounded-xl bg-background py-3 text-center text-sm font-semibold text-foreground">Open job day</Link>
              {where && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`} target="_blank" rel="noreferrer" className="rounded-xl border border-background/40 px-4 py-3 text-sm font-semibold">Directions</a>}
            </div>
          </section>
        );
      })()}
      {(() => {
        const upcoming = live.filter((j) => j.id !== todayJob?.id && !pencils.includes(j) && (j.booking_date ?? "") >= todayIso).slice(0, 3);
        return (
          <div className="mb-5"><Panel title="Upcoming">
            <ul className="divide-y divide-border text-sm">
              {upcoming.length === 0 && <li className="p-4 text-muted-foreground">Nothing else booked yet.</li>}
              {upcoming.map((j) => (
                <li key={j.id} className="flex items-center justify-between px-4 py-3">
                  <div><div className="font-semibold">{(j.productions as { name?: string } | null)?.name ?? "Production"}</div><div className="text-xs text-muted-foreground">{j.role}</div></div>
                  <div className="text-xs text-muted-foreground">{j.booking_date}</div>
                </li>
              ))}
            </ul>
            <div className="border-t border-border p-3 text-right"><Link to="/calendar" className="text-sm font-semibold text-primary">Open calendar →</Link></div>
          </Panel></div>
        );
      })()}
      <SpotlightCard />
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

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type MiniCalDot = { id: string; bg: string; client: string; location: string; time: string };

// Compact current-month grid with a colored dot per client shooting that day — a quick-glance version
// of the full /calendar page, not a replacement for it. Each dot's tooltip shows client, location and time.
function MiniCalendar({ productions, bookings }: { productions: Production[]; bookings: Booking[] }) {
  const today = new Date();
  const byDay = new Map<string, MiniCalDot[]>();
  for (const p of productions) {
    if (!p.date) continue;
    const start = new Date(p.date + "T00:00:00");
    for (let i = 0; i < Math.max(1, p.days); i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const k = isoDate(d);
      const callTimes = bookings.filter((b) => b.productionId === p.id && b.bookingDate === k && b.callTime).map((b) => b.callTime!).sort();
      const dot: MiniCalDot = {
        id: `${p.id}-${k}`, bg: clientColor(p.client).split(" ")[0]!, client: p.client,
        location: p.location || p.address || "Location TBC", time: callTimes[0] ? callTimes[0].slice(0, 5) : "Time TBC",
      };
      byDay.set(k, [...(byDay.get(k) ?? []), dot]);
    }
  }
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysIn = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysIn) / 7) * 7 }, (_, i) => {
    const n = i - offset + 1;
    return n >= 1 && n <= daysIn ? new Date(today.getFullYear(), today.getMonth(), n) : null;
  });
  const todayIso = isoDate(today);

  return (
    <Panel title="Calendar" right={<Link to="/calendar" className="text-xs font-semibold text-primary hover:underline">Open</Link>}>
      <div className="p-3">
        <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-muted-foreground">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const dots = d ? byDay.get(isoDate(d)) ?? [] : [];
            return (
              <div key={i} className={`flex h-9 flex-col items-center justify-center rounded-md text-[11px] ${d && isoDate(d) === todayIso ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}>
                {d && <span>{d.getDate()}</span>}
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {dots.slice(0, 3).map((dot) => (
                    <span key={dot.id} title={`${dot.client} · ${dot.location} · ${dot.time}`} className={`h-1.5 w-1.5 rounded-full ${dot.bg}`} />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

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
  const CrewLink = ({ id }: { id: string | null }) => id ? <Link to="/crew/$id" params={{ id }} className="hover:text-primary hover:underline">{crewName(id)}</Link> : <>{crewName(id)}</>;
  const crewIdByName = (name: string) => crew.find((c) => c.name === name)?.id ?? null;
  const NameLink = ({ id, name }: { id: string | null; name: string }) => id ? <Link to="/crew/$id" params={{ id }} className="hover:text-primary hover:underline">{name}</Link> : <>{name}</>;
  const prodName = (id: string) => productions.find((p) => p.id === id)?.name ?? "Production";
  const clientByProdId = (id: string) => productions.find((p) => p.id === id)?.client;
  const clientByProdName = (name: string) => productions.find((p) => p.name === name)?.client;
  const prodIdByName = (name: string) => productions.find((p) => p.name === name)?.id;
  const ClientLink = ({ productionId, name }: { productionId: string | undefined; name: string }) =>
    productionId ? <Link to="/productions/$id" params={{ id: productionId }}><ClientBadge name={name} /></Link> : <ClientBadge name={name} />;
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
    { l: "Needs your attention", v: pendingReqs.length + waitingCrew.length, s: `${pendingReqs.length} approvals` },
    { l: "Budget Spent", v: `${budgetPct}%`, s: `${zar(secured)} of ${zar(totalBudget)}` },
  ];
  const onSet = productions.find((p) => p.status === "Active");
  const today = onSet ? bookings.filter((b) => b.productionId === onSet.id) : [];
  const dateLabel = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const activity = [
    ...reqs.filter((r) => r.state !== "Pending").map((r) => ({ id: `r${r.id}`, before: `${r.kind} for `, crewId: crewIdByName(r.who), who: r.who, after: ` ${r.state.toLowerCase()}`, sub: r.production, client: clientByProdName(r.production), productionId: prodIdByName(r.production), at: r.createdAt })),
    ...bookings.filter((b) => b.status === "confirmed").map((b) => ({ id: `b${b.id}`, before: "", crewId: b.crewId, who: crewName(b.crewId), after: ` confirmed as ${b.role}`, sub: prodName(b.productionId), client: clientByProdId(b.productionId), productionId: b.productionId as string | undefined, at: b.createdAt ?? "" })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
  const activityStamp = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
    return sameDay ? time : `${d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} · ${time}`;
  };

  return (
    <Page title={`${greet}${first ? `, ${first}` : ""}`} subtitle={dateLabel}
      actions={<Link to="/productions" search={{ new: true }} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm">+ New production</Link>}>
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
          <Panel title="Needs your attention" right={<span className="text-xs text-muted-foreground">{pendingReqs.length + waitingCrew.length} open</span>}>
            <ul className="divide-y divide-border">
              {pendingReqs.length + waitingCrew.length === 0 && <li className="p-4 text-sm text-muted-foreground">All caught up.</li>}
              {pendingReqs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm"><span className="font-semibold text-primary">{r.kind}</span> · {r.detail}</div>
                    <div className="flex flex-wrap items-center gap-1 truncate text-xs text-muted-foreground"><NameLink id={crewIdByName(r.who)} name={r.who} /> · {clientByProdName(r.production) && <ClientLink productionId={prodIdByName(r.production)} name={clientByProdName(r.production)!} />} {r.production} · {zar(r.amount)}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setState.mutate({ id: r.id, state: "Approved" })} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Approve</button>
                    <button onClick={() => setState.mutate({ id: r.id, state: "Declined" })} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90">Decline</button>
                  </div>
                </li>
              ))}
              {waitingCrew.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success/20 text-success"><Check className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium"><CrewLink id={b.crewId} /> accepted your {b.pencilPriority === 2 ? "2nd" : "1st"} pencil</div>
                    <div className="flex flex-wrap items-center gap-1 truncate text-xs text-muted-foreground">
                      {clientByProdId(b.productionId) && <ClientLink productionId={b.productionId} name={clientByProdId(b.productionId)!} />} {prodName(b.productionId)} · {b.role}{b.bookingDate ? ` · ${b.bookingDate}` : ""} · {zar(b.crewRate)} a day
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
            <div className="grid gap-3 p-4">
              {filteredProductions.length === 0 && <p className="text-sm text-muted-foreground">No {prodFilter.toLowerCase()} productions.</p>}
              {filteredProductions.map((p) => {
                const pct = p.crewNeeded ? Math.min(100, Math.round((p.crewBooked / p.crewNeeded) * 100)) : 0;
                return (
                  <Link key={p.id} to="/productions/$id" params={{ id: p.id }} className="group block rounded-lg border border-border bg-background p-4 transition hover:border-primary">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold group-hover:text-primary">{p.name}</div>
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

          <Panel title={<>On set today{onSet && <> · {onSet.name}</>}</>}>
            <ul className="divide-y divide-border text-sm">
              {today.length === 0 && <li className="p-4 text-muted-foreground">Nobody on set today.</li>}
              {today.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 font-medium"><CrewLink id={b.crewId} /> <span className="font-normal text-muted-foreground">· {b.role}</span></span>
                  <Badge>{b.status}</Badge>
                  {b.attendance && <Badge>{b.attendance}</Badge>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-5">
          <MiniCalendar productions={productions} bookings={bookings} />
          <Panel title="Live activity" right={<span className="text-xs text-muted-foreground">Across web and mobile</span>}>
            <ul className="divide-y divide-border text-sm">
              {activity.length === 0 && <li className="p-4 text-muted-foreground">No activity yet.</li>}
              {activity.map((a) => (
                <li key={a.id} className="flex gap-3 px-4 py-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block">{a.before}<NameLink id={a.crewId} name={a.who} />{a.after}</span>
                    <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{a.client && <ClientLink productionId={a.productionId} name={a.client} />} {a.sub}</span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{activityStamp(a.at)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Page>
  );
}

function PendingGate({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const uid = session?.user.id;
  const req = useQuery({
    queryKey: ["my-join-request", uid], enabled: !!uid,
    queryFn: async () => { const { data } = await supabase.from("company_join_requests").select("status, companies(name)").eq("user_id", uid!).order("created_at", { ascending: false }).limit(1).maybeSingle(); return data; },
  });
  if (req.isLoading) return <Page open title="Home"><p className="text-muted-foreground">Loading…</p></Page>;
  if (req.data && req.data.status !== "approved") {
    const name = (req.data.companies as { name?: string } | null)?.name ?? "your company";
    return (
      <Page open title="Registration pending approval">
        <div className="max-w-lg rounded-lg border border-border bg-card p-5 text-sm">
          {req.data.status === "pending"
            ? <>Your email address belongs to <b>{name}</b>. For security, one of its admins needs to approve your registration. You'll get full access as soon as they do.</>
            : <>An admin at <b>{name}</b> declined this registration. Please contact them if you think this is a mistake.</>}
        </div>
      </Page>
    );
  }
  return <>{children}</>;
}

const COUNTRY_OPTIONS = ["South Africa", "Namibia", "Botswana", "Kenya", "Nigeria", "Cyprus", "United Kingdom"];
function SpotlightCard() {
  const { session } = useSession();
  const uid = session?.user.id;
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["my-spotlight", uid], enabled: !!uid,
    queryFn: async () => { const { data } = await supabase.from("profiles").select("social_opt_in, country").eq("id", uid!).maybeSingle(); return data; },
  });
  async function save(patch: { social_opt_in?: boolean; country?: string }) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", uid!);
    if (error) return void toast.error(friendlyError(error));
    toast.success("Saved"); qc.invalidateQueries({ queryKey: ["my-spotlight", uid] });
  }
  if (!me.data) return null;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm">
      <label className="flex flex-1 items-center gap-2">
        <input type="checkbox" checked={me.data.social_opt_in} onChange={(e) => save({ social_opt_in: e.target.checked })} />
        Feature me on Book a Crew social media
      </label>
      <select className="rounded-sm border border-input bg-background px-2 py-1" value={me.data.country ?? ""} onChange={(e) => save({ country: e.target.value })}>
        <option value="">Country…</option>
        {COUNTRY_OPTIONS.map((c) => <option key={c}>{c}</option>)}
      </select>
    </div>
  );
}
