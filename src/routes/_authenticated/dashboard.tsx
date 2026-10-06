import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Page, Panel } from "@/components/AppShell";
import { zar } from "@/lib/demo-data";
import { useBookings, useCrew, useProductions, useRequests, useSetRequestState } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Producer Dashboard — Book a Crew" },
      { name: "description", content: "Active productions, bookings, approvals, attendance and secured funds at a glance." },
      { property: "og:title", content: "Producer Dashboard — Book a Crew" },
      { property: "og:description", content: "Your production operations in one view." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const productions = useProductions().data ?? [];
  const crew = useCrew().data ?? [];
  const bookings = useBookings().data ?? [];
  const reqs = useRequests().data ?? [];
  const setState = useSetRequestState();
  const crewName = (id: string) => crew.find((c) => c.id === id)?.name ?? "—";
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
  const today = bookings.filter((b) => b.productionId === "p1");

  return (
    <Page title="Dashboard" subtitle="Tuesday 6 October 2026 · Producer: Clevercat Productions"
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
          <Panel title="On set today · Savanna Gin TVC">
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
