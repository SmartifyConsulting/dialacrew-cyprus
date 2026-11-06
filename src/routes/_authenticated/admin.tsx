import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Folder, Star } from "lucide-react";
import { inviteCrewMembers } from "@/lib/invite.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Page, Badge, Panel } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { zar } from "@/lib/demo-data";
import { DocumentChecklistsAdmin } from "@/components/admin/DocumentChecklistsAdmin";
import { EquipmentAdmin } from "@/components/admin/EquipmentAdmin";
import { CountriesAdmin } from "@/components/admin/CountriesAdmin";
import { StatusPill } from "@/components/admin/StatusPill";
import { TokenLedger } from "@/components/admin/TokenLedger";
import { ChecklistTemplateManager } from "@/components/ChecklistTemplateManager";
import { confirmDialog, promptDialog } from "@/components/ConfirmDialog";
import { useAddCrewGroupMember, useCreateCrewGroup, useCreateProductionType, useCrew, useCrewGroups, useDeleteCrewGroup, useProductionTypes, useRemoveCrewGroupMember } from "@/lib/db";
import { useDefaultCrewRoles } from "@/lib/site";

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
  const invite = useServerFn(inviteCrewMembers);
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[]; invited: number; inviteErrors: string[] } | null>(null);

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
    let invited = 0;
    let inviteErrors: string[] = [];
    if (rowsToInsert.length) {
      const { data: inserted, error } = await supabase.from("crew_members").insert(rowsToInsert).select("id, name, email");
      if (error) errors.push(`Insert failed: ${error.message}`);
      else {
        imported = rowsToInsert.length;
        const withEmail = (inserted ?? []).filter((r) => r.email).map((r) => ({ crewId: r.id, email: r.email, name: r.name }));
        if (withEmail.length) {
          try {
            const res = await invite({ data: { crew: withEmail } });
            invited = res.invited;
            inviteErrors = res.errors;
          } catch (e) { inviteErrors = [e instanceof Error ? e.message : "Could not send invites"]; }
        }
      }
    }
    setResult({ imported, skipped, errors, invited, inviteErrors });
    setImporting(false);
    if (imported > 0) {
      toast.success(`Imported ${imported} crew member${imported > 1 ? "s" : ""}${invited ? ` — ${invited} invited to the app` : ""}`);
      inv(["admin-crew"], ["crew"], ["crew-search"], ["departments"]);
    }
  }

  return (
    <div className="space-y-5">
      <Panel title="Import crew from CSV">
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">Upload a CSV with a header row. Map its columns to crew fields below, preview, then import. Required: name, role, department. Rows with an email are automatically invited to the app.</p>
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
              <div>Imported: {result.imported} · Skipped: {result.skipped} · Invited: {result.invited}</div>
              {result.errors.length > 0 && <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
              {result.inviteErrors.length > 0 && (
                <>
                  <div className="mt-2 text-xs font-semibold text-destructive">Invite errors</div>
                  <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs text-muted-foreground">{result.inviteErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </>
              )}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [
    { title: "Admin — Book a Crew" },
    { name: "description", content: "Manage Book a Crew people, bookings and platform operations." },
    { property: "og:title", content: "Admin — Book a Crew" },
    { property: "og:description", content: "Book a Crew platform administration and production oversight." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (search: Record<string, unknown>) => ({ tab: typeof search["tab"] === "string" ? (search["tab"] as string) : undefined }),
  component: AdminPage,
});

const ADMIN_GROUPS = [
  { name: "People & Organisations", tabs: ["Users", "Crew", "Companies", "Subscriptions"] },
  { name: "Reporting", tabs: ["Bookings", "Gigs"] },
  { name: "Equipment", tabs: ["Equipment"] },
  { name: "Disputes", tabs: ["Disputes"] },
  { name: "Reviews", tabs: ["Reviews"] },
  { name: "Templates", tabs: ["Checklists"] },
  { name: "Countries", tabs: ["Countries"] },
  { name: "Finance", tabs: ["Finance"] },
  { name: "Platform Management", tabs: ["Configuration", "System Settings", "Audit Log"] },
] as const;
// Producers get everything Super Admin has, except Platform Management (super-admin only) and
// with the raw Crew roster swapped for Crew Types — producers group crew into reusable, typed
// templates rather than editing crew records directly.
const PRODUCER_ADMIN_GROUPS = [
  { name: "People & Organisations", tabs: ["Users", "Crew"] },
  { name: "Reporting", tabs: ["Finance", "Bookings"] },
  { name: "Disputes", tabs: ["Disputes"] },
  { name: "Reviews", tabs: ["Reviews"] },
  { name: "Templates", tabs: ["Checklists"] },
] as const;
type AdminGroup = (typeof ADMIN_GROUPS)[number]["name"] | (typeof PRODUCER_ADMIN_GROUPS)[number]["name"];
type AdminTab = (typeof ADMIN_GROUPS)[number]["tabs"][number] | (typeof PRODUCER_ADMIN_GROUPS)[number]["tabs"][number];
const btn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground";

function PlaceholderTab({ name }: { name: string }) {
  return (
    <Panel title={name}>
      <p className="p-4 text-sm text-muted-foreground">Nothing configurable here yet.</p>
    </Panel>
  );
}

function AdminPage() {
  const { t: translate } = useTranslation();
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const isSuperAdmin = role.data === "admin";
  const isProducer = role.data === "producer";
  const groups = isSuperAdmin ? ADMIN_GROUPS : PRODUCER_ADMIN_GROUPS;
  const search = Route.useSearch();
  const requestedTab = search.tab as AdminTab | undefined;
  const requestedGroup = groups.find((g) => (g.tabs as readonly string[]).includes(requestedTab ?? ""));
  const [group, setGroup] = useState<AdminGroup>(requestedGroup?.name ?? groups[0].name);
  const activeGroup = groups.find((g) => g.name === group) ?? groups[0];
  const [tab, setTab] = useState<AdminTab>(requestedGroup && requestedTab ? requestedTab : activeGroup.tabs[0]);

  if (role.isLoading) return <Page open title="Admin"><p className="text-muted-foreground">Loading…</p></Page>;
  if (!isSuperAdmin && !isProducer) {
    return (
      <Page open title="Admin">
        <div className="rounded-sm border border-border bg-card p-8 text-center">
          <h2 className="font-script text-4xl text-primary">Not authorized</h2>
          <p className="mt-3 text-muted-foreground">This area is for producers and platform administrators only.</p>
        </div>
      </Page>
    );
  }

  function selectGroup(g: (typeof groups)[number]) {
    setGroup(g.name);
    setTab(g.tabs[0]);
  }

  return (
    <Page open title={translate("nav.admin")} subtitle={translate(isSuperAdmin ? "adminNav.platformSubtitle" : "adminNav.producerSubtitle")}>
      <nav className="mb-1 flex gap-1 overflow-x-auto border-b border-border">
        {groups.map((g) => (
          <button key={g.name} onClick={() => selectGroup(g)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${group === g.name ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{translate(`adminNav.labels.${g.name}`)}</button>
        ))}
      </nav>
      <nav className="mb-5 flex gap-1 overflow-x-auto">
        {activeGroup.tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{translate(`adminNav.labels.${t}`)}</button>
        ))}
      </nav>
      {tab === "Users" && <UsersTab canManageAdmins={isSuperAdmin} />}
      {tab === "Crew" && <CrewTab />}
      {tab === "Companies" && <CompaniesTab />}
      {tab === "Bookings" && <BookingsTab />}
      {tab === "Gigs" && <GigsTab />}
      {tab === "Finance" && <div className="space-y-6"><PaymentsTab /><InvoicesTab /><GigFeesTab />{isSuperAdmin && <TokenLedger />}</div>}
      {tab === "Equipment" && <EquipmentAdmin />}
      {tab === "Disputes" && <DisputesTab />}
      {tab === "Reviews" && <ReviewsTab />}
      {tab === "Subscriptions" && <SubscriptionsTab />}
      {tab === "Checklists" && (
        <div className="space-y-6">
          <ChecklistTemplateManager audience="producer" />
          <div>
            <h3 className="mb-2 flex items-center gap-2 font-display text-sm font-semibold"><Folder className="h-4 w-4 text-primary" aria-hidden /> Document checklist</h3>
            <DocumentChecklistsAdmin />
          </div>
        </div>
      )}
      {tab === "Countries" && <CountriesAdmin />}
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

const ROLE_BADGE: Record<string, string> = {
  producer: "bg-primary/10 text-primary",
  admin: "bg-destructive/10 text-destructive",
  crew: "bg-success/15 text-success",
  client: "bg-muted text-muted-foreground",
};

function UsersTab({ canManageAdmins = true }: { canManageAdmins?: boolean }) {
  const { t } = useTranslation();
  const inv = useInv();
  const [showImport, setShowImport] = useState(false);
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, suspended, created_at, social_opt_in, spotlight_featured_at, spotlight_links"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      if (p.error) throw p.error; if (r.error) throw r.error;
      const roles = new Map<string, string[]>();
      for (const row of r.data ?? []) roles.set(row.user_id, [...(roles.get(row.user_id) ?? []), row.role]);
      return (p.data ?? []).map((u) => ({ ...u, roles: roles.get(u.id) ?? [] }));
    },
  });
  // Producers can hand out producer/crew/client roles but never grant or remove admin — that stays Super Admin-only.
  const ALL_ROLES = ["producer", "crew", "client", "admin"] as const;
  const ROLES: readonly (typeof ALL_ROLES)[number][] = canManageAdmins ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "admin");

  async function toggleSuspend(id: string, suspended: boolean) {
    const { error } = await supabase.from("profiles").update({ suspended: !suspended }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(t(!suspended ? "adminUsers.suspended" : "adminUsers.reactivated"));
    inv(["admin-users"]);
  }
  async function addRole(userId: string, role: (typeof ALL_ROLES)[number]) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(t("adminUsers.roleAdded"));
    inv(["admin-users"]);
  }
  async function removeRole(userId: string, role: string) {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as (typeof ALL_ROLES)[number]);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(t("adminUsers.roleRemoved"));
    inv(["admin-users"]);
  }
  return (
    <div className="space-y-5">
    <Panel title={`${t("adminNav.labels.Users")} (${users.data?.length ?? 0})`} right={
      <button onClick={() => setShowImport(!showImport)} className="text-xs font-semibold text-primary hover:underline">{t(showImport ? "adminUsers.hideImport" : "adminUsers.import")}</button>
    }>
      <div className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-destructive text-destructive" /> Happy to be featured on social media</span>
        <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-foreground text-foreground" /> Already featured</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">{t("signup.firstName")}</th><th className="px-4">{t("signup.lastName")}</th><th className="px-4">{t("common.email")}</th><th className="px-4">{t("adminUsers.roles")}</th><th className="px-4">{t("common.status")}</th><th className="px-4">{t("common.actions")}</th></tr></thead>
        <tbody>
          {(users.data ?? []).map((u) => {
            const [first, ...rest] = (u.full_name || "").trim().split(/\s+/).filter(Boolean);
            const last = rest.join(" ");
            return (
            <tr key={u.id} className="border-t border-border">
              <td className="px-4 py-2 font-medium">
                <span className="inline-flex items-center gap-1">{first || "—"}{u.social_opt_in && (u.spotlight_featured_at
                  ? <Star className="h-3.5 w-3.5 fill-foreground text-foreground" aria-label="Featured on social media" />
                  : <Star className="h-3.5 w-3.5 fill-destructive text-destructive" aria-label="Happy to be featured on social media" />)}</span>
                {u.social_opt_in && <SpotlightCell id={u.id} featuredAt={u.spotlight_featured_at} links={(u.spotlight_links as string[] | null) ?? []} />}
              </td>
              <td className="px-4 font-medium">{last || "—"}</td>
              <td className="px-4 text-muted-foreground">{u.email}</td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {u.roles.map((r) => (
                    <span key={r} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${ROLE_BADGE[r] ?? "bg-muted text-muted-foreground"}`}>
                      {t(`accountRoles.${r}`, r)}
                      {(canManageAdmins || r !== "admin") && (
                        <button onClick={() => removeRole(u.id, r)} aria-label={`Remove ${r} role`} className="-mr-0.5 text-current opacity-60 hover:opacity-100">×</button>
                      )}
                    </span>
                  ))}
                  {ROLES.filter((r) => !u.roles.includes(r)).length > 0 && (
                    <select value="" onChange={(e) => { if (e.target.value) addRole(u.id, e.target.value as (typeof ROLES)[number]); }}
                      aria-label={`Add a role to ${u.full_name || u.email}`}
                      className="rounded-full border border-dashed border-border bg-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary">
                      <option value="">+ {t("common.role")}</option>
                      {ROLES.filter((r) => !u.roles.includes(r)).map((r) => <option key={r} value={r} className="bg-background text-foreground capitalize">{t(`accountRoles.${r}`)}</option>)}
                    </select>
                  )}
                </div>
              </td>
              <td className="px-4">{u.suspended ? <Badge>Declined</Badge> : <Badge>Confirmed</Badge>}</td>
              <td className="px-4"><button onClick={() => toggleSuspend(u.id, u.suspended)} className="text-xs text-primary hover:underline">{t(u.suspended ? "adminUsers.reactivate" : "adminUsers.suspend")}</button></td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
    {showImport && <ImportTab />}
    </div>
  );
}

// The global "Default" role list every new production's Crew Required list starts from
// (see useCrewRoleList in SiteTabs.tsx), editable here instead of being hardcoded.
function DefaultCrewRolesPanel() {
  const inv = useInv();
  const roles = useDefaultCrewRoles().data ?? [];
  const [newRole, setNewRole] = useState("");

  async function setRoles(next: string[]) {
    await supabase.from("default_crew_roles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (next.length) await supabase.from("default_crew_roles").insert(next.map((role, sort_order) => ({ role, sort_order })));
    inv(["default-crew-roles"]);
  }
  function addRole() {
    const name = newRole.trim();
    if (!name) return;
    if (roles.some((r) => r.role.toLowerCase() === name.toLowerCase())) { toast.error(`"${name}" is already in the list`); return; }
    setRoles([...roles.map((r) => r.role), name]);
    setNewRole("");
  }
  function removeRole(role: string) { setRoles(roles.filter((r) => r.role !== role).map((r) => r.role)); }

  return (
    <Panel title="Default">
      <p className="px-4 pt-3 text-xs text-muted-foreground">The roles every new production's Crew Role Required list starts with.</p>
      <ul className="divide-y divide-border text-sm">
        {roles.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
            {r.role}
            <button onClick={() => removeRole(r.role)} aria-label={`Remove ${r.role}`} className="text-xs text-muted-foreground hover:text-destructive">Remove</button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRole())}
          placeholder="Add a role" className={`${invField} min-w-0 flex-1`} />
        <button onClick={addRole} className="shrink-0 rounded-sm border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary">+ Add role</button>
      </div>
    </Panel>
  );
}

// Crew Types: producers group crew members into named, reusable templates (optionally tagged to
// a production type) instead of editing raw crew records — picked from Find Crew's Select Crew Type.
// Crew Type: producer-managed tiers (Small/Medium/Large/Extra-Large seeded by default, but fully
// CRUD — create, rename, delete, and manage membership). Applied at the day level on a production's Crew tab.
const CREW_SUBTABS = ["Crew Type", "Curated Crew"] as const;

// Crew: wraps the two crew-grouping screens as sub-tabs instead of two top-level Admin tabs.
function CrewTab() {
  const [subTab, setSubTab] = useState<(typeof CREW_SUBTABS)[number]>("Crew Type");
  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto">
        {CREW_SUBTABS.map((t) => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-semibold ${subTab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </nav>
      {subTab === "Crew Type" && <CrewTypeSizesTab />}
      {subTab === "Curated Crew" && <CrewTypesTab />}
    </div>
  );
}

function CrewTypeSizesTab() {
  const allGroups = useCrewGroups().data ?? [];
  const tiers = allGroups.filter((g) => g.sizeTier);
  const crew = useCrew().data ?? [];
  const createGroup = useCreateCrewGroup();
  const deleteGroup = useDeleteCrewGroup();
  const addMember = useAddCrewGroupMember();
  const removeMember = useRemoveCrewGroupMember();
  const inv = useInv();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [memberPick, setMemberPick] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);

  async function addCrewToGroup(groupId: string) {
    const crewId = memberPick[groupId];
    if (!crewId) return;
    try { await addMember.mutateAsync({ groupId, crewId }); setMemberPick((prev) => ({ ...prev, [groupId]: "" })); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function createTier() {
    if (!newName.trim()) { toast.error("Name this crew type"); return; }
    try {
      await createGroup.mutateAsync({ name: newName.trim(), crewIds: [], sizeTier: newName.trim() });
      toast.success(`"${newName.trim()}" created`);
      setNewName(""); setAdding(false);
    } catch (e) { toast.error(friendlyError(e)); }
  }
  async function renameTier(g: { id: string; name: string }, name: string) {
    const clean = name.trim();
    if (!clean || clean === g.name) { setRenaming(null); return; }
    const { error } = await supabase.from("crew_groups").update({ name: clean, size_tier: clean }).eq("id", g.id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Renamed"); setRenaming(null); inv(["crew-groups"]);
  }

  return (
    <Panel title={`Crew Type (${tiers.length})`} right={!adding && (
      <button onClick={() => setAdding(true)} className="text-xs font-semibold text-primary hover:underline">+ Add crew type</button>
    )}>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 border-b border-border p-4">
          <label className="text-xs"><span className="block text-muted-foreground">Name</span>
            <input autoFocus className={`${invField} min-w-40`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Skeleton Crew" /></label>
          <button onClick={createTier} className={btn}>Create</button>
          <button onClick={() => { setAdding(false); setNewName(""); }} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
        </div>
      )}
      <ul className="divide-y divide-border text-sm">
        {tiers.length === 0 && <li className="p-4 text-xs text-muted-foreground">No crew types yet — add one above.</li>}
        {tiers.map((g) => (
          <li key={g.id}>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              {renaming === g.id ? (
                <input autoFocus defaultValue={g.name} onBlur={(e) => renameTier(g, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} className={`${invField} flex-1`} />
              ) : (
                <button onClick={() => setExpanded(expanded === g.id ? null : g.id)} className="flex-1 text-left font-medium hover:text-primary">
                  {g.name} <span className="font-normal text-muted-foreground">({g.memberIds.length})</span>
                </button>
              )}
              <button onClick={() => setRenaming(renaming === g.id ? null : g.id)} className="shrink-0 text-xs text-primary hover:underline">Rename</button>
              <button onClick={() => deleteGroup.mutate(g.id)} className="shrink-0 text-xs text-destructive hover:underline">Delete</button>
            </div>
            {expanded === g.id && (
              <div className="space-y-2 border-t border-border bg-muted/20 px-4 py-3">
                {g.memberIds.length === 0 && <p className="text-xs text-muted-foreground">No crew members added yet.</p>}
                <ul className="divide-y divide-border rounded-sm border border-border bg-card">
                  {g.memberIds.map((id) => {
                    const c = crew.find((x) => x.id === id);
                    return (
                      <li key={id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{c?.name ?? "Unknown"}{c?.role && <span className="text-xs text-muted-foreground"> · {c.role}</span>}</span>
                        <button onClick={() => removeMember.mutate({ groupId: g.id, crewId: id })} aria-label={`Remove ${c?.name ?? "member"}`} className="shrink-0 text-xs text-muted-foreground hover:text-destructive">Remove</button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center gap-2">
                  <select className={`${invField} min-w-48`} value={memberPick[g.id] ?? ""} onChange={(e) => setMemberPick((prev) => ({ ...prev, [g.id]: e.target.value }))}>
                    <option value="">+ Add a user to this tier…</option>
                    {crew.filter((c) => !g.memberIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}
                  </select>
                  <button onClick={() => addCrewToGroup(g.id)} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary">Add</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// Curated Crew: free-form named combos producers build themselves (optionally tagged to a
// production type) — distinct from the fixed Crew Type size tiers above.
function CrewTypesTab() {
  const groups = (useCrewGroups().data ?? []).filter((g) => !g.sizeTier);
  const crew = useCrew().data ?? [];
  const productionTypes = useProductionTypes().data ?? [];
  const createGroup = useCreateCrewGroup();
  const createType = useCreateProductionType();
  const deleteGroup = useDeleteCrewGroup();
  const addMember = useAddCrewGroupMember();
  const removeMember = useRemoveCrewGroupMember();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("");
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState("");
  const [memberPick, setMemberPick] = useState<Record<string, string>>({});

  async function createCrewType() {
    if (!newName.trim()) { toast.error("Name this crew type"); return; }
    try {
      await createGroup.mutateAsync({ name: newName.trim(), crewIds: [], productionType: newType || null });
      toast.success(`"${newName.trim()}" created`);
      setNewName(""); setNewType(""); setAdding(false);
    } catch (e) { toast.error(friendlyError(e)); }
  }
  async function addProductionType() {
    if (!newTypeName.trim()) return;
    try { await createType.mutateAsync(newTypeName.trim()); setNewType(newTypeName.trim()); setNewTypeName(""); setAddingType(false); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function addCrewToGroup(groupId: string) {
    const crewId = memberPick[groupId];
    if (!crewId) return;
    try { await addMember.mutateAsync({ groupId, crewId }); setMemberPick((prev) => ({ ...prev, [groupId]: "" })); }
    catch (e) { toast.error(friendlyError(e)); }
  }

  return (
    <div className="space-y-4">
      <DefaultCrewRolesPanel />
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-primary">Curated Crew ({groups.length})</h2>
        {!adding && <button onClick={() => setAdding(true)} className="text-xs font-semibold text-primary hover:underline">+ Add crew mix</button>}
      </div>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-sm border border-border bg-card p-4">
          <label className="text-xs"><span className="block text-muted-foreground">Name</span>
            <input className={`${invField} min-w-40`} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Commercial B-Unit" /></label>
          <label className="text-xs"><span className="block text-muted-foreground">Production type (optional)</span>
            {addingType ? (
              <span className="mt-1 flex gap-1">
                <input autoFocus className={invField} value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} placeholder="New type" />
                <button onClick={addProductionType} className="rounded-sm bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground">Save</button>
              </span>
            ) : (
              <select className={invField} value={newType} onChange={(e) => e.target.value === "__add__" ? setAddingType(true) : setNewType(e.target.value)}>
                <option value="">Any production type</option>
                {productionTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__add__">+ Add new type…</option>
              </select>
            )}
          </label>
          <button onClick={createCrewType} className={btn}>Create</button>
          <button onClick={() => { setAdding(false); setNewName(""); setNewType(""); }} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">Cancel</button>
        </div>
      )}
      {groups.length === 0 && <p className="rounded-sm border border-dashed border-border p-4 text-xs text-muted-foreground">No crew mixes yet — add one above.</p>}
      {groups.map((g) => {
        const isOpen = expanded === g.id;
        return (
          <section key={g.id} className="rounded-sm border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-primary bg-primary px-4 py-2.5 text-primary-foreground">
              <button type="button" onClick={() => setExpanded(isOpen ? null : g.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                <span className="truncate font-display text-sm font-semibold uppercase tracking-wide">{g.name}</span>
                <span className="shrink-0 text-xs font-normal opacity-90">({g.memberIds.length}){g.productionType ? ` · ${g.productionType}` : ""}</span>
              </button>
              <button onClick={() => deleteGroup.mutate(g.id)} className="shrink-0 text-xs font-semibold text-primary-foreground/80 hover:text-white">Delete</button>
            </div>
            {isOpen && (
              <div className="space-y-2 px-4 py-3">
                {g.name === "Default Crew" && (
                  <p className="text-xs text-muted-foreground">Add crew covering the roles listed in Default above.</p>
                )}
                {g.memberIds.length === 0 && <p className="text-xs text-muted-foreground">No crew members added yet.</p>}
                <ul className="divide-y divide-border rounded-sm border border-border">
                  {g.memberIds.map((id) => {
                    const c = crew.find((x) => x.id === id);
                    return (
                      <li key={id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">{c?.name ?? "Unknown"}{c?.role && <span className="text-xs text-muted-foreground"> · {c.role}</span>}</span>
                        <button onClick={() => removeMember.mutate({ groupId: g.id, crewId: id })} aria-label={`Remove ${c?.name ?? "member"}`} className="shrink-0 text-xs text-muted-foreground hover:text-destructive">Remove</button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center gap-2">
                  <select className={`${invField} min-w-48`} value={memberPick[g.id] ?? ""} onChange={(e) => setMemberPick((prev) => ({ ...prev, [g.id]: e.target.value }))}>
                    <option value="">+ Add a user to this crew type…</option>
                    {crew.filter((c) => !g.memberIds.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.role}</option>)}
                  </select>
                  <button onClick={() => addCrewToGroup(g.id)} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold hover:border-primary hover:text-primary">Add</button>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
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
  const { t } = useTranslation();
  const inv = useInv();
  const [openProd, setOpenProd] = useState<string | null>(null);
  const bookings = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => { const { data, error } = await supabase.from("bookings").select("id, role, status, payment_status, booking_date, crew_members(name), productions(id, name)").order("booking_date", { ascending: false }); if (error) throw error; return data ?? []; },
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

  const byProduction = new Map<string, { name: string; rows: NonNullable<typeof bookings.data> }>();
  for (const b of bookings.data ?? []) {
    const prod = b.productions as { id: string; name: string } | null;
    const key = prod?.id ?? "unassigned";
    if (!byProduction.has(key)) byProduction.set(key, { name: prod?.name ?? "No production", rows: [] });
    byProduction.get(key)!.rows.push(b);
  }

  return (
    <Panel title={`${t("adminNav.labels.Bookings")} (${bookings.data?.length ?? 0})`}>
      <ul className="divide-y divide-border">
        {[...byProduction.entries()].map(([prodId, group]) => (
          <li key={prodId}>
            <button onClick={() => setOpenProd(openProd === prodId ? null : prodId)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
              <span className="font-medium">{group.name} <span className="font-normal text-muted-foreground">({group.rows.length})</span></span>
              <span className="text-xs text-muted-foreground">{openProd === prodId ? "Hide ▲" : "Show ▼"}</span>
            </button>
            {openProd === prodId && (
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Crew</th><th className="px-4">Role</th><th className="px-4">Date</th><th className="px-4">Status</th><th className="px-4">Payment</th><th className="px-4">Action</th></tr></thead>
                <tbody>{group.rows.map((b) => (
                  <tr key={b.id} className="border-t border-border">
                    <td className="px-4 py-2">{(b.crew_members as { name: string } | null)?.name}</td>
                    <td className="px-4">{b.role}</td><td className="px-4">{b.booking_date}</td>
                    <td className="px-4">
                      <StatusPill value={b.status as (typeof BOOKING_STATUSES)[number]} options={BOOKING_STATUSES} label={(s) => t(`workflowStatuses.${s}`)} onChange={(s) => setStatus(b.id, s)} />
                    </td>
                    <td className="px-4 text-xs text-muted-foreground">{b.payment_status}</td>
                    <td className="px-4"><button onClick={() => removeBooking(b.id)} className="text-xs text-destructive hover:underline">Delete</button></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const PAYMENT_STATUSES = ["not_required", "payment_required", "payment_received", "funds_held", "awaiting_release", "release_authorised", "payment_released", "payment_failed", "payment_disputed"] as const;

function PaymentsTab() {
  const { t } = useTranslation();
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
    <Panel title={`${t("nav.payments")} (${rows.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Production</th><th className="px-4">Crew</th><th className="px-4">Amount</th><th className="px-4">Status</th></tr></thead>
        <tbody>{(rows.data ?? []).map((b) => (
          <tr key={b.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{(b.productions as { name: string } | null)?.name}</td>
            <td className="px-4">{(b.crew_members as { name: string } | null)?.name}</td>
            <td className="px-4">{zar(b.crew_rate * b.days)}</td>
            <td className="px-4">
              <StatusPill value={b.payment_status as (typeof PAYMENT_STATUSES)[number]} options={PAYMENT_STATUSES} label={(s) => t(`workflowStatuses.${s}`)} onChange={(s) => setStatus(b.id, s)} />
            </td>
          </tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}

const INVOICE_STATUSES = ["draft", "sent", "paid", "overdue", "cancelled"];

function InvoicesTab() {
  const { t } = useTranslation();
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
    <Panel title={`${t("nav.invoices")} (${invoices.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Invoice #</th><th className="px-4">Crew</th><th className="px-4">Production</th><th className="px-4">Subtotal</th><th className="px-4">VAT</th><th className="px-4">Total</th><th className="px-4">Status</th><th className="px-4">Action</th></tr></thead>
        <tbody>{(invoices.data ?? []).map((i) => (
          <tr key={i.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{i.invoice_number}</td>
            <td className="px-4">{(i.crew_members as { name: string } | null)?.name}</td>
            <td className="px-4">{(i.productions as { name: string } | null)?.name}</td>
            <td className="px-4">{zar(i.subtotal)}</td><td className="px-4">{zar(i.vat_amount)}</td><td className="px-4 font-semibold">{zar(i.total)}</td>
            <td className="px-4">
              <StatusPill value={i.status as (typeof INVOICE_STATUSES)[number]} options={INVOICE_STATUSES} label={(s) => t(`workflowStatuses.${s}`)} onChange={(s) => setStatus(i.id, s)} />
            </td>
            <td className="px-4"><button onClick={() => removeInvoice(i.id)} className="text-xs text-destructive hover:underline">Delete</button></td>
          </tr>
        ))}</tbody>
      </table>
      {invoices.data?.length === 0 && <p className="p-4 text-sm text-muted-foreground">No invoices generated yet.</p>}
    </Panel>
  );
}

const GIG_STATUSES = ["open", "secured", "cancelled", "expired", "completed"] as const;

function GigsTab() {
  const inv = useInv();
  const gigs = useQuery({
    queryKey: ["admin-gigs"],
    queryFn: async () => { const { data, error } = await supabase.from("community_gigs").select("*").order("event_date", { ascending: false }); if (error) throw error; return data ?? []; },
  });
  async function setStatus(id: string, status: (typeof GIG_STATUSES)[number]) {
    const { error } = await supabase.from("community_gigs").update({ status }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Gig status updated"); inv(["admin-gigs"]);
  }
  async function removeGig(id: string) {
    const { error } = await supabase.from("community_gigs").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Gig deleted"); inv(["admin-gigs"]);
  }
  return (
    <Panel title={`Gigs (${gigs.data?.length ?? 0})`}>
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Title</th><th className="px-4">Posted by</th><th className="px-4">Secured by</th><th className="px-4">Date</th><th className="px-4">Amount</th><th className="px-4">Status</th><th className="px-4">Action</th></tr></thead>
        <tbody>{(gigs.data ?? []).map((g) => (
          <tr key={g.id} className="border-t border-border">
            <td className="px-4 py-2 font-medium">{g.title}<div className="text-xs font-normal text-muted-foreground">{g.role} · {g.department}</div></td>
            <td className="px-4">{g.poster_name}</td>
            <td className="px-4">{g.secured_name ?? "—"}</td>
            <td className="px-4">{g.event_date}</td>
            <td className="px-4">{zar(g.amount)}</td>
            <td className="px-4">
              <StatusPill value={g.status as (typeof GIG_STATUSES)[number]} options={GIG_STATUSES} label={(s) => s} onChange={(s) => setStatus(g.id, s)} />
            </td>
            <td className="px-4"><button onClick={() => removeGig(g.id)} className="text-xs text-destructive hover:underline">Delete</button></td>
          </tr>
        ))}</tbody>
      </table>
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

function SubscriptionsTab() {
  const inv = useInv();
  const plans = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => { const { data, error } = await supabase.from("membership_plans").select("*"); if (error) throw error; return data ?? []; },
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

function SpotlightCell({ id, featuredAt, links }: { id: string; featuredAt: string | null; links: string[] }) {
  const inv = useInv();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(featuredAt ? featuredAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [text, setText] = useState(links.join("\n"));
  async function save(clear = false) {
    const list = clear ? [] : text.split(/\s+/).map((l) => l.trim()).filter(Boolean);
    if (list.some((l) => !/^https?:\/\//i.test(l))) { toast.error("Each link must start with http:// or https://"); return; }
    const { error } = await supabase.from("profiles").update({ spotlight_featured_at: clear ? null : new Date(`${date}T12:00:00`).toISOString(), spotlight_links: list }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(clear ? "Feature cleared" : "Feature recorded"); setOpen(false); inv(["admin-users"]);
  }
  return (
    <div className="mt-1 text-[11px] font-normal">
      {featuredAt ? (
        <span className="text-success">Featured {new Date(featuredAt).toLocaleDateString("en-ZA")}{links.length > 0 && <> · {links.map((l, i) => <a key={l} href={l} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary underline">link {i + 1}</a>)}</>}</span>
      ) : <span className="text-muted-foreground">Not featured yet</span>}
      <button onClick={() => setOpen(!open)} className="ml-2 text-primary hover:underline">{featuredAt ? "Edit" : "Record feature"}</button>
      {open && (
        <div className="mt-1 space-y-1 rounded-sm border border-border bg-background p-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-sm border border-input bg-card px-2 py-1" aria-label="Date featured" />
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Post links, one per line" className="w-full rounded-sm border border-input bg-card px-2 py-1" />
          <div className="flex gap-2"><button onClick={() => save()} className={btn}>Save</button>{featuredAt && <button onClick={() => save(true)} className="text-destructive hover:underline">Clear</button>}</div>
        </div>
      )}
    </div>
  );
}
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
