import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Camera } from "lucide-react";
import { Page, Panel, Badge } from "@/components/AppShell";
import { useCompany, useCompanyInvites, useRole, useSession } from "@/lib/auth";
import { useMyCrewId, uploadFile } from "@/lib/site";
import { Avatar } from "@/components/site/SiteTabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s["tab"] === "string" ? { tab: s["tab"] } : {}),
  head: () => ({
    meta: [
      { title: "My profile — Book a Crew" },
      { name: "description", content: "Your crew profile, skills, certifications and kit." },
      { property: "og:title", content: "My profile — Book a Crew" },
      { property: "og:description", content: "Manage your service provider profile." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyProfile,
});

function MyProfile() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const crewId = useMyCrewId(role.data === "crew");
  const { tab } = Route.useSearch();
  if (role.data === "crew" && crewId.data) return <Navigate to="/crew/$id" params={{ id: crewId.data }} search={tab ? { tab } : {}} replace />;

  if (role.data === "producer") return <CompanyPanel userId={session?.user.id} />;

  return (
    <Page open title="My profile">
      <div className="mx-auto max-w-md">
        <AvatarCard userId={session?.user.id} />
        <p className="mt-5 text-center text-muted-foreground">
          {role.isLoading || crewId.isLoading ? "Loading…" : "Profiles are for crew and service providers."}
        </p>
      </div>
    </Page>
  );
}

function AvatarCard({ userId }: { userId: string | undefined }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["my-avatar", userId], enabled: !!userId,
    queryFn: async () => { const { data, error } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId!).maybeSingle(); if (error) throw error; return data; },
  });

  async function change(file?: File) {
    if (!file || !userId) return;
    try {
      const path = await uploadFile(`avatars/${userId}`, file, file.name);
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", userId);
      if (error) throw error;
      toast.success("Profile picture updated");
      qc.invalidateQueries({ queryKey: ["my-avatar", userId] });
    } catch (e) { toast.error(friendlyError(e)); }
  }

  return (
    <div className="flex items-center gap-4 rounded-sm border border-border bg-card p-4">
      <div className="relative">
        <Avatar name={me.data?.full_name || "?"} path={me.data?.avatar_url ?? null} size={64} />
        <label className="absolute bottom-0 right-0 grid h-6 w-6 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Change photo">
          <Camera className="h-3.5 w-3.5" /><input type="file" accept="image/*" hidden onChange={(e) => change(e.target.files?.[0])} />
        </label>
      </div>
      <div className="text-sm">
        <div className="font-semibold">{me.data?.full_name || "Your profile"}</div>
        <div className="text-xs text-muted-foreground">Click the camera icon to update your profile picture.</div>
      </div>
    </div>
  );
}

const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground";
const ROLES = ["producer", "production_manager", "accounts", "other"] as const;

