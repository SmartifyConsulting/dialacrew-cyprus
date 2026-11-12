import { EVENT_CHIP, useCalendarEvents } from "@/lib/use-calendar-events";
import { useTranslation } from "react-i18next";
import type React from "react";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, CheckSquare, ChevronLeft, ChevronRight, Square } from "lucide-react";
import { Badge, ClientBadge, Page, Panel, clientColor } from "@/components/AppShell";
import { fmtMoney, zar, type Booking, type Production } from "@/lib/demo-data";
import { useBookings, useCrew, useProductions, useRequests, useRespondToBooking, useSetRequestState } from "@/lib/db";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { useMyCrewId, useMyName } from "@/lib/site";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { nativeFeedback } from "@/lib/native";
import { JobTermsDialog } from "@/components/JobTermsDialog";
import { WEATHER_ICONS } from "@/lib/weather";
import { forecastSummary, useCalendarExtras, type DayShoot } from "@/lib/calendar-extras";

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
  const [pendingTermsJob, setPendingTermsJob] = useState<(typeof jobs)[number] | null>(null);
  const [acceptingTerms, setAcceptingTerms] = useState(false);
  const [rejectJob, setRejectJob] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
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
    if (accept) { const job = jobs.find((j) => j.id === id); if (job) setPendingTermsJob(job); return; }
    setRejectJob(id); return;
  }
  async function confirmReject() {
    if (!rejectJob || !rejectReason.trim()) { toast.error("Please provide a reason for declining"); return; }
    setRejectBusy(true);
    const { error } = await supabase.from("bookings").update({ status: "cancelled", cancelled_reason: rejectReason.trim() }).eq("id", rejectJob);
    setRejectBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setRejectJob(null); setRejectReason("");
    toast.success("Job declined");
    void nativeFeedback("warning");
    qc.invalidateQueries({ queryKey: ["crew-jobs"] });
  }
  async function acceptWithTerms() {
    if (!pendingTermsJob || acceptingTerms) return;
    setAcceptingTerms(true);
    const { error } = await supabase.rpc("accept_booking_with_terms", { p_booking_id: pendingTermsJob.id, p_terms_version: "dialacrew-terms-2026-10" });
    setAcceptingTerms(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Terms accepted and job confirmed");
    void nativeFeedback("success");
    setPendingTermsJob(null);
    void qc.invalidateQueries({ queryKey: ["crew-jobs"] });
    void qc.invalidateQueries({ queryKey: ["bookings"] });
  }
  return (
    <Page open title="Home" subtitle="Your jobs and call times">
      {rejectJob && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/35 p-4"><section role="dialog" aria-modal="true" aria-label="Decline pencil" className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl"><h2 className="text-lg font-bold">Decline this pencil?</h2><p className="my-2 text-sm text-muted-foreground">Please tell the producer why you cannot accept.</p><textarea autoFocus rows={3} value={rejectReason} onChange={e=>setRejectReason(e.target.value)} className="w-full rounded-md border border-input bg-background p-3 text-sm" placeholder="Reason for declining" /><div className="mt-4 flex justify-end gap-2"><button disabled={rejectBusy} onClick={()=>{setRejectJob(null);setRejectReason("");}} className="rounded-md border px-4 py-2 text-sm">Keep pencil</button><button disabled={rejectBusy||!rejectReason.trim()} onClick={confirmReject} className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">Confirm decline</button></div></section></div>}
      {pendingTermsJob && <JobTermsDialog jobName={pendingTermsJob.productions?.name ?? "Production"} role={pendingTermsJob.role} busy={acceptingTerms} onAccept={acceptWithTerms} onClose={() => setPendingTermsJob(null)} />}
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
              <button onClick={() => respond(j.id, false)} className="rounded-xl bg-[#DC143C] py-3 text-sm font-semibold text-white hover:bg-[#DC143C]/90">Decline</button>
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
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardRouter,
});

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type MiniCalItem = { id: string; color: string; client: string; name: string; location: string; time: string; isRecce?: boolean; kind: "shoot" | "recce" | "gear"; details?: string | undefined };

// Popup for the calendar's weather, client chips and task icon: shows on hover, and on tap/keyboard focus for touch screens.
// `align` keeps it on screen for the grid's left and right columns.
function CalPop({ label, align, trigger, children }: { label: string; align: "left" | "center" | "right"; trigger: React.ReactNode; children: React.ReactNode }) {
  const pos = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <span className="group relative inline-flex min-w-0 max-w-full">
      <button type="button" aria-label={label} className="inline-flex min-w-0 max-w-full cursor-pointer items-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring">{trigger}</button>
      <span className={`pointer-events-none absolute top-full z-20 mt-1 hidden w-max max-w-56 rounded-xl border border-border bg-card px-3 py-1.5 text-left text-xs font-medium text-foreground shadow-lg group-focus-within:block group-hover:block ${pos}`}>{children}</span>
    </span>
  );
}

