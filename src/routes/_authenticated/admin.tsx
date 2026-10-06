import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Page, Badge, Panel } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { zar } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Book a Crew" }] }),
  component: AdminPage,
});

const TABS = ["Users", "Crew", "Companies", "Bookings", "Payments", "Invoices", "Disputes", "Reviews", "Memberships", "Audit Log"] as const;
const btn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground";

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
      {tab === "Companies" && <CompaniesTab />}
      {tab === "Bookings" && <BookingsTab />}
      {tab === "Payments" && <PaymentsTab />}
      {tab === "Invoices" && <InvoicesTab />}
      {tab === "Disputes" && <DisputesTab />}
      {tab === "Reviews" && <ReviewsTab />}
      {tab === "Memberships" && <MembershipsTab />}
      {tab === "Audit Log" && <AuditLogTab />}
    </Page>
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
    if (error) { toast.error(error.message); return; }
    toast.success(!suspended ? "User suspended" : "User reactivated");
    inv(["admin-users"]);
  }
  return (
    <Panel title={`Users (${users.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th className="px-4">Email</th><th className="px-4">Roles</th><th className="px-4">Status</th><th className="px-4">Action</th></tr></thead>
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
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th className="px-4">Role</th><th className="px-4">Department</th><th className="px-4">Rate</th><th className="px-4">Rating</th></tr></thead>
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
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Name</th><th className="px-4">Billing email</th><th className="px-4">Phone</th><th className="px-4">Users</th></tr></thead>
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
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Production</th><th className="px-4">Crew</th><th className="px-4">Role</th><th className="px-4">Date</th><th className="px-4">Status</th><th className="px-4">Payment</th></tr></thead>
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
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Production</th><th className="px-4">Crew</th><th className="px-4">Amount</th><th className="px-4">Status</th></tr></thead>
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
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Invoice #</th><th className="px-4">Crew</th><th className="px-4">Production</th><th className="px-4">Subtotal</th><th className="px-4">VAT</th><th className="px-4">Total</th><th className="px-4">Status</th></tr></thead>
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
    if (error) { toast.error(error.message); return; }
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
                <button onClick={() => resolve(d.id, "rejected")} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold uppercase">Reject</button>
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
    if (error) { toast.error(error.message); return; }
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
    if (error) { toast.error(error.message); return; }
    toast.success("Price updated"); inv(["admin-plans"]);
  }
  return (
    <div className="space-y-5">
      <Panel title="Pricing">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">Type</th><th className="px-4">Price (cents)</th><th className="px-4">Currency</th><th className="px-4">Action</th></tr></thead>
          <tbody>{(plans.data ?? []).map((p) => (
            <PlanRow key={p.id} plan={p} onSave={updatePrice} />
          ))}</tbody>
        </table>
      </Panel>
      <Panel title={`Memberships (${memberships.data?.length ?? 0})`}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">User</th><th className="px-4">Type</th><th className="px-4">Status</th></tr></thead>
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
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-2">When</th><th className="px-4">Action</th><th className="px-4">Table</th><th className="px-4">Record</th><th className="px-4">Change</th></tr></thead>
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
