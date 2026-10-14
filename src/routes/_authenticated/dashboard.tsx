import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Page, Panel } from "@/components/AppShell";
import { zar } from "@/lib/demo-data";
import { useBookings, useCrew, useProductions, useRequests, useSetRequestState } from "@/lib/db";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { useMyCrewId } from "@/lib/site";
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
      const { data, error } = await supabase.from("bookings").select("id, role, status, booking_date, call_time, production_id, productions(name, client, address, location)").eq("crew_id", crewId!).order("booking_date");
      if (error) throw error; return data ?? [];
    },
  }).data ?? [];
  const live = jobs.filter((j) => !["cancelled", "completed", "payment_released"].includes(j.status));
  const qc = useQueryClient();
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayJob = live.find((j) => j.booking_date === todayIso) ?? live.find((j) => (j.booking_date ?? "") >= todayIso);
  const pencils = live.filter((j) => j.status === "pencil" || j.status === "awaiting_crew_confirmation");
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
            <div className="text-xs font-semibold uppercase tracking-widest opacity-80">{todayJob.booking_date === todayIso ? "Today" : "Next up"} · {todayJob.booking_date}</div>
            <div className="mt-1 font-display text-2xl font-semibold">{pr?.name ?? "Production"}</div>
            <div className="mt-1 text-sm opacity-90">{todayJob.role}{todayJob.call_time ? ` · call ${todayJob.call_time.slice(0, 5)}` : ""}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/productions/$id" params={{ id: todayJob.production_id }} className="rounded-md bg-background px-4 py-2 text-sm font-semibold text-foreground">Open job</Link>
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
                  <div className="min-w-0 flex-1"><div className="font-semibold">{pr?.name ?? "Production"}</div><div className="text-xs text-muted-foreground">{j.role} · {j.booking_date ?? ""}</div></div>
                  <button onClick={() => respond(j.id, true)} className="rounded-md bg-success px-3 py-1.5 text-xs font-semibold uppercase text-primary-foreground">Accept</button>
                  <button onClick={() => respond(j.id, false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold uppercase">Decline</button>
                </li>
              );
            })}
          </ul>
        </Panel></div>
      )}
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
  const productions = useProductions().data ?? [];
  const crew = useCrew().data ?? [];
  const bookings = useBookings().data ?? [];
  const reqs = useRequests().data ?? [];
  const setState = useSetRequestState();
  const crewName = (id: string | null) => (id ? crew.find((c) => c.id === id)?.name ?? "—" : "Open gig");
  const count = (s: string) => bookings.filter((b) => b.status === s).length;
  const secured = productions.reduce((a, p) => a + p.securedFunds, 0);
  const stats = [
    ["Active productions", productions.filter((p) => p.status === "Active").length],
    ["Upcoming", productions.filter((p) => p.status === "Upcoming").length],
    ["Pencils", count("pencil")],
    ["Confirmed", count("confirmed")],
    ["Pending responses", count("awaiting_crew_confirmation")],
    ["Approvals waiting", reqs.filter((r) => r.state === "Pending").length],
    ["Secured funds", zar(secured)],
    ["Outstanding invoices", zar(186_400)],
  ];
  const onSet = productions.find((p) => p.status === "Active");
  const today = onSet ? bookings.filter((b) => b.productionId === onSet.id) : [];
  const dateLabel = new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <Page title="Home" subtitle={dateLabel}
      actions={<Link to="/productions" className="rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold uppercase tracking-widest text-primary-foreground">+ New production</Link>}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-4 lg:grid-cols-8">
        {stats.map(([l, v]) => (
          <div key={l} className="bg-card px-3 py-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</div>
            <div className="mt-1 font-display text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Productions">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>{["Production", "Client", "Date", "Crew", "Budget", "Secured", "Status"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {productions.map((p) => (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                    <td className="px-4 py-2.5 font-medium"><Link to="/productions/$id" params={{ id: p.id }} className="hover:text-primary">{p.name}</Link></td>
                    <td className="px-4 text-muted-foreground">{p.client}</td>
                    <td className="px-4 text-muted-foreground">{p.date}</td>
                    <td className="px-4">{p.crewBooked}/{p.crewNeeded}</td>
                    <td className="px-4">{zar(p.budget)}</td>
                    <td className="px-4">{zar(p.securedFunds)}</td>
                    <td className="px-4"><Badge>{p.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <Panel title="Approvals">
          <ul>
            {reqs.map((r) => (
              <li key={r.id} className="border-t border-border px-4 py-3 first:border-t-0">
                <div className="flex justify-between text-xs uppercase tracking-wider text-primary"><span>{r.kind}</span><span>{zar(r.amount)}</span></div>
                <div className="mt-1 text-sm">{r.detail}</div>
                <div className="text-xs text-muted-foreground">{r.who} · {r.production}</div>
                {r.state === "Pending" ? (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => setState.mutate({ id: r.id, state: "Approved" })} className="rounded-sm bg-primary px-3 py-1 text-xs font-semibold uppercase text-primary-foreground">Approve</button>
                    <button onClick={() => setState.mutate({ id: r.id, state: "Declined" })} className="rounded-sm border border-border px-3 py-1 text-xs font-semibold uppercase">Decline</button>
                  </div>
                ) : <div className="mt-2 text-xs font-semibold uppercase">{r.state}</div>}
              </li>
            ))}
          </ul>
        </Panel>

        <div className="lg:col-span-2">
          <Panel title={`On set today${onSet ? ` · ${onSet.name}` : ""}`}>
            <table className="w-full text-sm">
              <tbody>
                {today.map((b) => (
                  <tr key={b.id} className="border-t border-border first:border-t-0">
                    <td className="px-4 py-2.5 font-medium">{crewName(b.crewId)}</td>
                    <td className="px-4 text-muted-foreground">{b.role}</td>
                    <td className="px-4"><Badge>{b.status}</Badge></td>
                    <td className="px-4 text-right">{b.attendance && <Badge>{b.attendance}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <Panel title="Pending crew responses">
          <ul className="text-sm">
            {bookings.filter((b) => b.status === "awaiting_crew_confirmation" || b.status === "pencil").map((b) => (
              <li key={b.id} className="flex items-center justify-between border-t border-border px-4 py-2.5 first:border-t-0">
                <span>{crewName(b.crewId)} <span className="text-muted-foreground">· {b.role}</span></span>
                <Badge>{b.status}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </Page>
  );
}
