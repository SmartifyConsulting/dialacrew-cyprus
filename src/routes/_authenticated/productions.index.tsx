import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
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

type ClientRow = { id: string; name: string; company: string };

// Dropdown to pick an existing client, add a new one inline, or bulk-import a CSV of clients.
function ClientPicker({ clients, value, onChange, onClientsChanged }: { clients: ClientRow[]; value: string; onChange: (company: string) => void; onClientsChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newClient, setNewClient] = useState({ company: "", name: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const filtered = clients.filter((c) => c.company.toLowerCase().includes(query.toLowerCase()) || c.name.toLowerCase().includes(query.toLowerCase()));

  async function addClient() {
    if (!newClient.company.trim()) { toast.error("Company name is required"); return; }
    setBusy(true);
    const { error } = await supabase.from("clients").insert({ company: newClient.company.trim(), name: newClient.name.trim() || newClient.company.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${newClient.company} added`);
    onClientsChanged();
    onChange(newClient.company.trim());
    setNewClient({ company: "", name: "" });
    setAdding(false);
    setOpen(false);
  }

  // Expects a simple CSV with a header row: company,name,email,phone (name/email/phone optional).
  async function uploadCsv(file: File) {
    const text = await file.text();
    const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
    if (rows.length < 2) { toast.error("CSV has no data rows"); return; }
    const header = rows[0]!.split(",").map((h) => h.trim().toLowerCase());
    const companyIdx = header.indexOf("company");
    if (companyIdx === -1) { toast.error("CSV must have a 'company' column"); return; }
    const nameIdx = header.indexOf("name");
    const emailIdx = header.indexOf("email");
    const phoneIdx = header.indexOf("phone");
    const records = rows.slice(1).map((r) => {
      const cols = r.split(",").map((c) => c.trim());
      const company = cols[companyIdx] ?? "";
      return { company, name: (nameIdx > -1 ? cols[nameIdx] : "") || company, email: emailIdx > -1 ? cols[emailIdx] ?? "" : "", phone: phoneIdx > -1 ? cols[phoneIdx] ?? "" : "" };
    }).filter((r) => r.company);
    if (records.length === 0) { toast.error("No valid rows found"); return; }
    setBusy(true);
    const { error } = await supabase.from("clients").insert(records);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Imported ${records.length} client(s)`);
    onClientsChanged();
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={`${field} flex items-center justify-between text-left`}>
        <span className={value ? "" : "text-muted-foreground"}>{value || "Select client *"}</span>
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-sm border border-border bg-card shadow-md">
          <div className="p-2">
            <input autoFocus className={field} placeholder="Search clients…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { onChange(c.company); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                  {c.company} — {c.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No clients found.</li>}
          </ul>
          <div className="border-t border-border p-2">
            {adding ? (
              <div className="space-y-2">
                <input className={field} placeholder="Company name *" value={newClient.company} onChange={(e) => setNewClient({ ...newClient, company: e.target.value })} />
                <input className={field} placeholder="Contact name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={addClient} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : "Save client"}</button>
                  <button type="button" onClick={() => setAdding(false)} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-primary hover:underline">+ Add new client</button>
                <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Upload className="h-3.5 w-3.5" /> Upload clients
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadCsv(file); e.target.value = ""; }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Productions() {
  const list = useProductions().data ?? [];
  const qc = useQueryClient();
  const navigate = useNavigate();
  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: async () => { const { data, error } = await supabase.from("clients").select("id, name, company").order("company"); if (error) throw error; return data ?? []; },
  });
  const clients = clientsQuery.data ?? [];
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
          <ClientPicker clients={clients} value={f.client} onChange={(company) => setF({ ...f, client: company })} onClientsChanged={() => qc.invalidateQueries({ queryKey: ["clients"] })} />
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
