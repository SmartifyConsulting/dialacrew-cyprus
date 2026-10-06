import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TopNav } from "@/components/AppShell";
import { PasswordInput, labelClass, submitClass } from "@/components/PasswordInput";
import { mapAuthError, passwordChecks } from "@/lib/auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Book a Crew" },
      { name: "description", content: "Choose a new password for your Book a Crew account." },
      { property: "og:title", content: "Set a new password — Book a Crew" },
      { property: "og:description", content: "Choose a new Book a Crew password." },
    ],
  }),
  component: Reset,
});

function Reset() {
  const navigate = useNavigate();
  const [ok, setOk] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setOk(true); });
    supabase.auth.getSession().then(({ data }) => setOk(!!data.session || isRecovery ? !!data.session || null : false));
    const t = setTimeout(() => setOk((v) => v ?? false), 3000);
    return () => { data.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const checks = passwordChecks(password, "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (checks.some((c) => !c.ok)) { setError("Your password doesn't meet the requirements."); return; }
    setBusy(true); setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      const m = mapAuthError(error);
      setError(m.message); toast.error(m.message);
      if (m.message.includes("expired")) navigate({ to: "/forgot-password" });
      return;
    }
    toast.success("Password updated");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-center font-script text-5xl text-primary">New password</h1>
        {ok === false ? (
          <p className="mt-6 rounded-sm border border-border bg-card p-6 text-center text-muted-foreground">
            This reset link is invalid or has expired. <Link to="/forgot-password" className="text-primary underline">Request a new one</Link>.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-sm border border-border bg-card p-6">
            <div><label className={labelClass} htmlFor="password">New password</label>
              <PasswordInput id="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <ul className="mt-2 space-y-0.5 text-xs">
                {checks.slice(0, 2).map((c) => <li key={c.id} className={c.ok ? "text-success" : "text-muted-foreground"}>{c.ok ? "✓" : "○"} {c.label}</li>)}
              </ul>
            </div>
            <p aria-live="polite" className="min-h-5 text-sm text-destructive">{error}</p>
            <button disabled={busy || ok !== true} className={submitClass}>{busy ? "Saving…" : "Update password"}</button>
          </form>
        )}
      </main>
    </div>
  );
}
