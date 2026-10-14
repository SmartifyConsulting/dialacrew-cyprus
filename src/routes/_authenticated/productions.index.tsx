import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import { Badge, ClientBadge, Page, Panel } from "@/components/AppShell";
import { zar } from "@/lib/demo-data";
import { useProductions } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/productions/")({
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
  const list = useProductions().data ?? [];
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => { const { data, error } = await supabase.from("clients").select("id, name, company").order("company"); if (error) throw error; return data ?? []; },
  }).data ?? [];
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", client: "", type: "Commercial", location: "", date: "", days: 1, budget: 0 });

  // New productions start as a Draft so the team can sandbox crew groups against the budget before committing.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name || !f.client) { toast.error("Name and client are required"); return; }
    const { data, error } = await supabase.from("productions").insert({ ...f, date: f.date || null, status: "Draft" }).select("id").single();
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["productions"] });
    setOpen(false);
    setF({ name: "", client: "", type: "Commercial", location: "", date: "", days: 1, budget: 0 });
    navigate({ to: "/productions/$id", params: { id: data.id }, search: { tab: "find-crew" } });
  };

  return (
    <Page title="Projects" subtitle="Start from the client brief, then break it down into crew and resources."
      actions={<button onClick={() => setOpen(!open)} className="rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground">{open ? "Cancel" : "+ New production"}</button>}>
      {open && (
        <form onSubmit={submit} className="mb-5 grid gap-3 rounded-sm border border-primary/50 bg-card p-4 md:grid-cols-4">
          <input className={field} placeholder="Production name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select className={field} value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}>
            <option value="">Select client *</option>
            {clients.map((c) => <option key={c.id} value={c.company}>{c.company} — {c.name}</option>)}
          </select>
          <select className={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {["Commercial", "Film", "Television", "Photography", "Other"].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input className={field} placeholder="Shoot location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <input className={field} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          <input className={field} type="number" min={1} placeholder="Shoot days" value={f.days} onChange={(e) => setF({ ...f, days: +e.target.value })} />
          <input className={field} type="number" min={0} placeholder="Budget (ZAR)" value={f.budget || ""} onChange={(e) => setF({ ...f, budget: +e.target.value })} />
          <button className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Create draft</button>
        </form>
      )}
      <div className="grid gap-3 md:hidden">
        {list.map((p) => (
          <Link key={p.id} to="/productions/$id" params={{ id: p.id }} className="block rounded-sm border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{p.name}</div><div className="mt-1 flex items-center gap-2"><ClientBadge name={p.client} /><span className="text-xs text-muted-foreground">{p.type}</span></div></div>
              <Badge>{p.status}</Badge>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{p.date || "Date TBC"} · {p.days} day(s) · {p.location}</div>
            <div className="mt-3 flex items-center justify-between text-sm"><span>{zar(p.budget)}</span><span className="text-xs text-muted-foreground">Crew {p.crewBooked}/{p.crewNeeded}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${p.crewNeeded ? Math.min(100, (p.crewBooked / p.crewNeeded) * 100) : 0}%` }} /></div>
          </Link>
        ))}
      </div>
      <div className="hidden md:block"><Panel title="All productions">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground">
            <tr>{["Production", "Type", "Location", "Date", "Days", "Budget", "Status"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-4 py-2.5 font-medium"><Link to="/productions/$id" params={{ id: p.id }} className="hover:text-primary">{p.name}</Link><div className="mt-1"><ClientBadge name={p.client} /></div></td>
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
      </Panel></div>
    </Page>
  );
}
