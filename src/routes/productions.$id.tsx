import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Page, Panel } from "@/components/AppShell";
import { bookings, crew, productions, zar } from "@/lib/demo-data";

export const Route = createFileRoute("/productions/$id")({
  loader: ({ params }) => {
    const p = productions.find((x) => x.id === params.id);
    if (!p) throw notFound();
    return p;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Production"} — Book a Crew` },
      { name: "description", content: `Crew breakdown, bookings and budget for ${loaderData?.name ?? "this production"}.` },
      { property: "og:title", content: `${loaderData?.name ?? "Production"} — Book a Crew` },
      { property: "og:description", content: "Production breakdown and bookings." },
    ],
  }),
  component: ProductionDetail,
});

function ProductionDetail() {
  const p = Route.useLoaderData();
  const [clientView, setClientView] = useState(false);
  const rows = bookings.filter((b) => b.productionId === p.id);
  const crewCost = rows.reduce((a, b) => a + b.crewRate * b.days, 0);
  const clientTotal = rows.reduce((a, b) => a + b.clientCharge * b.days, 0);

  return (
    <Page title={p.name} subtitle={`${p.client} · ${p.type} · ${p.location} · ${p.date} · ${p.days} day(s)`}
      actions={
        <div className="flex rounded-sm border border-border text-xs font-semibold uppercase">
          <button onClick={() => setClientView(false)} className={`px-3 py-2 ${!clientView ? "bg-primary text-primary-foreground" : ""}`}>Producer view</button>
          <button onClick={() => setClientView(true)} className={`px-3 py-2 ${clientView ? "bg-primary text-primary-foreground" : ""}`}>Client view</button>
        </div>
      }>
      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-4">
        {[
          ["Budget", zar(p.budget)],
          clientView ? ["Quoted to client", zar(clientTotal)] : ["Crew cost (internal)", zar(crewCost)],
          clientView ? ["Crew booked", `${p.crewBooked}/${p.crewNeeded}`] : ["Margin", zar(clientTotal - crewCost)],
          ["Secured funds", zar(p.securedFunds)],
        ].map(([l, v]) => (
          <div key={l} className="bg-card px-4 py-3"><div className="text-[11px] uppercase tracking-wider text-muted-foreground">{l}</div><div className="font-display text-2xl font-semibold">{v}</div></div>
        ))}
      </div>
      <Panel title="Crew breakdown" right={<Badge>{p.status}</Badge>}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Role</th><th className="px-4 font-medium">Crew</th><th className="px-4 font-medium">Days</th>
              {!clientView && <th className="px-4 font-medium">Crew rate</th>}
              <th className="px-4 font-medium">{clientView ? "Day charge" : "Client charge"}</th><th className="px-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No crew booked yet.</td></tr>}
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">{b.role}</td>
                <td className="px-4">{crew.find((c) => c.id === b.crewId)?.name}</td>
                <td className="px-4">{b.days}</td>
                {!clientView && <td className="px-4 text-muted-foreground">{zar(b.crewRate)}</td>}
                <td className="px-4">{zar(b.clientCharge)}</td>
                <td className="px-4"><Badge>{b.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {clientView && <p className="mt-3 text-xs text-muted-foreground">Client view hides internal crew rates and margin.</p>}
    </Page>
  );
}
