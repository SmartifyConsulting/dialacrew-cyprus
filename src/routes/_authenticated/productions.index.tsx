import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Badge, ClientBadge, Page, Panel } from "@/components/AppShell";
import { zar } from "@/lib/demo-data";
import { useCreatePencil, useCrew, useProductions } from "@/lib/db";
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

// Logical on-set order: direction, camera, lighting, art/costume/hair-MU, support.
const CREW_ROLES = [
  "Director", "Director of Photography", "Focus Puller", "Gaffer", "Art Department", "Wardrobe", "Make-Up",
  "Catering", "Production Assistant",
] as const;

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
  function parseCsv(text: string) {
    const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
    if (rows.length < 2) { toast.error("File has no data rows"); return null; }
    const header = rows[0]!.split(",").map((h) => h.trim().toLowerCase());
    const companyIdx = header.indexOf("company");
    if (companyIdx === -1) { toast.error("File must have a 'company' column"); return null; }
    const nameIdx = header.indexOf("name");
    const emailIdx = header.indexOf("email");
    const phoneIdx = header.indexOf("phone");
    return rows.slice(1).map((r) => {
      const cols = r.split(",").map((c) => c.trim());
      const company = cols[companyIdx] ?? "";
      return { company, name: (nameIdx > -1 ? cols[nameIdx] : "") || company, email: emailIdx > -1 ? cols[emailIdx] ?? "" : "", phone: phoneIdx > -1 ? cols[phoneIdx] ?? "" : "" };
    }).filter((r) => r.company);
  }

  async function uploadClientsFile(file: File) {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (ext !== "csv" && ext !== "xls" && ext !== "xlsx") {
      toast.error("Only .csv or .xls files are supported — please upload one of those formats.");
      return;
    }
    if (ext === "xls" || ext === "xlsx") {
      toast.error(".xls isn't readable as plain text yet — please export/save your spreadsheet as .csv and upload that instead.");
      return;
    }
    const records = parseCsv(await file.text());
    if (!records || records.length === 0) { if (records) toast.error("No valid rows found"); return; }
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
                  <Upload className="h-3.5 w-3.5" /> Upload clients (csv or xls)
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv,.xls,.xlsx" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadClientsFile(file); e.target.value = ""; }} />
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
  const crew = useCrew().data ?? [];
  const createPencil = useCreatePencil();
  const [open, setOpen] = useState(false);
  const blankForm = { name: "", client: "", type: "Commercial", location: "", startDate: "", endDate: "", budget: 0 };
  const [f, setF] = useState(blankForm);
  const [roleCrew, setRoleCrew] = useState<Record<string, string>>({});

  // Shoot days is inclusive of both the start and end date.
  const days = f.startDate && f.endDate ? Math.max(1, Math.round((+new Date(f.endDate) - +new Date(f.startDate)) / 86400000) + 1) : 1;

  // New productions start as a Draft so the team can sandbox crew groups against the budget before committing.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name || !f.client) { toast.error("Name and client are required"); return; }
    if (f.startDate && f.endDate && f.endDate < f.startDate) { toast.error("End date can't be before the start date"); return; }
    const { data, error } = await supabase.from("productions").insert({
      name: f.name, client: f.client, type: f.type, location: f.location, budget: f.budget, status: "Draft",
      date: f.startDate || null, end_date: f.endDate || null, days,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    const assigned = Object.entries(roleCrew).filter(([, crewId]) => crewId);
    for (const [role, crewId] of assigned) {
      const rate = crew.find((c) => c.id === crewId)?.dayRate ?? 0;
      try {
        await createPencil.mutateAsync({ productionId: data.id, crewId, role, bookingDate: f.startDate, crewRate: rate, clientCharge: rate, days });
      } catch (err) { toast.error(`Could not pencil ${role}: ${(err as Error).message}`); }
    }
    qc.invalidateQueries({ queryKey: ["productions"] });
    setOpen(false);
    setF(blankForm);
    setRoleCrew({});
    navigate({ to: "/productions/$id", params: { id: data.id }, search: { tab: "find-crew" } });
  };

  return (
    <Page title="Productions" subtitle="Start from the client brief, then break it down into crew and resources."
      actions={<button onClick={() => setOpen(true)} className="rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground">+ New production</button>}>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border border-border bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">New production</h2>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
            </div>
            <div className="rounded-sm border border-border p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Production info</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <ClientPicker clients={clients} value={f.client} onChange={(company) => setF({ ...f, client: company })} onClientsChanged={() => qc.invalidateQueries({ queryKey: ["clients"] })} />
                <input className={field} placeholder="Production name *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                <select className={field} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
                  {["Commercial", "Film", "Television", "Photography", "Other"].map((t) => <option key={t}>{t}</option>)}
                </select>
                <input className={field} placeholder="Shoot location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
                <label className="block"><span className="text-xs text-muted-foreground">Start date</span>
                  <input className={`${field} mt-1`} type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
                <label className="block"><span className="text-xs text-muted-foreground">End date</span>
                  <input className={`${field} mt-1`} type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
                <input className={field} type="number" min={0} placeholder="Budget (ZAR)" value={f.budget || ""} onChange={(e) => setF({ ...f, budget: +e.target.value })} />
                <div className="flex items-center text-xs text-muted-foreground">{f.startDate && f.endDate ? `${days} shoot day(s)` : "Set a start and end date to calculate shoot days"}</div>
              </div>
            </div>

            <div className="mt-4 rounded-sm border border-border p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pencil crew for key roles (optional)</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {CREW_ROLES.map((role) => (
                  <label key={role} className="block">
                    <span className="text-xs text-muted-foreground">{role}</span>
                    <select className={`${field} mt-1`} value={roleCrew[role] ?? ""} onChange={(e) => setRoleCrew({ ...roleCrew, [role]: e.target.value })}>
                      <option value="">Unassigned</option>
                      {crew.map((c) => <option key={c.id} value={c.id}>{c.name} · ★{c.rating.toFixed(1)} · {zar(c.dayRate)}/day</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-sm border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
              <button className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Create draft</button>
            </div>
          </form>
        </div>
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