// Compact current-month grid: each day shows its weather, a coloured client chip per production shooting that day and a
// task icon when tasks are due — a quick-glance version of the full /calendar page, not a replacement for it.
function MiniCalendar({ productions, bookings }: { productions: Production[]; bookings: Booking[] }) {
  const { t, i18n } = useTranslation();
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  void productions; void bookings;
  // Same normalized events as the full calendar and .ics export.
  const { events, conflicts } = useCalendarEvents();
  const byDay = new Map<string, MiniCalItem[]>();
  const shoots = new Map<string, DayShoot[]>();
  for (const e of events) {
    const item: MiniCalItem = {
      id: e.uid, color: clientColor(e.client), client: e.client, name: e.title, kind: e.kind, isRecce: e.kind === "recce",
      location: e.location, time: e.timeLabel + (conflicts.has(e.uid) ? ` · ${t("dashboard.overlap")}` : ""), details: e.details,
    };
    byDay.set(e.day, [...(byDay.get(e.day) ?? []), item]);
    shoots.set(e.day, [...(shoots.get(e.day) ?? []), { id: e.productionId, lat: e.lat ?? null, lon: e.lon ?? null }]);
  }
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysIn) / 7) * 7 }, (_, i) => {
    const n = i - offset + 1;
    return n >= 1 && n <= daysIn ? new Date(month.getFullYear(), month.getMonth(), n) : null;
  });
  const todayIso = isoDate(today);
  const { forecastFor, tasksByDay } = useCalendarExtras(shoots, isoDate(first), isoDate(new Date(month.getFullYear(), month.getMonth() + 1, 0)));

  return (
    <Panel title={t("nav.calendar")} right={<Link to="/calendar" className="text-xs font-semibold text-primary hover:underline">{t("dashboard.open")}</Link>}>
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2 text-[10px] text-muted-foreground"><span className="rounded-sm bg-black px-1 py-0.5 font-semibold text-white">{t("dashboard.recce")}</span><span className="rounded-sm bg-purple-700 px-1 py-0.5 font-semibold text-white">{t("dashboard.gear")}</span></div>
      <div className="flex items-center justify-between px-3 pt-2">
        <button type="button" aria-label={t("dashboard.previousMonth")} onClick={() => shift(-1)} className="rounded-sm border border-border p-1 text-muted-foreground hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <span className="text-xs font-semibold">{month.toLocaleDateString(i18n.language, { month: "long", year: "numeric" })}</span>
        <button type="button" aria-label={t("dashboard.nextMonth")} onClick={() => shift(1)} className="rounded-sm border border-border p-1 text-muted-foreground hover:text-foreground"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-3">
        <div className="mb-1 grid grid-cols-7 text-center text-[10px] text-muted-foreground">
          {Array.from({ length: 7 }, (_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(i18n.language, { weekday: "short" })).map((day, index) => <div key={index}>{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            const key = d ? isoDate(d) : "";
            const items = d ? byDay.get(key) ?? [] : [];
            const weather = d ? forecastFor(key) : null;
            const dayTasks = d ? tasksByDay.get(key) ?? [] : [];
            const align = i % 7 < 2 ? "left" : i % 7 > 4 ? "right" : "center";
            return (
              <div key={i} className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-md text-[11px] ${d && key === todayIso ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}>
                {d && <span>{d.getDate()}</span>}
                {weather && (
                  <CalPop label={forecastSummary(weather)} align={align}
                    trigger={<span className="flex items-center gap-0.5 text-[11px] leading-none"><span className="text-[16.5px]" aria-hidden="true">{WEATHER_ICONS[weather.code] ?? "🌡️"}</span>{weather.max != null ? `${Math.round(weather.max)}°` : ""}</span>}>
                    {forecastSummary(weather)}
                  </CalPop>
                )}
                <span className="flex min-h-3.5 max-w-full flex-wrap items-center justify-center gap-0.5">
                  {items.map((item) => (
                    <CalPop key={item.id} label={`${item.client} · ${item.name} · ${item.location} · ${item.time}`} align={align}
                      trigger={<span className={`max-w-full truncate rounded-sm px-1 py-0.5 text-[9px] font-semibold leading-none ${item.kind === "shoot" ? item.color : EVENT_CHIP[item.kind]}`}>{item.kind === "recce" ? `${t("dashboard.recce")}${item.time.startsWith("Time TBC") ? "" : ` ${item.time.split(" · ")[0]}`}` : item.kind === "gear" ? t("dashboard.gear") : item.client}</span>}>
                      {item.client} · {item.name} · {item.location} · {item.time}
                      {item.details && <span className="mt-1 block whitespace-pre-line font-normal text-muted-foreground">{item.details}</span>}
                    </CalPop>
                  ))}
                  {dayTasks.length > 0 && (
                    <CalPop label={t("dashboard.tasksDue", { count: dayTasks.length })} align={align}
                      trigger={<CheckSquare className={`h-3.5 w-3.5 ${dayTasks.every((t) => t.done) ? "text-success" : "text-primary"}`} />}>
                      <ul className="space-y-1">
                        {dayTasks.map((t) => (
                          <li key={t.id} className="flex items-start gap-1.5">
                            {t.done ? <CheckSquare className="mt-0.5 h-3 w-3 shrink-0 text-success" /> : <Square className="mt-0.5 h-3 w-3 shrink-0 text-primary" />}
                            <span className={t.done ? "line-through opacity-70" : ""}>{t.title}</span>
                          </li>
                        ))}
                      </ul>
                    </CalPop>
                  )}
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
  const { t, i18n } = useTranslation();
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
  const kpiProduction = productions.find((p) => p.status === "Active") ?? productions[0];
  const countFor = (s: string) => bookings.filter((b) => b.status === s && (!kpiProduction || b.productionId === kpiProduction.id)).length;
  const secured = productions.reduce((a, p) => a + p.securedFunds, 0);
  const totalBudget = productions.reduce((a, p) => a + p.budget, 0);
  const budgetPct = totalBudget ? Math.round((secured / totalBudget) * 100) : 0;
  const pendingReqs = reqs.filter((r) => r.state === "Pending");
  const waitingCrew = bookings.filter((b) => b.status === "awaiting_crew_confirmation");
  const [prodFilter, setProdFilter] = useState<"Active" | "Upcoming" | "Wrapped">("Upcoming");
  const filteredProductions = productions.filter((p) => p.status === prodFilter);
  const hour = new Date().getHours();
  const greet = t(hour < 12 ? "dashboard.morning" : hour < 18 ? "dashboard.afternoon" : "dashboard.evening");
  const kpis = [
    { l: t("dashboard.activeProductions"), v: productions.filter((p) => p.status === "Active").length, s: t("dashboard.upcomingCount", { count: productions.filter((p) => p.status === "Upcoming").length }) },
    { l: `${t("dashboard.crewConfirmed")}${kpiProduction ? ` · ${kpiProduction.name}` : ""}`, v: countFor("confirmed"), s: t("dashboard.pencilCount", { count: countFor("pencil") }) },
    { l: t("dashboard.action"), v: pendingReqs.length + waitingCrew.length, s: t("dashboard.approvals", { count: pendingReqs.length }) },
    { l: t("dashboard.budgetSpent"), v: `${budgetPct}%`, s: t("dashboard.budgetOf", { spent: zar(secured), total: zar(totalBudget) }) },
  ];
  const onSet = productions.find((p) => p.status === "Active");
  const today = onSet ? bookings.filter((b) => b.productionId === onSet.id) : [];
  const dateLabel = new Date().toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const activity = [
    ...reqs.filter((r) => r.state !== "Pending").map((r) => ({ id: `r${r.id}`, before: t("dashboard.requestFor", { kind: t(`dashboard.kind.${r.kind}`, r.kind) }), crewId: crewIdByName(r.who), who: r.who, after: ` ${t(`dashboard.state.${r.state}`, r.state)}`, sub: r.production, client: clientByProdName(r.production), productionId: prodIdByName(r.production), at: r.createdAt })),
    ...bookings.filter((b) => b.status === "confirmed").map((b) => ({ id: `b${b.id}`, before: "", crewId: b.crewId, who: crewName(b.crewId), after: t("dashboard.confirmedAs", { role: b.role }), sub: prodName(b.productionId), client: clientByProdId(b.productionId), productionId: b.productionId as string | undefined, at: b.createdAt ?? "" })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
  const activityStamp = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    const time = d.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
    return sameDay ? time : `${d.toLocaleDateString(i18n.language, { day: "numeric", month: "short" })} · ${time}`;
  };

  return (
    <Page title={`${greet}${first ? `, ${first}` : ""}`} subtitle={dateLabel}
      actions={<Link to="/productions" search={{ new: true }} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm">+ {t("dashboard.newProduction")}</Link>}>
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
          <MiniCalendar productions={productions} bookings={bookings} />

          <Panel title={t("nav.productions")} right={
            <div className="flex gap-1">
              {(["Active", "Upcoming", "Wrapped"] as const).map((s) => (
                <button key={s} onClick={() => setProdFilter(s)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold ${prodFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  {t(`dashboard.productionState.${s}`)}
                </button>
              ))}
            </div>
          }>
            <div className="grid gap-2 overflow-x-auto p-3">
              {filteredProductions.length === 0 && <p className="text-sm text-muted-foreground">{t(`dashboard.emptyProductions.${prodFilter}`)}</p>}
              {filteredProductions.map((p) => {
                const pct = p.crewNeeded ? Math.min(100, Math.round((p.crewBooked / p.crewNeeded) * 100)) : 0;
                return (
                  <Link key={p.id} to="/productions/$id" params={{ id: p.id }} className="group flex min-w-max items-center gap-3 whitespace-nowrap rounded-md border border-border bg-background px-3 py-2 transition hover:border-primary">
                    <span className="text-sm font-semibold group-hover:text-primary">{p.name}</span>
                    <ClientBadge name={p.client} />
                    <span className="text-xs text-muted-foreground">{p.date}</span>
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{t("nav.crew")} {p.crewBooked}/{p.crewNeeded}</span>
                      <span title={`${pct}%`} className="h-1 w-12 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></span>
                    </span>
                    <span className="text-xs text-muted-foreground">{fmtMoney(p.budget, p.currency)}</span>
                    <Badge>{t(`dashboard.productionState.${p.status}`, p.status)}</Badge>
                  </Link>
                );
              })}
            </div>
          </Panel>

          <Panel title={<>{t("dashboard.onSet")}{onSet && <> · {onSet.name}</>}</>}>
            <ul className="divide-y divide-border text-sm">
              {today.length === 0 && <li className="p-4 text-muted-foreground">{t("dashboard.nobodyOnSet")}</li>}
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
          <Panel title={t("dashboard.action")} right={<span className="text-xs text-muted-foreground">{t("dashboard.openCount", { count: pendingReqs.length + waitingCrew.length })}</span>}>
            <ul className="divide-y divide-border">
              {pendingReqs.length + waitingCrew.length === 0 && <li className="p-4 text-sm text-muted-foreground">{t("dashboard.caughtUp")}</li>}
              {pendingReqs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm"><span className="font-semibold text-primary">{t(`dashboard.kind.${r.kind}`, r.kind)}</span> · {r.detail}</div>
                    <div className="flex flex-wrap items-center gap-1 truncate text-xs text-muted-foreground"><NameLink id={crewIdByName(r.who)} name={r.who} /> · {clientByProdName(r.production) && <ClientLink productionId={prodIdByName(r.production)} name={clientByProdName(r.production)!} />} {r.production} · {zar(r.amount)}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setState.mutate({ id: r.id, state: "Approved" })} className="rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white">{t("dashboard.approve")}</button>
                    <button onClick={() => setState.mutate({ id: r.id, state: "Declined" })} className="rounded-md bg-[#DC143C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#DC143C]/90">{t("dashboard.decline")}</button>
                  </div>
                </li>
              ))}
              {waitingCrew.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success/20 text-success"><Check className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium"><CrewLink id={b.crewId} />{t("dashboard.acceptedPencil", { priority: b.pencilPriority === 2 ? 2 : 1 })}</div>
                    <div className="flex flex-wrap items-center gap-1 truncate text-xs text-muted-foreground">
                      {clientByProdId(b.productionId) && <ClientLink productionId={b.productionId} name={clientByProdId(b.productionId)!} />} {prodName(b.productionId)} · {b.role}{b.bookingDate ? ` · ${b.bookingDate}` : ""} · {zar(b.crewRate)} {t("gigs.perDay")}
                    </div>
                  </div>
                  <button onClick={() => respondToBooking.mutate({ id: b.id, status: "confirmed" })} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">{t("dashboard.confirmBooking")}</button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={t("dashboard.liveActivity")} right={<span className="text-xs text-muted-foreground">{t("dashboard.webMobile")}</span>}>
            <ul className="divide-y divide-border text-sm">
              {activity.length === 0 && <li className="p-4 text-muted-foreground">{t("dashboard.noActivity")}</li>}
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
