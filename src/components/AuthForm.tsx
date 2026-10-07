import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { PasswordInput, fieldClass, labelClass, submitClass } from "@/components/PasswordInput";
import { mapAuthError, passwordChecks, usePlatformSetting } from "@/lib/auth";
import { DEV_ACCOUNTS } from "@/lib/dev-accounts";
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
              ...(role === "crew" && !invite ? { skills } : {}),
              ...(invite ? { invite_token: inviteToken } : {}),
            },
          },
        });
        if (error) throw error;
        if (data.session) {
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

  async function quickSwitch(acct: (typeof DEV_ACCOUNTS)[number]) {
    setError("");
    let pw = acct.password;
    if (!pw) {
      const cacheKey = `devpw:${acct.email}`;
      pw = sessionStorage.getItem(cacheKey);
      if (!pw) {
        pw = window.prompt(`Password for ${acct.email} (cached for this browser session only, never saved to disk):`);
        if (!pw) return;
        sessionStorage.setItem(cacheKey, pw);
      }
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: acct.email, password: pw });
    setBusy(false);
    if (error) { sessionStorage.removeItem(`devpw:${acct.email}`); fail(error); }
  }

  return (
    <div className="w-full">
    {import.meta.env.DEV && (
      <div className="mb-6 rounded-sm border border-dashed border-primary/50 bg-primary/5 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-primary">Dev quick switch (local only)</p>
        <div className="flex flex-wrap gap-2">
          {DEV_ACCOUNTS.map((a) => (
            <button key={a.email} type="button" disabled={busy} onClick={() => quickSwitch(a)}
              className="rounded-sm border border-primary/40 bg-card px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/10 disabled:opacity-50">
              {a.label}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => supabase.auth.signOut()}
            className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted disabled:opacity-50">
            Sign out
          </button>
        </div>
      </div>
    )}
    <h1 className="text-center font-script text-6xl text-primary">{mode === "signin" ? "Welcome back" : "Join the crew"}</h1>
    <div className="mt-6 grid grid-cols-2 border border-border">
      {(["signin", "signup"] as const).map((m) => (
        <button key={m} type="button" onClick={() => { setMode(m); setError(""); }}
          className={`py-2 font-display text-sm uppercase tracking-widest ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
          {m === "signin" ? "Sign in" : "Sign up"}
        </button>
      ))}
    </div>

    <form onSubmit={submit} className="mt-6 space-y-4 rounded-sm border border-border bg-card p-6">
      {mode === "signup" && (
        <>
          {invite && (
            <div className="rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">
              You've been invited to join <strong>{invite.company_name}</strong> as {invite.company_role.replace("_", " ")}.
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
          {!invite && (
            <div><span className={labelClass}>I am</span>
              <div className={`grid gap-2 ${producerSignupEnabled ? "grid-cols-2" : "grid-cols-1"}`}>
                {(producerSignupEnabled ? (["crew", "producer"] as const) : (["crew"] as const)).map((r) => (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={`rounded-sm border py-2 text-sm font-semibold uppercase tracking-wider ${role === r ? "border-primary bg-primary/15 text-primary" : "border-input text-muted-foreground"}`}>
                    {r === "crew" ? "Crew member" : "Producer"}
                  </button>
                ))}
              </div>
              {!producerSignupEnabled && (
                <p className="mt-1 text-xs text-muted-foreground">Producer accounts are set up by an existing producer.</p>
              )}
            </div>
          )}
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
                  className="rounded-sm border border-input px-3 text-xs font-semibold uppercase text-muted-foreground hover:border-primary hover:text-primary">Add</button>
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

    <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
      <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
    </div>
    <button type="button" onClick={google} className="w-full rounded-sm border border-border bg-card py-3 font-display text-sm font-semibold uppercase tracking-widest text-foreground hover:bg-muted">
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
