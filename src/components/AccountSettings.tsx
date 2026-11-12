import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CrewRefeature } from "@/components/CrewRefeature";
import { AiBalance } from "@/components/site/AiBalance";
import { useCountries } from "@/lib/use-countries";
import { Eye, EyeOff } from "lucide-react";
import { Panel, Badge } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useMemberships, useRole, useSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { deleteMyAccount } from "@/lib/account.functions";

const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60";
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

/** Account, billing and danger-zone panels shared by every profile view. */
export function AccountSettings({ userId, email, embedded = false }: { userId: string | undefined; email: string | undefined; embedded?: boolean }) {
  const countries = useCountries();
  const { session } = useSession();
  const profile = useQuery({ queryKey: ["account-country", userId], enabled: !!userId && userId === session?.user.id, queryFn: async () => { const { data, error } = await supabase.from("profiles").select("country").eq("id", userId!).maybeSingle(); if (error) throw error; return data; } });
  const currency = countries.find(c => c.code === profile.data?.country || c.name === profile.data?.country)?.currency ?? "USD";
  return (
    <div className={`grid lg:grid-cols-2 ${embedded ? "gap-0" : "gap-5"}`}>
      <BillingPanel userId={userId} embedded={embedded} />
      <SignInPanel email={email} embedded={embedded} />
      {userId === session?.user.id && <div className="lg:col-span-2"><AiBalance currency={currency} embedded={embedded} showLedger /></div>}
      <div className="lg:col-span-2"><CrewRefeature /></div>
      <div className="lg:col-span-2"><DangerPanel embedded={embedded} /></div>
    </div>
  );
}

function BillingPanel({ userId, embedded }: { userId: string | undefined; embedded: boolean }) {
  const role = useRole(userId);
  const memberships = useMemberships(userId);
  const plans = useQuery({
    queryKey: ["membership-plans"],
    queryFn: async () => { const { data, error } = await supabase.from("membership_plans").select("*").eq("active", true); if (error) throw error; return data ?? []; },
  });
  const current = (memberships.data ?? []).find((m) => m.status === "active") ?? memberships.data?.[0];
  const plan = (plans.data ?? []).find((p) => p.id === current?.plan_id) ?? (plans.data ?? []).find((p) => p.membership_type === role.data);
  return (
    <AccountSection embedded={embedded} title="Billing & membership">
      <div className="space-y-2 p-4 text-sm">
        <div className="flex items-center justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium capitalize">{plan?.membership_type ?? role.data ?? "—"}</span></div>
        <div className="flex items-center justify-between"><span className="text-muted-foreground">Price</span><span className="font-medium">{plan ? `${plan.currency} ${(plan.price_cents / 100).toFixed(2)}` : "—"}</span></div>
        <div className="flex items-center justify-between"><span className="text-muted-foreground">Status</span>{current ? <Badge>{current.status}</Badge> : <span>No membership yet</span>}</div>
        <div className="flex items-center justify-between"><span className="text-muted-foreground">Started</span><span>{fmt(current?.started_at ?? null)}</span></div>
        <div className="flex items-center justify-between"><span className="text-muted-foreground">Renews / expires</span><span>{fmt(current?.expires_at ?? null)}</span></div>
      </div>
    </AccountSection>
  );
}

function SignInPanel({ email: passed, embedded }: { email: string | undefined; embedded: boolean }) {
  const { session } = useSession();
  const email = passed ?? session?.user.email;
  const [newEmail, setNewEmail] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  async function changeEmail() {
    if (!newEmail.trim()) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success("Check both inboxes to confirm the new email"); setNewEmail("");
  }
  async function changePassword() {
    if (pw.length < 8) return void toast.error("Use at least 8 characters");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return void toast.error(friendlyError(error));
    toast.success("Password updated"); setPw("");
  }
  return (
    <AccountSection embedded={embedded} title="Sign-in & security">
      <div className="space-y-3 p-4">
        <p className="text-xs text-muted-foreground">Signed in as <b>{email}</b></p>
        <div className="flex gap-2"><input type="email" placeholder="New email address" className={field} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /><button disabled={busy} onClick={changeEmail} className={btn}>Change</button></div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input type={show ? "text" : "password"} placeholder="New password" className={`${field} pr-9`} value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" tabIndex={-1} onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
          </div>
          <button disabled={busy} onClick={changePassword} className={btn}>Update</button>
        </div>
      </div>
    </AccountSection>
  );
}

function DangerPanel({ embedded }: { embedded: boolean }) {
  const del = useServerFn(deleteMyAccount);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      await del({ data: { confirm: "DELETE" } });
      await supabase.auth.signOut();
      qc.clear();
      toast.success("Your account has been deleted");
      navigate({ to: "/" });
    } catch (e) { toast.error(friendlyError(e)); setBusy(false); }
  }
  return (
    <AccountSection embedded={embedded} title="Delete account">
      <div className="space-y-3 p-4 text-sm">
        <p className="text-muted-foreground">This permanently removes your sign-in. It cannot be undone. Type <b>DELETE</b> to confirm.</p>
        <div className="flex gap-2">
          <input className={field} value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" />
          <button disabled={busy || text !== "DELETE"} onClick={remove} className="rounded-sm bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground disabled:opacity-50">{busy ? "Deleting…" : "Delete my account"}</button>
        </div>
      </div>
    </AccountSection>
  );
}

function AccountSection({ title, embedded, children }: { title: string; embedded: boolean; children: ReactNode }) {
  return embedded ? <section className="h-full border-t border-border"><h2 className="px-4 pt-4 text-sm font-semibold text-primary">{title}</h2>{children}</section> : <Panel title={title}>{children}</Panel>;
}