function CompanyPanel({ userId }: { userId: string | undefined }) {
  const qc = useQueryClient();
  const company = useCompany(userId);
  const companyId = company.data?.companies?.id;
  const invites = useCompanyInvites(companyId);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("producer");
  const [otherRole, setOtherRole] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = company.data?.company_role === "owner" || !!(company.data as { is_admin?: boolean } | undefined)?.is_admin;

  async function sendInvite() {
    if (!companyId || !email.trim()) return;
    if (inviteRole === "other" && !otherRole.trim()) { toast.error("Please describe their role"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("company_invites").insert({ company_id: companyId, email: email.trim(), company_role: inviteRole, role_title: inviteRole === "other" ? otherRole.trim() : null });
      if (error) throw error;
      toast.success("Invite created — copy the link below and send it to them");
      setEmail(""); setOtherRole("");
      qc.invalidateQueries({ queryKey: ["company-invites", companyId] });
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/auth?invite=${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Invite link copied")).catch(() => toast.error("Could not copy — select and copy manually"));
  }

  if (company.isLoading) return <Page open title="My Company"><p className="text-muted-foreground">Loading…</p></Page>;

  if (!company.data) {
    return (
      <Page open title="My Company">
        <p className="text-muted-foreground">You're not linked to a company yet. Productions you create aren't scoped to a company until you are.</p>
      </Page>
    );
  }

  return (
    <Page open title={company.data.companies?.name ? `${company.data.companies.name} Settings` : "Company Settings"}>
      <div className="mb-5"><AvatarCard userId={userId} /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Your role">
          <div className="p-4 text-sm">
            <Badge>{company.data.company_role}</Badge>
            {!isOwner && <p className="mt-2 text-xs text-muted-foreground">Only company admins can invite and approve teammates.</p>}
          </div>
        </Panel>

        {isOwner && (
          <Panel title="Invite a teammate">
            <div className="space-y-3 p-4">
              <input type="email" placeholder="teammate@company.com" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="block text-xs font-semibold text-muted-foreground">Role
                <select required className={`${field} mt-1`} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}>
                  {ROLES.map((r) => <option key={r} value={r}>{r === "other" ? "Other" : r.replace("_", " ").replace(/^./, (c) => c.toUpperCase())}</option>)}
                </select>
              </label>
              {inviteRole === "other" && (
                <input placeholder="Describe their role, e.g. Office manager" className={field} value={otherRole} onChange={(e) => setOtherRole(e.target.value)} />
              )}
              <button disabled={busy} onClick={sendInvite} className={`${btn} disabled:opacity-60`}>{busy ? "Creating…" : "Create invite link"}</button>
              <p className="text-xs text-muted-foreground">No email is sent automatically — copy the link and share it yourself.</p>
            </div>
          </Panel>
        )}

        {companyId && <div className="lg:col-span-2"><TeamPanel companyId={companyId} canManage={isOwner} domain={company.data.companies?.email_domain ?? null} /></div>}

        {isOwner && (
          <div className="lg:col-span-2">
            <Panel title={`Invites (${invites.data?.length ?? 0})`}>
              <ul className="divide-y divide-border">
                {(invites.data ?? []).length === 0 && <li className="p-4 text-sm text-muted-foreground">No invites sent yet.</li>}
                {(invites.data ?? []).map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="text-sm font-medium">{i.email}</div>
                      <div className="text-xs text-muted-foreground">{(i as { role_title?: string | null }).role_title || i.company_role.replace("_", " ")} · {new Date(i.created_at).toLocaleDateString("en-ZA")}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge>{i.status}</Badge>
                      {i.status === "pending" && <button onClick={() => copyLink(i.token)} className="text-xs text-primary hover:underline">Copy link</button>}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </div>
    </Page>
  );
}

function TeamPanel({ companyId, canManage, domain }: { companyId: string; canManage: boolean; domain: string | null }) {
  const qc = useQueryClient();
  const team = useQuery({
    queryKey: ["company-team", companyId],
    queryFn: async () => { const { data, error } = await supabase.rpc("company_team", { _company: companyId }); if (error) throw error; return data ?? []; },
  });
  const requests = useQuery({
    queryKey: ["company-requests", companyId], enabled: canManage,
    queryFn: async () => { const { data, error } = await supabase.from("company_join_requests").select("*").eq("company_id", companyId).eq("status", "pending").order("created_at"); if (error) throw error; return data ?? []; },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["company-team", companyId] }); qc.invalidateQueries({ queryKey: ["company-requests", companyId] }); };
  async function decide(id: string, approve: boolean) {
    const { error } = await supabase.rpc("decide_join_request", { _request: id, _approve: approve });
    if (error) return void toast.error(friendlyError(error));
    toast.success(approve ? "Approved — they now have access" : "Request declined"); refresh();
  }
  async function toggleAdmin(userId: string, admin: boolean) {
    const { error } = await supabase.rpc("set_company_admin", { _company: companyId, _user: userId, _admin: admin });
    if (error) return void toast.error(friendlyError(error));
    toast.success(admin ? "Made admin" : "Admin rights removed"); refresh();
  }
  const admins = (team.data ?? []).filter((m) => m.is_admin).length;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title={`Team (${team.data?.length ?? 0})`}>
        <div className="px-4 pt-3 text-xs text-muted-foreground">
          {domain ? <>Anyone signing up with an <b>@{domain}</b> email needs approval from an admin.</> : "Your company email domain is claimed once your email address is verified."}
          {admins < 3 && <span className="block text-destructive">Please appoint at least 2 more admins ({admins} of 3).</span>}
        </div>
        <ul className="divide-y divide-border">
          {(team.data ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <div className="text-sm font-medium">{m.full_name || m.email}</div>
                <div className="text-xs text-muted-foreground">{m.email} · {m.company_role === "owner" ? "Primary admin" : m.company_role.replace("_", " ")}</div>
              </div>
              <div className="flex items-center gap-3">
                {m.is_admin && <Badge>admin</Badge>}
                {canManage && m.company_role !== "owner" && (
                  <button onClick={() => toggleAdmin(m.user_id, !m.is_admin)} className="text-xs text-primary hover:underline">{m.is_admin ? "Revoke admin" : "Make admin"}</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      {canManage && (
        <Panel title={`Waiting for approval (${requests.data?.length ?? 0})`}>
          <ul className="divide-y divide-border">
            {(requests.data ?? []).length === 0 && <li className="p-4 text-sm text-muted-foreground">Nobody is waiting.</li>}
            {(requests.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <div className="text-sm font-medium">{r.full_name || r.email}</div>
                  <div className="text-xs text-muted-foreground">{r.email} · {new Date(r.created_at).toLocaleDateString("en-ZA")}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decide(r.id, true)} className={btn}>Approve</button>
                  <button onClick={() => decide(r.id, false)} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Decline</button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
