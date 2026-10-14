import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Page, Badge, Panel } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { zar } from "@/lib/demo-data";

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
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
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

const TABS = ["Users", "Crew", "Import", "Companies", "Bookings", "Payments", "Invoices", "Inventory", "Disputes", "Reviews", "Memberships", "Gig Fees", "Audit Log"] as const;
const btn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground";

function AdminPage() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Users");

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

  return (
    <Page open title="Admin" subtitle="Platform operations and oversight">
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </nav>
      {tab === "Users" && <UsersTab />}
      {tab === "Crew" && <CrewTab />}
      {tab === "Import" && <ImportTab />}
      {tab === "Companies" && <CompaniesTab />}
      {tab === "Bookings" && <BookingsTab />}
      {tab === "Payments" && <PaymentsTab />}
      {tab === "Invoices" && <InvoicesTab />}
      {tab === "Inventory" && <InventoryTab />}
      {tab === "Disputes" && <DisputesTab />}
      {tab === "Reviews" && <ReviewsTab />}
      {tab === "Memberships" && <MembershipsTab />}
      {tab === "Gig Fees" && <GigFeesTab />}
      {tab === "Audit Log" && <AuditLogTab />}
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
  async function toggleSuspend(id: string, suspended: boolean) {
    const { error } = await supabase.from("profiles").update({ suspended: !suspended }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(!suspended ? "User suspended" : "User reactivated");
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
              <td className="px-4">{u.roles.join(", ") || "—"}</td>
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
  const crew = useQuery({
    queryKey: ["admin-crew"],
    queryFn: async () => { const { data, error } = await supabase.from("crew_members").select("id, name, role, department, day_rate, rating, available").order("name"); if (error) throw error; return data ?? []; },
  });
  return (
    <Panel title={`Crew (${crew.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th className="px-4">Role</th><th className="px-4">Department</th><th className="px-4">Rate</th><th className="px-4">Rating</th></tr></thead>
        <tbody>{(crew.data ?? []).map((c) => (
          <tr key={c.id} className="border-t border-border"><td className="px-4 py-2 font-medium">{c.name}</td><td className="px-4">{c.role}</td><td className="px-4">{c.department}</td><td className="px-4">{zar(c.day_rate)}</td><td className="px-4">★ {c.rating}</td></tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}

function CompaniesTab() {
  const companies = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => { const { data, error } = await supabase.from("companies").select("id, name, billing_email, phone, created_at, company_users(count)"); if (error) throw error; return data ?? []; },
  });
  return (
    <Panel title={`Companies (${companies.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th className="px-4">Billing email</th><th className="px-4">Phone</th><th className="px-4">Users</th></tr></thead>
        <tbody>{(companies.data ?? []).map((c) => (
          <tr key={c.id} className="border-t border-border"><td className="px-4 py-2 font-medium">{c.name}</td><td className="px-4 text-muted-foreground">{c.billing_email || "—"}</td><td className="px-4">{c.phone || "—"}</td><td className="px-4">{(c.company_users as unknown as { count: number }[])?.[0]?.count ?? 0}</td></tr>
        ))}</tbody>
      </table>
      {companies.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No companies yet.</p>}
    </Panel>
  );
}

function BookingsTab() {
  const bookings = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => { const { data, error } = await supabase.from("bookings").select("id, role, status, payment_status, booking_date, crew_members(name), productions(name)").order("booking_date", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  return (
    <Panel title={`Bookings (${bookings.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Production</th><th className="px-4">Crew</th><th className="px-4">Role</th><th className="px-4">Date</th><th className="px-4">Status</th><th className="px-4">Payment</th></tr></thead>
        <tbody>{(bookings.data ?? []).map((b) => (
          <tr key={b.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{(b.productions as { name: string } | null)?.name}</td>
            <td className="px-4">{(b.crew_members as { name: string } | null)?.name}</td>
            <td className="px-4">{b.role}</td><td className="px-4">{b.booking_date}</td>
            <td className="px-4"><Badge>{b.status}</Badge></td><td className="px-4 text-xs text-muted-foreground">{b.payment_status}</td>
          </tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}

function PaymentsTab() {
  const rows = useQuery({
    queryKey: ["admin-payments"],
    queryFn: async () => { const { data, error } = await supabase.from("bookings").select("id, crew_rate, days, payment_status, crew_members(name), productions(name)").neq("payment_status", "not_required"); if (error) throw error; return data ?? []; },
  });
  return (
    <Panel title={`Payments (${rows.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Production</th><th className="px-4">Crew</th><th className="px-4">Amount</th><th className="px-4">Status</th></tr></thead>
        <tbody>{(rows.data ?? []).map((b) => (
          <tr key={b.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{(b.productions as { name: string } | null)?.name}</td>
            <td className="px-4">{(b.crew_members as { name: string } | null)?.name}</td>
            <td className="px-4">{zar(b.crew_rate * b.days)}</td>
            <td className="px-4"><Badge>{b.payment_status}</Badge></td>
          </tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}

function InvoicesTab() {
  const invoices = useQuery({
    queryKey: ["admin-invoices"],
    queryFn: async () => { const { data, error } = await supabase.from("invoices").select("*, crew_members(name), productions(name)").order("created_at", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  return (
    <Panel title={`Invoices (${invoices.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Invoice #</th><th className="px-4">Crew</th><th className="px-4">Production</th><th className="px-4">Subtotal</th><th className="px-4">VAT</th><th className="px-4">Total</th><th className="px-4">Status</th></tr></thead>
        <tbody>{(invoices.data ?? []).map((i) => (
          <tr key={i.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{i.invoice_number}</td>
            <td className="px-4">{(i.crew_members as { name: string } | null)?.name}</td>
            <td className="px-4">{(i.productions as { name: string } | null)?.name}</td>
            <td className="px-4">{zar(i.subtotal)}</td><td className="px-4">{zar(i.vat_amount)}</td><td className="px-4 font-semibold">{zar(i.total)}</td>
            <td className="px-4"><Badge>{i.status}</Badge></td>
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
    const resolution = window.prompt(`Resolution notes for this ${status === "resolved" ? "resolution" : "rejection"}?`);
    if (resolution == null) return;
    const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase.from("disputes").update({ status, resolution, resolved_by: uid, resolved_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Dispute updated"); inv(["admin-disputes"]);
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
            {d.status === "open" && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => resolve(d.id, "resolved")} className={btn}>Resolve</button>
                <button onClick={() => resolve(d.id, "rejected")} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">Reject</button>
              </div>
            )}
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
          <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">User</th><th className="px-4">Type</th><th className="px-4">Status</th></tr></thead>
          <tbody>{(memberships.data ?? []).map((m) => (
            <tr key={m.id} className="border-t border-border"><td className="px-4 py-2">{m.profile?.full_name || m.profile?.email || "—"}</td><td className="px-4">{m.membership_type}</td><td className="px-4"><Badge>{m.status}</Badge></td></tr>
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
const INV_CATEGORIES = ["Equipment", "Lighting", "Sound", "Camera", "Grip", "Wardrobe", "Props", "Vehicle"];

function InventoryTab() {
  const inv = useInv();
  const items = useQuery({
    queryKey: ["admin-inventory-items"],
    queryFn: async () => { const { data, error } = await supabase.from("inventory_items").select("*").order("name"); if (error) throw error; return data ?? []; },
  });
  const checkouts = useQuery({
    queryKey: ["admin-inventory-checkouts"],
    queryFn: async () => { const { data, error } = await supabase.from("inventory_checkouts").select("*, productions(name)").order("checked_out_at", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  const [newItem, setNewItem] = useState({ name: "", category: "Equipment", total_count: "1", notes: "" });
  const [checkoutFor, setCheckoutFor] = useState<{ id: string; name: string } | null>(null);

  async function addItem() {
    if (!newItem.name.trim()) return;
    const { error } = await supabase.from("inventory_items").insert({ name: newItem.name.trim(), category: newItem.category, total_count: Number(newItem.total_count) || 1, notes: newItem.notes });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Item added");
    setNewItem({ name: "", category: "Equipment", total_count: "1", notes: "" });
    inv(["admin-inventory-items"]);
  }
  async function removeItem(id: string) {
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["admin-inventory-items"], ["admin-inventory-checkouts"]);
  }
  async function markReturned(id: string) {
    const { error } = await supabase.from("inventory_checkouts").update({ returned_at: new Date().toISOString().slice(0, 10) }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Marked returned");
    inv(["admin-inventory-checkouts"]);
  }

  const outByItem = new Map<string, number>();
  for (const c of checkouts.data ?? []) {
    if (!c.returned_at) outByItem.set(c.item_id, (outByItem.get(c.item_id) ?? 0) + c.quantity);
  }

  return (
    <div className="space-y-5">
      <Panel title="Add inventory item">
        <div className="flex flex-wrap items-end gap-2 p-4">
          <input placeholder="Item name" className={`${invField} min-w-48 flex-1`} value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
          <select className={invField} value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}>
            {INV_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="number" min="1" className={`${invField} w-24`} placeholder="Count" value={newItem.total_count} onChange={(e) => setNewItem({ ...newItem, total_count: e.target.value })} />
          <input placeholder="Notes" className={`${invField} min-w-40`} value={newItem.notes} onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })} />
          <button onClick={addItem} className={btn}>Add item</button>
        </div>
      </Panel>

      <Panel title={`Inventory (${items.data?.length ?? 0} item types)`}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr>
            <th className="px-4 py-2">Item</th><th className="px-4">Category</th><th className="px-4">Total</th><th className="px-4">Checked out</th><th className="px-4">Available</th><th className="px-4">Action</th>
          </tr></thead>
          <tbody>
            {(items.data ?? []).map((it) => {
              const out = outByItem.get(it.id) ?? 0;
              return (
                <tr key={it.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{it.name}{it.notes && <div className="text-xs text-muted-foreground">{it.notes}</div>}</td>
                  <td className="px-4">{it.category}</td>
                  <td className="px-4">{it.total_count}</td>
                  <td className="px-4">{out}</td>
                  <td className="px-4">{it.total_count - out}</td>
                  <td className="px-4 flex gap-2">
                    <button onClick={() => setCheckoutFor({ id: it.id, name: it.name })} className="text-xs text-primary hover:underline">Check out</button>
                    <button onClick={() => removeItem(it.id)} className="text-xs text-destructive hover:underline">Delete</button>
                  </td>
                </tr>
              );
            })}
            {items.data?.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No inventory items yet.</td></tr>}
          </tbody>
        </table>
      </Panel>

      <Panel title="Library card — check-out history">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr>
            <th className="px-4 py-2">Item</th><th className="px-4">Qty</th><th className="px-4">Where</th><th className="px-4">Left on</th><th className="px-4">Due back</th><th className="px-4">Returned</th><th className="px-4">Action</th>
          </tr></thead>
          <tbody>
            {(checkouts.data ?? []).map((c) => {
              const itemName = items.data?.find((i) => i.id === c.item_id)?.name ?? "—";
              return (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{itemName}</td>
                  <td className="px-4">{c.quantity}</td>
                  <td className="px-4">{(c.productions as { name: string } | null)?.name || c.checked_out_to || "—"}</td>
                  <td className="px-4">{c.checked_out_at}</td>
                  <td className="px-4">{c.expected_return_at || "—"}</td>
                  <td className="px-4">{c.returned_at ? <Badge>Confirmed</Badge> : <Badge>Pending</Badge>}</td>
                  <td className="px-4">{!c.returned_at && <button onClick={() => markReturned(c.id)} className="text-xs text-primary hover:underline">Mark returned</button>}</td>
                </tr>
              );
            })}
            {checkouts.data?.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No check-outs yet.</td></tr>}
          </tbody>
        </table>
      </Panel>

      {checkoutFor && <CheckoutDialog item={checkoutFor} onClose={() => setCheckoutFor(null)} onDone={() => inv(["admin-inventory-checkouts"])} />}
    </div>
  );
}

function CheckoutDialog({ item, onClose, onDone }: { item: { id: string; name: string }; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ quantity: "1", checkedOutTo: "", returnBy: "" });
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const { error } = await supabase.from("inventory_checkouts").insert({
      item_id: item.id, quantity: Number(f.quantity) || 1, checked_out_to: f.checkedOutTo,
      expected_return_at: f.returnBy || null,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Checked out");
    onDone();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-sm border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-script text-3xl text-primary">Check out {item.name}</h3>
        <div className="mt-4 grid gap-3">
          <label className="block"><span className="text-xs text-muted-foreground">Quantity</span>
            <input type="number" min="1" className={`${invField} mt-1 w-full`} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Where it's going</span>
            <input className={`${invField} mt-1 w-full`} placeholder="Production name, person, location…" value={f.checkedOutTo} onChange={(e) => setF({ ...f, checkedOutTo: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Expected return date</span>
            <input type="date" className={`${invField} mt-1 w-full`} value={f.returnBy} onChange={(e) => setF({ ...f, returnBy: e.target.value })} /></label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs text-muted-foreground">Cancel</button>
          <button disabled={busy} onClick={submit} className={`${btn} disabled:opacity-60`}>{busy ? "Saving…" : "Check out"}</button>
        </div>
      </div>
    </div>
  );
}
