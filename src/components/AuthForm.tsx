import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { PasswordInput, fieldClass, labelClass, submitClass } from "@/components/PasswordInput";
import { mapAuthError, passwordChecks, usePlatformSetting } from "@/lib/auth";
import { SERVICE_SKILLS } from "@/lib/skills";

/** Sign-in / sign-up card shared by the home page and /auth. */
export function AuthForm() {
  const navigate = useNavigate();
  const inviteToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("invite") : null;
  const [mode, setMode] = useState<"signin" | "signup">(inviteToken ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dialCode, setDialCode] = useState("+27");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"crew" | "client" | "producer">("crew");
  const [companyName, setCompanyName] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [socialOptIn, setSocialOptIn] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [invite, setInvite] = useState<{ company_name: string; company_role: string; email: string; valid: boolean } | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const producerSignupEnabled = usePlatformSetting("producer_self_signup_enabled").data === true;

  useEffect(() => {
    if (!inviteToken) return;
    supabase.rpc("get_invite", { _token: inviteToken }).then(({ data }) => {
      const row = data?.[0];
      if (row?.valid) { setInvite(row); setEmail(row.email); }
      else toast.error("This invite link is invalid or has already been used.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/dashboard", replace: true }); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (e === "SIGNED_IN" && s) navigate({ to: "/dashboard", replace: true }); });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const checks = passwordChecks(password, email);

  const fail = (err: unknown) => {
    const m = mapAuthError(err);
    setError(m.message);
    toast.error(m.message);
    if (m.retryAfter) setWait(m.retryAfter);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && checks.some((c) => !c.ok)) {
      setError("Your password doesn't meet the requirements below.");
      pwRef.current?.focus();
      return;
    }
    if (mode === "signup" && !agreed) {
      setError("Please accept the Terms & Conditions and Privacy Policy to continue.");
      return;
    }
    if (mode === "signup" && !invite && role === "crew" && skills.length === 0) {
      setError("Pick at least one skill you offer (or add your own).");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
              first_name: firstName.trim(), last_name: lastName.trim(),
              phone: phone.trim() ? `${dialCode} ${phone.trim().replace(/^0+/, "")}` : "", role,
              ...(role === "producer" && !invite ? { company_name: companyName } : {}),
              social_opt_in: role === "crew" && socialOptIn,
              ...(role === "crew" && !invite ? { skills } : {}),
              ...(invite ? { invite_token: inviteToken } : {}),
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          if (socialOptIn) await supabase.from("profiles").update({ social_opt_in: true }).eq("id", data.session.user.id);
          const { data: docs } = await supabase.from("legal_documents").select("id").eq("active", true).in("doc_type", ["terms", "privacy_policy"]);
          if (docs?.length) await supabase.from("legal_acceptances").insert(docs.map((d) => ({ user_id: data.session!.user.id, document_id: d.id, user_agent: navigator.userAgent })));
        }
      }
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  async function google() {
    setError("");
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (result.error) fail(result.error);
  }

  return (
    <div className="w-full">
    <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {(["signin", "signup"] as const).map((m) => (
        <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
          className={`py-2 font-display text-sm font-semibold ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
          {m === "signin" ? "Sign in" : "Sign up"}
        </button>
      ))}
    </div>

    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
      {mode === "signup" && (
        <>
          {invite && (
            <div className="rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">
              You've been invited to join <strong>{invite.company_name}</strong> as {invite.company_role.replace("_", " ")}.
            </div>
          )}
          {!invite && (
            <div><span className={labelClass}>I am</span>
              <div className={`grid gap-2 ${producerSignupEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
                {(producerSignupEnabled ? (["crew", "producer"] as const) : (["crew"] as const)).map((r) => (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={`rounded-sm border py-2 text-sm font-semibold ${role === r ? "border-primary bg-primary/15 text-primary" : "border-input text-muted-foreground"}`}>
                    {r === "crew" ? "Crew member" : "Producer"}
                  </button>
                ))}
              </div>
              {!producerSignupEnabled && (
                <p className="mt-1 text-xs text-muted-foreground">Producer accounts are set up by an existing producer.</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><label className={labelClass} htmlFor="firstName">First name</label>
              <input id="firstName" required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={fieldClass} /></div>
            <div><label className={labelClass} htmlFor="lastName">Last name</label>
              <input id="lastName" required value={lastName} onChange={(e) => setLastName(e.target.value)} className={fieldClass} /></div>
          </div>
          <div><label className={labelClass} htmlFor="phone">Phone</label>
            <div className="flex gap-2">
              <select aria-label="Country code" value={dialCode} onChange={(e) => setDialCode(e.target.value)} className={`${fieldClass} w-28`}>
                {DIAL_CODES.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
              </select>
              <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="82 123 4567" className={fieldClass} />
            </div></div>
          {!invite && producerSignupEnabled && role === "producer" && (
            <div><label className={labelClass} htmlFor="companyName">Company name</label>
              <input id="companyName" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={fieldClass} /></div>
          )}
          {!invite && role === "crew" && (
            <div>
              <span className={labelClass}>Which services do you offer? (pick as many as apply)</span>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {SERVICE_SKILLS.map((s) => {
                  const on = skills.includes(s);
                  return (
                    <button key={s} type="button" onClick={() => setSkills(on ? skills.filter((x) => x !== s) : [...skills, s])}
                      className={`rounded-sm border px-2 py-1.5 text-left text-xs ${on ? "border-primary bg-primary/15 text-primary" : "border-input text-muted-foreground"}`}>
                      {s}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">Service not listed? Add your own.</p>
              <div className="mt-1 flex gap-2">
                <input value={customSkill} onChange={(e) => setCustomSkill(e.target.value)} placeholder="Your service" className={`${fieldClass} text-xs`}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const v = customSkill.trim(); if (v && !skills.includes(v)) setSkills([...skills, v]); setCustomSkill(""); } }} />
                <button type="button" onClick={() => { const v = customSkill.trim(); if (v && !skills.includes(v)) setSkills([...skills, v]); setCustomSkill(""); }}
                  className="rounded-sm border border-input px-3 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary">Add</button>
              </div>
              {skills.filter((s) => !SERVICE_SKILLS.includes(s)).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skills.filter((s) => !SERVICE_SKILLS.includes(s)).map((s) => (
                    <span key={s} className="flex items-center gap-1 rounded-sm bg-primary/15 px-2 py-1 text-xs text-primary">
                      {s} <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <div><label className={labelClass} htmlFor="email">Email</label>
        <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} /></div>
      <div><label className={labelClass} htmlFor="password">Password</label>
        <PasswordInput id="password" ref={pwRef} required autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "signup" && (
          <ul className="mt-2 space-y-0.5 text-xs">
            {checks.map((c) => <li key={c.id} className={c.ok ? "text-success" : "text-muted-foreground"}>{c.ok ? "✓" : "○"} {c.label}</li>)}
          </ul>
        )}
      </div>
      {mode === "signup" && role === "crew" && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={socialOptIn} onChange={(e) => setSocialOptIn(e.target.checked)} />
          <span>Yes, Book a Crew may feature me on its social media in my country (optional).</span>
        </label>
      )}
      {mode === "signup" && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="mt-0.5 accent-primary" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I agree to the <Link to="/terms" target="_blank" className="text-primary hover:underline">Terms &amp; Conditions</Link> and Privacy Policy, and (for crew) confirm I'm registering as an independent contractor, not an employee of Book a Crew.</span>
        </label>
      )}
      <p aria-live="polite" className="min-h-5 text-sm text-destructive">{error}</p>
      <button type="submit" disabled={busy || wait > 0} className={submitClass}>
        {wait > 0 ? `Try again in ${wait}s` : busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {mode === "signin" && (
        <div className="text-center">
          <Link to="/forgot-password" tabIndex={-1} className="text-sm text-muted-foreground underline hover:text-primary">Forgot password?</Link>
        </div>
      )}
    </form>

    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
    </div>
    <button type="button" onClick={google} className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-card py-3 font-display text-sm font-semibold text-foreground shadow-sm hover:bg-muted">
      <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z" />
        <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2 1.5-4.6 2.5-7.7 2.5-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.3 36.2 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z" />
      </svg>
      Continue with Google
    </button>
    </div>
  );
}

const DIAL_CODES = [
  { code: "+27", label: "ZA +27" }, { code: "+357", label: "CY +357" }, { code: "+44", label: "UK +44" },
  { code: "+1", label: "US +1" }, { code: "+264", label: "NA +264" }, { code: "+267", label: "BW +267" },
  { code: "+263", label: "ZW +263" }, { code: "+254", label: "KE +254" }, { code: "+234", label: "NG +234" },
  { code: "+61", label: "AU +61" }, { code: "+49", label: "DE +49" }, { code: "+33", label: "FR +33" },
  { code: "+971", label: "AE +971" },
];
