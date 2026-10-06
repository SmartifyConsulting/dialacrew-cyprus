import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Page, Panel, Badge } from "@/components/AppShell";
import { useCompany, useCompanyInvites, useRole, useSession } from "@/lib/auth";
import { useMyCrewId } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
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
  if (role.data === "crew" && crewId.data) return <Navigate to="/crew/$id" params={{ id: crewId.data }} replace />;

  if (role.data === "producer") return <CompanyPanel userId={session?.user.id} />;

  return (
    <Page open title="My profile">
      <p className="text-muted-foreground">
        {role.isLoading || crewId.isLoading ? "Loading…" : "Profiles are for crew and service providers."}
      </p>
    </Page>
  );
}

const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-primary-foreground";
const ROLES = ["producer", "production_manager", "accounts"] as const;

function CompanyPanel({ userId }: { userId: string | undefined }) {
  const qc = useQueryClient();
  const company = useCompany(userId);
  const companyId = company.data?.companies?.id;
  const invites = useCompanyInvites(companyId);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<(typeof ROLES)[number]>("producer");
  const [busy, setBusy] = useState(false);
  const isOwner = company.data?.company_role === "owner";

  async function sendInvite() {
    if (!companyId || !email.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("company_invites").insert({ company_id: companyId, email: email.trim(), company_role: inviteRole });
      if (error) throw error;
      toast.success("Invite created — copy the link below and send it to them");
      setEmail("");
      qc.invalidateQueries({ queryKey: ["company-invites", companyId] });
    } catch (e) { toast.error((e as Error).message); }
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
    <Page open title="My Company" subtitle={company.data.companies?.name ?? ""}>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Your role">
          <div className="p-4 text-sm">
            <Badge>{company.data.company_role}</Badge>
            {!isOwner && <p className="mt-2 text-xs text-muted-foreground">Only the company owner can invite teammates.</p>}
          </div>
        </Panel>

        {isOwner && (
          <Panel title="Invite a teammate">
            <div className="space-y-3 p-4">
              <input type="email" placeholder="teammate@company.com" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
              <select className={field} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as (typeof ROLES)[number])}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ")}</option>)}
              </select>
              <button disabled={busy} onClick={sendInvite} className={`${btn} disabled:opacity-60`}>{busy ? "Creating…" : "Create invite link"}</button>
              <p className="text-xs text-muted-foreground">No email is sent automatically — copy the link and share it yourself.</p>
            </div>
          </Panel>
        )}

        {isOwner && (
          <div className="lg:col-span-2">
            <Panel title={`Invites (${invites.data?.length ?? 0})`}>
              <ul className="divide-y divide-border">
                {(invites.data ?? []).length === 0 && <li className="p-4 text-sm text-muted-foreground">No invites sent yet.</li>}
                {(invites.data ?? []).map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-4 py-2.5">
                    <div>
                      <div className="text-sm font-medium">{i.email}</div>
                      <div className="text-xs text-muted-foreground">{i.company_role.replace("_", " ")} · {new Date(i.created_at).toLocaleDateString("en-ZA")}</div>
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
