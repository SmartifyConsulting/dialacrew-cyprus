import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TopNav } from "@/components/AppShell";
import { fieldClass, labelClass, submitClass } from "@/components/PasswordInput";
import { mapAuthError } from "@/lib/auth";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password — Book a Crew" },
      { name: "description", content: "Get a link to reset your Book a Crew password." },
      { property: "og:title", content: "Forgot password — Book a Crew" },
      { property: "og:description", content: "Reset your Book a Crew password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Forgot,
});

function Forgot() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) { const m = mapAuthError(error); setError(m.message); toast.error(m.message); return; }
    setSent(true);
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-center font-script text-5xl text-primary">{t("recovery.forgot")}</h1>
        {sent ? (
          <p className="mt-6 rounded-sm border border-border bg-card p-6 text-center text-muted-foreground">{t("recovery.sent", { email })}</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-sm border border-border bg-card p-6">
            <div><label className={labelClass} htmlFor="email">{t("common.email")}</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} /></div>
            <p aria-live="polite" className="min-h-5 text-sm text-destructive">{error}</p>
            <button disabled={busy} className={submitClass}>{busy ? t("recovery.sending") : t("recovery.send")}</button>
          </form>
        )}
        <p className="mt-4 text-center"><Link to="/auth" className="text-sm text-muted-foreground underline hover:text-primary">{t("recovery.back")}</Link></p>
      </main>
    </div>
  );
}
