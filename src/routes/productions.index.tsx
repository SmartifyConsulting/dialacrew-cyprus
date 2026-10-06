import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Page, Panel } from "@/components/AppShell";
import { productions as seed, zar, type Production } from "@/lib/demo-data";

export const Route = createFileRoute("/productions/")({
  head: () => ({
    meta: [
      { title: "Productions — Book a Crew" },
      { name: "description", content: "Create productions from a client brief and manage every shoot." },
      { property: "og:title", content: "Productions — Book a Crew" },
      { property: "og:description", content: "Create and manage productions." },
    ],
  }),
  component: Productions,
});

const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

function Productions() {
  const [list, setList] = useState<Production[]>(seed);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", client: "", type: "Commercial", location: "", date: "", days: 1, budget: 0 });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name || !f.client) return;
    setList([{ id: `n${Date.now()}`, ...f, status: "Upcoming", crewBooked: 0, crewNeeded: 0, securedFunds: 0 }, ...list]);
    setOpen(false);
    setF({ name: "", client: "", type: "Commercial", location: "", date: "", days: 1, budget: 0 });
  };

  return (
    <Page title="Productions" subtitle="Start from the client brief, then break it down into crew and resources."
      actions={<button onClick={() => setOpen(!open)} className="rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold uppercase tracking-widest text-primary-foreground">{open ? "Cancel" : "+ New production"}</button>}>
      {open && (
        <form onSubmit={submit} className="mb-5 grid gap-3 rounded-sm border border-primary/50 bg-card p-4 md:grid-cols-4">
          <input className={field} placeholder="Production name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={field} placeholder="Client *" value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })} />
          <select className={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {["Commercial", "Film", "Television", "Photography", "Other"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className={field} placeholder="Shoot location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <input className={field} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <input className={field} type="number" min={1} placeholder="Shoot days" value={f.days} onChange={(e) => setF({ ...f, days: +e.target.value })} />
          <input className={field} type="number" min={0} placeholder="Budget (ZAR)" value={f.budget || ""} onChange={(e) => setF({ ...f, budget: +e.target.value })} />
          <button className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold uppercase text-primary-foreground">Create</button>
        </form>
      )}
      <Panel title="All productions">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>{["Production", "Type", "Location", "Date", "Days", "Budget", "Status"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-4 py-2.5 font-medium"><Link to="/productions/$id" params={{ id: p.id }} className="hover:text-primary">{p.name}</Link><div className="text-xs text-muted-foreground">{p.client}</div></td>
                <td className="px-4">{p.type}</td>
                <td className="px-4 text-muted-foreground">{p.location}</td>
                <td className="px-4 text-muted-foreground">{p.date}</td>
                <td className="px-4">{p.days}</td>
                <td className="px-4">{zar(p.budget)}</td>
                <td className="px-4"><Badge>{p.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </Page>
  );
}
