import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Page, Badge, Panel } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { zar } from "@/lib/demo-data";
import { DocumentChecklistsAdmin } from "@/components/admin/DocumentChecklistsAdmin";
import { EquipmentAdmin } from "@/components/admin/EquipmentAdmin";
import { ChecklistTemplateManager } from "@/components/ChecklistTemplateManager";
import { confirmDialog, promptDialog } from "@/components/ConfirmDialog";

const REQUIRED_FIELDS = ["name", "role", "department"] as const;
const CREW_FIELDS = [...REQUIRED_FIELDS, "location", "email", "phone", "day_rate", "experience"] as const;

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const splitLine = (l: string) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const [headerLine, ...rest] = lines;
  return { headers: headerLine ? splitLine(headerLine) : [], rows: rest.map(splitLine) };
}

function ImportTab() {
  const inv = useInv();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);

  function onFile(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { const parsed = parseCsv(String(reader.result)); setCsv(parsed); setResult(null);
      const auto: Record<string, string> = {};
      for (const f of CREW_FIELDS) { const h = parsed.headers.find((x) => x.toLowerCase().replace(/[\s_]/g, "") === f.replace(/_/g, "")); if (h) auto[f] = h; }
      setMapping(auto);
    };
    reader.readAsText(file);
  }

  async function runImport() {
    if (!csv) return;
    const missing = REQUIRED_FIELDS.filter((f) => !mapping[f]);
    if (missing.length) { toast.error(`Map required fields: ${missing.join(", ")}`); return; }
    setImporting(true);
    const errors: string[] = [];
    let imported = 0, skipped = 0;
    const seen = new Set<string>();
    const idx = (field: string) => csv.headers.indexOf(mapping[field] ?? "");
    const rowsToInsert: { name: string; role: string; department: string; location: string; email: string; phone: string; day_rate: number; experience: number }[] = [];
    csv.rows.forEach((row, i) => {
      const name = row[idx("name")]?.trim();
      const role = row[idx("role")]?.trim();
      const department = row[idx("department")]?.trim();
      if (!name || !role || !department) { errors.push(`Row ${i + 2}: missing required field(s)`); skipped++; return; }
      const email = mapping["email"] ? (row[idx("email")]?.trim() ?? "") : "";
      const dedupeKey = email || name;
      if (seen.has(dedupeKey)) { errors.push(`Row ${i + 2}: duplicate (${dedupeKey}) skipped`); skipped++; return; }
      seen.add(dedupeKey);
      rowsToInsert.push({
        name, role, department,
        location: mapping["location"] ? (row[idx("location")]?.trim() ?? "") : "",
        email, phone: mapping["phone"] ? (row[idx("phone")]?.trim() ?? "") : "",
        day_rate: mapping["day_rate"] ? (Number(row[idx("day_rate")]) || 0) : 0,
        experience: mapping["experience"] ? (Number(row[idx("experience")]) || 0) : 0,
      });
    });
    if (rowsToInsert.length) {
      const { error } = await supabase.from("crew_members").insert(rowsToInsert);
      if (error) errors.push(`Insert failed: ${error.message}`); else imported = rowsToInsert.length;
    }
    setResult({ imported, skipped, errors });
    setImporting(false);
    if (imported > 0) { toast.success(`Imported ${imported} crew member${imported > 1 ? "s" : ""}`); inv(["admin-crew"], ["crew"], ["crew-search"], ["departments"]); }
  }

  return (
    <div className="space-y-5">
      <Panel title="Import crew from CSV">
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">Upload a CSV with a header row. Map its columns to crew fields below, preview, then import. Required: name, role, department.</p>
          <label className="inline-flex w-fit cursor-pointer items-center rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">
            Upload
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="hidden" />
          </label>
          {csv && <p className="text-xs text-muted-foreground">{csv.rows.length} row(s) loaded.</p>}
          {csv && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CREW_FIELDS.map((f) => (
                  <label key={f} className="block text-xs">
                    <span className="uppercase tracking-wider text-muted-foreground">{f}{(REQUIRED_FIELDS as readonly string[]).includes(f) ? " *" : ""}</span>
                    <select className="mt-1 w-full rounded-sm border border-input bg-background px-2 py-1" value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}>
                      <option value="">— not mapped —</option>
                      {csv.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr>{csv.headers.map((h) => <th key={h} className="px-2 py-1 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{csv.rows.slice(0, 5).map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="px-2 py-1">{c}</td>)}</tr>)}</tbody>
                </table>
                <p className="mt-1 text-xs text-muted-foreground">Previewing {Math.min(5, csv.rows.length)} of {csv.rows.length} rows.</p>
              </div>
              <button onClick={runImport} disabled={importing} className="rounded-sm bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
                {importing ? "Importing…" : `Import ${csv.rows.length} rows`}
              </button>
            </>
          )}
          {result && (
            <div className="rounded-sm border border-border bg-muted/30 p-3 text-sm">
              <div>Imported: {result.imported} · Skipped: {result.skipped}</div>
              {result.errors.length > 0 && <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Book a Crew" }] }),
  component: AdminPage,
});

const ADMIN_GROUPS = [
  { name: "People & Organisations", tabs: ["Users", "Crew", "Companies", "Memberships"] },
  { name: "Operations", tabs: ["Bookings", "Equipment", "Import"] },
  { name: "Finance", tabs: ["Payments", "Invoices", "Gig Fees"] },
  { name: "Trust & Compliance", tabs: ["Disputes", "Reviews"] },
  { name: "Engagement", tabs: ["Social Spotlights"] },
  { name: "Documents", tabs: ["Document Checklists", "Templates"] },
  { name: "Platform Management", tabs: ["Configuration", "System Settings", "Audit Log"] },
] as const;
type AdminGroup = (typeof ADMIN_GROUPS)[number]["name"];
type AdminTab = (typeof ADMIN_GROUPS)[number]["tabs"][number];
const btn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground";

function PlaceholderTab({ name }: { name: string }) {
  return (
    <Panel title={name}>
      <p className="p-4 text-sm text-muted-foreground">Nothing configurable here yet.</p>
    </Panel>
  );
}

function AdminPage() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const [group, setGroup] = useState<AdminGroup>(ADMIN_GROUPS[0].name);
  const activeGroup = ADMIN_GROUPS.find((g) => g.name === group)!;
  const [tab, setTab] = useState<AdminTab>(activeGroup.tabs[0]);

  if (role.isLoading) return <Page open title="Admin"><p className="text-muted-foreground">Loading…</p></Page>;
  if (role.data !== "admin") {
    return (
      <Page open title="Admin">
        <div className="rounded-sm border border-border bg-card p-8 text-center">
          <h2 className="font-script text-4xl text-primary">Not authorized</h2>
          <p className="mt-3 text-muted-foreground">This area is for platform administrators only.</p>
        </div>
      </Page>
    );
  }

  function selectGroup(g: (typeof ADMIN_GROUPS)[number]) {
    setGroup(g.name);
    setTab(g.tabs[0]);
  }

  return (
    <Page open title="Admin" subtitle="Platform operations and oversight">
      <nav className="mb-1 flex gap-1 overflow-x-auto border-b border-border">
        {ADMIN_GROUPS.map((g) => (
          <button key={g.name} onClick={() => selectGroup(g)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${group === g.name ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{g.name}</button>
        ))}
      </nav>
      <nav className="mb-5 flex gap-1 overflow-x-auto">
        {activeGroup.tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </nav>
      {tab === "Users" && <UsersTab />}
      {tab === "Crew" && <CrewTab />}
      {tab === "Import" && <ImportTab />}
      {tab === "Companies" && <CompaniesTab />}
      {tab === "Bookings" && <BookingsTab />}
      {tab === "Payments" && <PaymentsTab />}
      {tab === "Invoices" && <InvoicesTab />}
      {tab === "Equipment" && <EquipmentAdmin />}
      {tab === "Disputes" && <DisputesTab />}
      {tab === "Reviews" && <ReviewsTab />}
      {tab === "Memberships" && <MembershipsTab />}
      {tab === "Gig Fees" && <GigFeesTab />}
      {tab === "Social Spotlights" && <SpotlightTab />}
      {tab === "Document Checklists" && <DocumentChecklistsAdmin />}
      {tab === "Templates" && <ChecklistTemplateManager audience="producer" />}
      {tab === "Audit Log" && <AuditLogTab />}
      {tab === "Configuration" && <PlaceholderTab name="Configuration" />}
      {tab === "System Settings" && <PlaceholderTab name="System Settings" />}
    </Page>
  );
}

const GIG_FEES = [
  { key: "gig_secure_fee", label: "Fee to secure a gig (R)", def: 50 },
  { key: "gig_penalty_fee", label: "Penalty for no-show or late withdrawal (R)", def: 500 },
  { key: "gig_notice_hours", label: "Notice needed to withdraw without penalty (hours)", def: 24 },
] as const;

function GigFeesTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["gig-fees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("key,value").in("key", GIG_FEES.map((f) => f.key));
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
    },
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const val = (k: string, d: number) => form[k] ?? String(data?.[k] ?? d);

  async function save() {
    const rows = GIG_FEES.map((f) => ({ key: f.key, value: Number(val(f.key, f.def)) }));
    if (rows.some((r) => !Number.isFinite(r.value) || r.value < 0)) { toast.error("Enter amounts of 0 or more"); return; }
    setSaving(true);
    const { error } = await supabase.from("platform_settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Gig fees saved"); setForm({}); qc.invalidateQueries({ queryKey: ["gig-fees"] });
  }

  return (
    <Panel title="Grab a Gig fees and penalties">
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">New gigs use the securing fee in place when they are posted. Penalties apply to withdrawals and no-shows from now on.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {GIG_FEES.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <input type="number" min={0} className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2"
                value={val(f.key, f.def)} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <button onClick={save} disabled={saving} className={btn}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </Panel>
  );
}

function useInv() {
  const qc = useQueryClient();
  return (...keys: string[][]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
}

function UsersTab() {
  const inv = useInv();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, suspended, created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (p.error) throw p.error; if (r.error) throw r.error;
      const roles = new Map<string, string[]>();
      for (const row of r.data ?? []) roles.set(row.user_id, [...(roles.get(row.user_id) ?? []), row.role]);
      return (p.data ?? []).map((u) => ({ ...u, roles: roles.get(u.id) ?? [] }));
    },
  });
  const ROLES = ["producer", "crew", "client", "admin"] as const;
  const [addingRole, setAddingRole] = useState<Record<string, string>>({});

  async function toggleSuspend(id: string, suspended: boolean) {
    const { error } = await supabase.from("profiles").update({ suspended: !suspended }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(!suspended ? "User suspended" : "User reactivated");
    inv(["admin-users"]);
  }
  async function addRole(userId: string) {
    const role = addingRole[userId] as (typeof ROLES)[number] | undefined;
    if (!role) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Role added");
    setAddingRole((prev) => ({ ...prev, [userId]: "" }));
    inv(["admin-users"]);
  }
  async function removeRole(userId: string, role: string) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as (typeof ROLES)[number]);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Role removed");
    inv(["admin-users"]);
  }
  return (
    <Panel title={`Users (${users.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th className="px-4">Email</th><th className="px-4">Roles</th><th className="px-4">Status</th><th className="px-4">Action</th></tr></thead>
        <tbody>
          {(users.data ?? []).map((u) => (
            <tr key={u.id} className="border-t border-border">
              <td className="px-4 py-2 font-medium">{u.full_name || "—"}</td>
              <td className="px-4 text-muted-foreground">{u.email}</td>
              <td className="px-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  {u.roles.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1 rounded-sm bg-muted px-1.5 py-0.5 text-xs">
                      {r}
                      <button onClick={() => removeRole(u.id, r)} aria-label={`Remove ${r} role`} className="text-muted-foreground hover:text-destructive">×</button>
                    </span>
                  ))}
                  <select className={`${invField} py-0.5 text-xs`} value={addingRole[u.id] ?? ""} onChange={(e) => setAddingRole((prev) => ({ ...prev, [u.id]: e.target.value }))}>
                    <option value="">+ role</option>
                    {ROLES.filter((r) => !u.roles.includes(r)).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {addingRole[u.id] && <button onClick={() => addRole(u.id)} className="text-xs text-primary hover:underline">Add</button>}
                </div>
              </td>
              <td className="px-4">{u.suspended ? <Badge>Declined</Badge> : <Badge>Confirmed</Badge>}</td>
              <td className="px-4"><button onClick={() => toggleSuspend(u.id, u.suspended)} className="text-xs text-primary hover:underline">{u.suspended ? "Reactivate" : "Suspend"}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

function CrewTab() {
  const inv = useInv();
  const crew = useQuery({
    queryKey: ["admin-crew"],
    queryFn: async () => { const { data, error } = await supabase.from("crew_members").select("id, name, role, department, day_rate, rating, available").order("name"); if (error) throw error; return data ?? []; },
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", role: "", department: "", day_rate: "" });
  const [adding, setAdding] = useState(false);
  const [newCrew, setNewCrew] = useState({ name: "", role: "", department: "", day_rate: "" });

  function startEdit(c: { id: string; name: string; role: string; department: string; day_rate: number }) {
    setEditing(c.id);
    setDraft({ name: c.name, role: c.role, department: c.department, day_rate: String(c.day_rate) });
  }

  async function saveEdit(id: string) {
    const { error } = await supabase.from("crew_members").update({ name: draft.name.trim(), role: draft.role.trim(), department: draft.department.trim(), day_rate: Number(draft.day_rate) || 0 }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Crew member updated");
    setEditing(null);
    inv(["admin-crew"], ["crew"], ["crew-search"]);
  }

  async function addCrew() {
    if (!newCrew.name.trim() || !newCrew.role.trim() || !newCrew.department.trim()) { toast.error("Name, role and department are required"); return; }
    const { error } = await supabase.from("crew_members").insert({ name: newCrew.name.trim(), role: newCrew.role.trim(), department: newCrew.department.trim(), day_rate: Number(newCrew.day_rate) || 0 });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Crew member added");
    setNewCrew({ name: "", role: "", department: "", day_rate: "" });
    setAdding(false);
    inv(["admin-crew"], ["crew"], ["crew-search"], ["departments"]);
  }

  async function removeCrew(id: string) {
    const { error } = await supabase.from("crew_members").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Crew member removed");
    inv(["admin-crew"], ["crew"], ["crew-search"]);
  }

  return (
    <Panel title={`Crew (${crew.data?.length ?? 0})`} right={!adding && (
      <button onClick={() => setAdding(true)} className="text-xs font-semibold text-primary hover:underline">+ Add crew member</button>
    )}>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 border-b border-border p-4">
          <input placeholder="Name" className={`${invField} min-w-40`} value={newCrew.name} onChange={(e) => setNewCrew({ ...newCrew, name: e.target.value })} />
          <input placeholder="Role" className={`${invField} min-w-32`} value={newCrew.role} onChange={(e) => setNewCrew({ ...newCrew, role: e.target.value })} />
          <input placeholder="Department" className={`${invField} min-w-32`} value={newCrew.department} onChange={(e) => setNewCrew({ ...newCrew, department: e.target.value })} />
          <input type="number" placeholder="Day rate" className={`${invField} w-28`} value={newCrew.day_rate} onChange={(e) => setNewCrew({ ...newCrew, day_rate: e.target.value })} />
          <button onClick={addCrew} className={btn}>Add</button>
          <button onClick={() => setAdding(false)} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th className="px-4">Role</th><th className="px-4">Department</th><th className="px-4">Rate</th><th className="px-4">Rating</th><th className="px-4">Action</th></tr></thead>
        <tbody>{(crew.data ?? []).map((c) => editing === c.id ? (
          <tr key={c.id} className="border-t border-border">
            <td className="px-4 py-2"><input className={`${invField} w-full`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
            <td className="px-4"><input className={`${invField} w-full`} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></td>
            <td className="px-4"><input className={`${invField} w-full`} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} /></td>
            <td className="px-4"><input type="number" className={`${invField} w-24`} value={draft.day_rate} onChange={(e) => setDraft({ ...draft, day_rate: e.target.value })} /></td>
            <td className="px-4">★ {c.rating}</td>
            <td className="px-4 flex gap-2"><button onClick={() => saveEdit(c.id)} className="text-xs text-primary hover:underline">Save</button><button onClick={() => setEditing(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button></td>
          </tr>
        ) : (
          <tr key={c.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{c.name}</td><td className="px-4">{c.role}</td><td className="px-4">{c.department}</td><td className="px-4">{zar(c.day_rate)}</td><td className="px-4">★ {c.rating}</td>
            <td className="px-4 flex gap-2"><button onClick={() => startEdit(c)} className="text-xs text-primary hover:underline">Edit</button><button onClick={() => removeCrew(c.id)} className="text-xs text-destructive hover:underline">Delete</button></td>
          </tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}

function CompaniesTab() {
  const inv = useInv();
  const companies = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => { const { data, error } = await supabase.from("companies").select("id, name, billing_email, phone, created_at, company_users(count)"); if (error) throw error; return data ?? []; },
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", billing_email: "", phone: "" });
  const [adding, setAdding] = useState(false);
  const [newCo, setNewCo] = useState({ name: "", billing_email: "", phone: "" });

  function startEdit(c: { id: string; name: string; billing_email: string | null; phone: string | null }) {
    setEditing(c.id);
    setDraft({ name: c.name, billing_email: c.billing_email ?? "", phone: c.phone ?? "" });
  }

  async function saveEdit(id: string) {
    const { error } = await supabase.from("companies").update({ name: draft.name.trim(), billing_email: draft.billing_email.trim(), phone: draft.phone.trim() }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Company updated");
    setEditing(null);
    inv(["admin-companies"]);
  }

  async function addCompany() {
    if (!newCo.name.trim()) { toast.error("Company name is required"); return; }
    const { error } = await supabase.from("companies").insert({ name: newCo.name.trim(), billing_email: newCo.billing_email.trim(), phone: newCo.phone.trim() });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Company added");
    setNewCo({ name: "", billing_email: "", phone: "" });
    setAdding(false);
    inv(["admin-companies"]);
  }

  async function removeCompany(id: string) {
    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Company removed");
    inv(["admin-companies"]);
  }

  return (
    <Panel title={`Companies (${companies.data?.length ?? 0})`} right={!adding && (
      <button onClick={() => setAdding(true)} className="text-xs font-semibold text-primary hover:underline">+ Add company</button>
    )}>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 border-b border-border p-4">
          <input placeholder="Company name" className={`${invField} min-w-48`} value={newCo.name} onChange={(e) => setNewCo({ ...newCo, name: e.target.value })} />
          <input placeholder="Billing email" className={`${invField} min-w-48`} value={newCo.billing_email} onChange={(e) => setNewCo({ ...newCo, billing_email: e.target.value })} />
          <input placeholder="Phone" className={`${invField} min-w-36`} value={newCo.phone} onChange={(e) => setNewCo({ ...newCo, phone: e.target.value })} />
          <button onClick={addCompany} className={btn}>Add</button>
          <button onClick={() => setAdding(false)} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th className="px-4">Billing email</th><th className="px-4">Phone</th><th className="px-4">Users</th><th className="px-4">Action</th></tr></thead>
        <tbody>{(companies.data ?? []).map((c) => editing === c.id ? (
          <tr key={c.id} className="border-t border-border">
            <td className="px-4 py-2"><input className={`${invField} w-full`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
            <td className="px-4"><input className={`${invField} w-full`} value={draft.billing_email} onChange={(e) => setDraft({ ...draft, billing_email: e.target.value })} /></td>
            <td className="px-4"><input className={`${invField} w-full`} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></td>
            <td className="px-4">{(c.company_users as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
            <td className="px-4 flex gap-2"><button onClick={() => saveEdit(c.id)} className="text-xs text-primary hover:underline">Save</button><button onClick={() => setEditing(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button></td>
          </tr>
        ) : (
          <tr key={c.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{c.name}</td><td className="px-4 text-muted-foreground">{c.billing_email || "—"}</td><td className="px-4">{c.phone || "—"}</td><td className="px-4">{(c.company_users as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
            <td className="px-4 flex gap-2"><button onClick={() => startEdit(c)} className="text-xs text-primary hover:underline">Edit</button><button onClick={() => removeCompany(c.id)} className="text-xs text-destructive hover:underline">Delete</button></td>
          </tr>
        ))}</tbody>
      </table>
      {companies.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No companies yet.</p>}
    </Panel>
  );
}

const BOOKING_STATUSES = ["draft", "open", "pencil", "awaiting_crew_confirmation", "confirmed", "in_progress", "awaiting_review", "completed", "payment_released", "cancelled", "disputed"] as const;

function BookingsTab() {
  const inv = useInv();
  const bookings = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => { const { data, error } = await supabase.from("bookings").select("id, role, status, payment_status, booking_date, crew_members(name), productions(name)").order("booking_date", { ascending: false }); if (error) throw error; return data ?? []; },
  });

  async function setStatus(id: string, status: (typeof BOOKING_STATUSES)[number]) {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Booking status updated");
    inv(["admin-bookings"], ["admin-payments"]);
  }

  async function removeBooking(id: string) {
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Booking deleted");
    inv(["admin-bookings"], ["admin-payments"]);
  }

  return (
    <Panel title={`Bookings (${bookings.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Production</th><th className="px-4">Crew</th><th className="px-4">Role</th><th className="px-4">Date</th><th className="px-4">Status</th><th className="px-4">Payment</th><th className="px-4">Action</th></tr></thead>
        <tbody>{(bookings.data ?? []).map((b) => (
          <tr key={b.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{(b.productions as { name: string } | null)?.name}</td>
            <td className="px-4">{(b.crew_members as { name: string } | null)?.name}</td>
            <td className="px-4">{b.role}</td><td className="px-4">{b.booking_date}</td>
            <td className="px-4">
              <select className={`${invField} py-1`} value={b.status} onChange={(e) => setStatus(b.id, e.target.value as (typeof BOOKING_STATUSES)[number])}>
                {BOOKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </td>
            <td className="px-4 text-xs text-muted-foreground">{b.payment_status}</td>
            <td className="px-4"><button onClick={() => removeBooking(b.id)} className="text-xs text-destructive hover:underline">Delete</button></td>
          </tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}

const PAYMENT_STATUSES = ["not_required", "payment_required", "payment_received", "funds_held", "awaiting_release", "release_authorised", "payment_released", "payment_failed", "payment_disputed"] as const;

function PaymentsTab() {
  const inv = useInv();
  const rows = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => { const { data, error } = await supabase.from("bookings").select("id, crew_rate, days, payment_status, crew_members(name), productions(name)").neq("payment_status", "not_required"); if (error) throw error; return data ?? []; },
  });

  async function setStatus(id: string, payment_status: (typeof PAYMENT_STATUSES)[number]) {
    const { error } = await supabase.from("bookings").update({ payment_status }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Payment status updated");
    inv(["admin-payments"], ["admin-bookings"]);
  }

  return (
    <Panel title={`Payments (${rows.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Production</th><th className="px-4">Crew</th><th className="px-4">Amount</th><th className="px-4">Status</th></tr></thead>
        <tbody>{(rows.data ?? []).map((b) => (
          <tr key={b.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{(b.productions as { name: string } | null)?.name}</td>
            <td className="px-4">{(b.crew_members as { name: string } | null)?.name}</td>
            <td className="px-4">{zar(b.crew_rate * b.days)}</td>
            <td className="px-4">
              <select className={`${invField} py-1`} value={b.payment_status} onChange={(e) => setStatus(b.id, e.target.value as (typeof PAYMENT_STATUSES)[number])}>
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}

const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"];

function InvoicesTab() {
  const inv = useInv();
  const invoices = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: async () => { const { data, error } = await supabase.from("invoices").select("*, crew_members(name), productions(name)").order("created_at", { ascending: false }); if (error) throw error; return data ?? []; },
  });

  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Invoice status updated");
    inv(["admin-invoices"]);
  }

  async function removeInvoice(id: string) {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Invoice deleted");
    inv(["admin-invoices"]);
  }

  return (
    <Panel title={`Invoices (${invoices.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Invoice #</th><th className="px-4">Crew</th><th className="px-4">Production</th><th className="px-4">Subtotal</th><th className="px-4">VAT</th><th className="px-4">Total</th><th className="px-4">Status</th><th className="px-4">Action</th></tr></thead>
        <tbody>{(invoices.data ?? []).map((i) => (
          <tr key={i.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{i.invoice_number}</td>
            <td className="px-4">{(i.crew_members as { name: string } | null)?.name}</td>
            <td className="px-4">{(i.productions as { name: string } | null)?.name}</td>
            <td className="px-4">{zar(i.subtotal)}</td><td className="px-4">{zar(i.vat_amount)}</td><td className="px-4 font-semibold">{zar(i.total)}</td>
            <td className="px-4">
              <select className={`${invField} py-1`} value={i.status} onChange={(e) => setStatus(i.id, e.target.value)}>
                {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </td>
            <td className="px-4"><button onClick={() => removeInvoice(i.id)} className="text-xs text-destructive hover:underline">Delete</button></td>
          </tr>
        ))}</tbody>
      </table>
      {invoices.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No invoices generated yet.</p>}
    </Panel>
  );
}

function DisputesTab() {
  const inv = useInv();
  const disputes = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: async () => { const { data, error } = await supabase.from("disputes").select("*, bookings(role, production_id, productions(name))").order("created_at", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  async function resolve(id: string, status: "resolved" | "rejected") {
    const resolution = await promptDialog(`Resolution notes for this ${status === "resolved" ? "resolution" : "rejection"}?`);
    if (resolution == null) return;
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase.from("disputes").update({ status, resolution, resolved_by: uid, resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Dispute updated"); inv(["admin-disputes"]);
  }
  async function remove(id: string) {
    const { error } = await supabase.from("disputes").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Dispute deleted"); inv(["admin-disputes"]);
  }
  return (
    <Panel title={`Disputes (${disputes.data?.length ?? 0})`}>
      <ul className="divide-y divide-border">
        {disputes.data?.length === 0 && <li className="p-4 text-sm text-muted-foreground">No disputes.</li>}
        {(disputes.data ?? []).map((d) => (
          <li key={d.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div><span className="font-semibold">{(d.bookings as { productions?: { name: string } } | null)?.productions?.name ?? "Booking"}</span> <span className="text-xs text-muted-foreground">· {zar(d.amount_disputed)} disputed</span></div>
              <Badge>{d.status}</Badge>
            </div>
            <p className="mt-1 text-sm">{d.description}</p>
            {d.resolution && <p className="mt-1 text-xs text-muted-foreground">Resolution: {d.resolution}</p>}
            <div className="mt-2 flex gap-2">
              {d.status === "open" && (
                <>
                  <button onClick={() => resolve(d.id, "resolved")} className={btn}>Resolve</button>
                  <button onClick={() => resolve(d.id, "rejected")} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">Reject</button>
                </>
              )}
              <button onClick={() => remove(d.id)} className="text-xs text-destructive hover:underline">Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ReviewsTab() {
  const inv = useInv();
  const reviews = useQuery({
    queryKey: ["admin-reviews"],
    queryFn: async () => { const { data, error } = await supabase.from("crew_reviews").select("*, crew_members(name)").order("created_at", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  async function remove(id: string) {
    const { error } = await supabase.from("crew_reviews").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Review removed"); inv(["admin-reviews"], ["reviews"]);
  }
  return (
    <Panel title={`Reviews (${reviews.data?.length ?? 0})`}>
      <ul className="divide-y divide-border">
        {(reviews.data ?? []).map((r) => (
          <li key={r.id} className="flex items-start justify-between px-4 py-3">
            <div>
              <div className="text-sm"><strong>{(r.crew_members as { name: string } | null)?.name}</strong> rated {r.rating}★ by {r.reviewer_name}</div>
              {r.comment && <p className="text-xs text-muted-foreground">{r.comment}</p>}
            </div>
            <button onClick={() => remove(r.id)} className="text-xs text-destructive hover:underline">Remove</button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MembershipsTab() {
  const inv = useInv();
  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => { const { data, error } = await supabase.from("membership_plans").select("*"); if (error) throw error; return data ?? []; },
  });
  const memberships = useQuery({
    queryKey: ["admin-memberships"],
    queryFn: async () => {
      const [m, p] = await Promise.all([
        supabase.from("memberships").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      if (m.error) throw m.error; if (p.error) throw p.error;
      const byId = new Map((p.data ?? []).map((u) => [u.id, u]));
      return (m.data ?? []).map((row) => ({ ...row, profile: byId.get(row.user_id) }));
    },
  });
  async function updatePrice(id: string, cents: number) {
    const { error } = await supabase.from("membership_plans").update({ price_cents: cents }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Price updated"); inv(["admin-plans"]);
  }
  const MEMBERSHIP_STATUSES = ["active", "cancelled", "expired", "pending"];
  async function setMembershipStatus(id: string, status: string) {
    const { error } = await supabase.from("memberships").update({ status }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Membership status updated"); inv(["admin-memberships"]);
  }
  async function removeMembership(id: string) {
    const { error } = await supabase.from("memberships").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Membership removed"); inv(["admin-memberships"]);
  }
  return (
    <div className="space-y-5">
      <Panel title="Pricing">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Type</th><th className="px-4">Price (cents)</th><th className="px-4">Currency</th><th className="px-4">Action</th></tr></thead>
          <tbody>{(plans.data ?? []).map((p) => (
            <PlanRow key={p.id} plan={p} onSave={updatePrice} />
          ))}</tbody>
        </table>
      </Panel>
      <Panel title={`Memberships (${memberships.data?.length ?? 0})`}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">User</th><th className="px-4">Type</th><th className="px-4">Status</th><th className="px-4">Action</th></tr></thead>
          <tbody>{(memberships.data ?? []).map((m) => (
            <tr key={m.id} className="border-t border-border">
              <td className="px-4 py-2">{m.profile?.full_name || m.profile?.email || "—"}</td>
              <td className="px-4">{m.membership_type}</td>
              <td className="px-4">
                <select className={`${invField} py-1`} value={m.status} onChange={(e) => setMembershipStatus(m.id, e.target.value)}>
                  {MEMBERSHIP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td className="px-4"><button onClick={() => removeMembership(m.id)} className="text-xs text-destructive hover:underline">Delete</button></td>
            </tr>
          ))}</tbody>
        </table>
      </Panel>
    </div>
  );
}

function PlanRow({ plan, onSave }: { plan: { id: string; membership_type: string; price_cents: number; currency: string }; onSave: (id: string, cents: number) => void }) {
  const [v, setV] = useState(String(plan.price_cents));
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-2 font-medium capitalize">{plan.membership_type}</td>
      <td className="px-4"><input type="number" className="w-28 rounded-sm border border-input bg-background px-2 py-1 text-xs" value={v} onChange={(e) => setV(e.target.value)} /></td>
      <td className="px-4">{plan.currency}</td>
      <td className="px-4"><button onClick={() => onSave(plan.id, Number(v) || 0)} className="text-xs text-primary hover:underline">Save</button></td>
    </tr>
  );
}

function AuditLogTab() {
  const logs = useQuery({
    queryKey: ["admin-audit"],
    queryFn: async () => { const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(200); if (error) throw error; return data ?? []; },
  });
  return (
    <Panel title={`Audit log (last ${logs.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4">Action</th><th className="px-4">Table</th><th className="px-4">Record</th><th className="px-4">Change</th></tr></thead>
        <tbody>{(logs.data ?? []).map((l) => (
          <tr key={l.id} className="border-t border-border">
            <td className="px-4 py-2 text-xs">{new Date(l.created_at).toLocaleString("en-ZA")}</td>
            <td className="px-4">{l.action}</td><td className="px-4 text-muted-foreground">{l.record_table}</td><td className="px-4 text-xs">{l.record_id}</td>
            <td className="px-4 text-xs text-muted-foreground">{l.old_value ? `${JSON.stringify(l.old_value)} → ` : ""}{JSON.stringify(l.new_value)}</td>
          </tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}

const invField = "rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring";

function SpotlightTab() {
  const [country, setCountry] = useState("All");
  const list = useQuery({
    queryKey: ["admin-spotlight"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email, country, created_at, spotlight_featured_at").eq("social_opt_in", true).order("created_at", { ascending: false });
      if (error) throw error; return data ?? [];
    },
  });
  async function feature(id: string, on: boolean) {
    const { error } = await supabase.from("profiles").update({ spotlight_featured_at: on ? new Date().toISOString() : null }).eq("id", id);
    if (error) return void toast.error(error.message);
    list.refetch();
  }
  const rows = (list.data ?? []).filter((r) => country === "All" || (r.country ?? "Unknown") === country);
  const countries = ["All", ...Array.from(new Set((list.data ?? []).map((r) => r.country ?? "Unknown")))];
  return (
    <div className="rounded-sm border border-border bg-card">
      <div className="flex items-center justify-between p-4">
        <p className="text-sm text-muted-foreground">New members who agreed to be featured on social media. Newest first.</p>
        <select className="rounded-sm border border-input bg-background px-2 py-1 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
          {countries.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <ul className="divide-y divide-border">
        {rows.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nobody yet.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <div><div className="font-medium">{r.full_name || r.email}</div><div className="text-xs text-muted-foreground">{r.country ?? "Unknown"} · joined {new Date(r.created_at).toLocaleDateString("en-ZA")}</div></div>
            <button onClick={() => feature(r.id, !r.spotlight_featured_at)} className="text-xs text-primary hover:underline">{r.spotlight_featured_at ? `Featured ${new Date(r.spotlight_featured_at).toLocaleDateString("en-ZA")} · undo` : "Mark as featured"}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
