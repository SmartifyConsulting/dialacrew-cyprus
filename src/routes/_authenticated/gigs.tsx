import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startGigCheckout, verifyGigCheckout, chargeGigPenalties } from "@/lib/paystack.functions";
import { toast } from "sonner";
import { useDepartments } from "@/lib/db";
import { useCountries } from "@/lib/use-countries";
import { EQUIPMENT_CATEGORIES, useEquipmentItems } from "@/lib/equipment";
import { AddressAutocomplete } from "@/components/site/SiteTabs";
import { PolishDescription } from "@/components/site/PolishDescription";
import { GIG_DEPARTMENTS, PHONE_CODES, internationalPhone } from "@/lib/gig-form";
import { Page, Panel } from "@/components/AppShell";
import { confirmDialog } from "@/components/ConfirmDialog";
import { FindGigsTab } from "@/components/FindGigs";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { useMyCrewId } from "@/lib/site";
import { isUrgent, lateWithdrawal } from "@/lib/gigs";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/gigs")({
  head: () => ({
    meta: [
      { title: "Find Gigs — Book a Crew" },
      { name: "description", content: "Search open crew gigs by role, city and country, or grab one posted by the community." },
      { property: "og:title", content: "Find Gigs — Book a Crew" },
      { property: "og:description", content: "Open crew gigs, first to grab gets it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GigsPage,
});

const rand = (n: number) => `R ${Math.round(n).toLocaleString("en-ZA")}`;
const field = "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm";

type Gig = Database["public"]["Tables"]["community_gigs"]["Row"];

const empty = { title: "", role: "", department: "", description: "", event_date: "", end_date: "", call_time: "", venue: "", country: "South Africa", kit_required: "", pay_type: "day_rate", amount: "", contact_phone: "", expires_at: "" };

function GigsPage() {
  const { t } = useTranslation();
  const { session } = useSession();
  const uid = session?.user.id;
  const role = useRole(uid).data;
  const crewId = useMyCrewId(role === "crew").data;
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const countries = useCountries();
  const departments = [...new Set([...GIG_DEPARTMENTS, ...(useDepartments().data ?? []).filter(d => d && d !== "All")])].sort();
  const equipment = useEquipmentItems().data ?? [];
  const [phonePrefix, setPhonePrefix] = useState("+27");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [posting, setPosting] = useState(false);
  const [view, setView] = useState<"find" | "post">("find");
  const showForm = view === "post";
  const setShowForm = (v: boolean | ((s: boolean) => boolean)) => setView((cur) => ((typeof v === "function" ? v(cur === "post") : v) ? "post" : "find"));
  // "#post" opens the Post a Gig tab straight away.
  useEffect(() => {
    const check = () => { if (window.location.hash === "#post") setView("post"); };
    check(); window.addEventListener("hashchange", check); return () => window.removeEventListener("hashchange", check);
  }, []);
  const [agree, setAgree] = useState(false);
  const startCheckout = useServerFn(startGigCheckout);
  const verifyCheckout = useServerFn(verifyGigCheckout);
  const chargePenalties = useServerFn(chargeGigPenalties);
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("reference");
    if (!ref || !uid) return;
    window.history.replaceState(null, "", "/gigs");
    verifyCheckout({ data: { reference: ref } })
      .then(() => { toast.success("Payment received — the gig is yours. Your card is saved for any penalties."); qc.invalidateQueries({ queryKey: ["community-gigs"] }); })
      .catch((e) => toast.error((e as Error).message));
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const gigs = useQuery({
    queryKey: ["community-gigs"], enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from("community_gigs").select("*").order("event_date");
      if (error) throw error;
      return data as Gig[];
    },
  });
  const all = gigs.data ?? [];
  const open = all.filter((g) => g.status === "open" && new Date(g.expires_at) > new Date() && g.posted_by !== uid && (!departmentFilter || g.department === departmentFilter));
  const mine = all.filter((g) => g.posted_by === uid);
  const secured = all.filter((g) => g.secured_by === uid && g.status === "secured");
  const refresh = () => qc.invalidateQueries({ queryKey: ["community-gigs"] });
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function post() {
    if (posting) return;
    if (!uid || !["crew", "producer", "admin"].includes(role ?? "")) return void toast.error("Sign in as crew or a producer to post a gig.");
    const required: (keyof typeof empty)[] = ["title", "role", "department", "description", "event_date", "call_time", "venue", "country", "amount", "contact_phone", "expires_at"];
    const missing = required.filter((k) => !String(form[k]).trim());
    if (missing.length) {
      const labels: Record<string,string> = { title: "Gig title", role: "Role needed", department: "Department", description: "Description", event_date: "Event date", call_time: "Call time", venue: "Venue / address", country: "Country", amount: "Amount", contact_phone: "Contact phone", expires_at: "Posting expiry" };
      return void toast.error(`Please complete: ${missing.map(k => labels[k] ?? k).join(", ")}.`);
    }
    if (new Date(form.expires_at) > new Date(`${form.event_date}T${form.call_time}`)) return void toast.error("The posting must expire before the event starts.");
    let contactPhone: string;
    try { contactPhone = internationalPhone(form.contact_phone, phonePrefix); } catch (e) { return void toast.error((e as Error).message); }
    if (!Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) return void toast.error("Enter a positive amount.");
    if (form.end_date && form.end_date < form.event_date) return void toast.error("End date cannot be before the event date.");
    if (new Date(form.expires_at) <= new Date()) return void toast.error("The posting expiry must be in the future.");
    setPosting(true);
    try {
    const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", uid!).maybeSingle();
    const { error } = await supabase.from("community_gigs").insert({
      ...form, posted_by: uid, status: "open", secured_by: null, contact_phone: contactPhone, amount: Number(form.amount), end_date: form.end_date || null,
      expires_at: new Date(form.expires_at).toISOString(), poster_name: p?.full_name || p?.email || "Crew member",
    });
    if (error) return void toast.error(error.message);
    toast.success("Gig posted to the community"); setForm(empty); setShowForm(false); refresh();
    } catch (e) { toast.error((e as Error).message); } finally { setPosting(false); }
  }
  async function secure(g: Gig) {
    if (!agree) return void toast.error("Please accept the no-show terms first.");
    try {
      const { url } = await startCheckout({ data: { gigId: g.id } });
      window.location.href = url;
    } catch (e) { toast.error((e as Error).message); }
  }
  async function penalise(gigId: string) {
    try {
      const r = await chargePenalties({ data: { gigId } });
      if (r.failed) toast.error("The penalty couldn't be charged to the saved card — it's been recorded for follow-up.");
    } catch (e) { toast.error((e as Error).message); }
  }
  async function withdraw(g: Gig) {
    const late = lateWithdrawal(g.event_date, g.call_time);
    if (!(await confirmDialog(late ? "Less than 24 hours' notice — a penalty fee will be charged to your card. Withdraw anyway?" : "Withdraw from this gig?", { destructive: late }))) return;
    const { data, error } = await supabase.rpc("withdraw_from_gig" as never, { _gig: g.id } as never);
    if (error) return void toast.error(error.message);
    if (Number(data) > 0) await penalise(g.id);
    toast.success(Number(data) > 0 ? `Withdrawn. Penalty of ${rand(Number(data))} charged.` : "Withdrawn — the gig is back on the board."); refresh();
  }
  async function act(fn: "report_gig_no_show" | "complete_gig", g: Gig) {
    const { error } = await supabase.rpc(fn as never, { _gig: g.id } as never);
    if (error) return void toast.error(error.message);
    if (fn === "report_gig_no_show") await penalise(g.id);
    toast.success(fn === "complete_gig" ? "Marked as done" : "No-show reported, penalty charged"); refresh();
  }

  const isCrew = role === "crew";
  return (
    <Page open title={t("nav.findGigs")} subtitle={t("gigs.subtitle")}>
      <div role="tablist" aria-label="Gigs" className="mb-6 flex gap-2 border-b border-border">
        {([["find", "Find a Gig"], ["post", "Post a Gig"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => { setView(k); window.history.replaceState(null, "", k === "post" ? "/gigs#post" : "/gigs"); }}
            className={`border-b-2 px-4 py-2 text-sm font-semibold ${view === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>{l}</button>
        ))}
      </div>
      {view === "find" && <Panel title={t("gigs.open")}><div className="p-4"><FindGigsTab canClaim={role === "crew" && !!crewId} canManage={role === "producer" || role === "admin"} /></div></Panel>}

      <div className={view === "find" ? "mt-8" : ""}>
        <Panel title={view === "post" ? "Post a Gig" : t("gigs.community")}>
          <div className="p-4">
            <p className="text-sm text-muted-foreground">{t("gigs.communityHelp")}</p>

            {showForm && (
              <div id="post-gig-form" className="mt-4 rounded-xl border border-border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm">Gig title *<input required className={field} value={form.title} onChange={set("title")} /></label>
                  <label className="text-sm">Role needed *<input required className={field} placeholder="e.g. Focus puller" value={form.role} onChange={set("role")} /></label>
                  <label className="text-sm">Department<SearchableSelect required className={field} value={form.department} onChange={set("department")}><option value="">Select department</option>{departments.map(d => <option key={d}>{d}</option>)}</SearchableSelect></label>
                  <div className="text-sm"><label htmlFor="gig-contact">Contact phone</label><div className="flex gap-2"><SearchableSelect aria-label="Phone country code" className={`${field} max-w-44`} value={phonePrefix} onChange={e => setPhonePrefix(e.target.value)}>{PHONE_CODES.map(([name, code]) => <option key={name} value={code}>{name} ({code})</option>)}</SearchableSelect><input id="gig-contact" required type="tel" inputMode="tel" className={field} value={form.contact_phone} onChange={set("contact_phone")} /></div></div>
                  <label className="text-sm">Event date *<DateInput required type="date" className={field} value={form.event_date} onChange={set("event_date")} /></label>
                  <label className="text-sm">End date<DateInput type="date" className={field} value={form.end_date} onChange={set("end_date")} /></label>
                  <label className="text-sm">Call time *<input required type="time" className={field} value={form.call_time} onChange={set("call_time")} /></label>
                  <label className="text-sm">Posting expires *<input required type="datetime-local" className={field} value={form.expires_at} onChange={set("expires_at")} /></label>
                  <div className="text-sm md:col-span-2">Venue / address<AddressAutocomplete required className={field} placeholder="Start typing the venue or street address" country={countries.find(c => c.name === form.country)?.code.toLowerCase() ?? ""} value={form.venue} onChange={venue => setForm(f => ({ ...f, venue }))} onSelect={place => setForm(f => ({ ...f, venue: place.exactAddress }))} /></div>
                  <label className="text-sm">Country *<SearchableSelect required className={field} value={form.country} onChange={set("country")}>{countries.map((c) => <option key={c.code} value={c.name}>{c.name}</option>)}</SearchableSelect></label>
                  <label className="text-sm">Inventory required<SearchableSelect className={field} value={form.kit_required} onChange={set("kit_required")}><option value="">None required</option>{[...new Set([...EQUIPMENT_CATEGORIES, ...equipment.map(i => i.name)])].map(name => <option key={name}>{name}</option>)}</SearchableSelect></label>
                  <label className="text-sm">Pay type *<SearchableSelect required className={field} value={form.pay_type} onChange={set("pay_type")}><option value="day_rate">Day rate</option><option value="fixed">Fixed price</option></SearchableSelect></label>
                  <label className="text-sm">Amount (R) *<input required type="number" min="1" className={field} value={form.amount} onChange={set("amount")} /></label>
                  <label className="text-sm md:col-span-2">Description *<textarea required rows={3} className={field} value={form.description} onChange={set("description")} /></label>
                  <div className="md:col-span-2"><PolishDescription text={form.description} name={form.title} type={`Crew gig: ${form.role}`.slice(0,60)} client="" onPolished={description => setForm(f => ({ ...f, description }))} /></div>
                  <div className="md:col-span-2"><button disabled={posting} onClick={post} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{posting ? "Posting…" : "Post to community"}</button></div>
                </div>
              </div>
            )}

            {view === "find" && <>
            <h4 className="mt-6 text-sm font-semibold uppercase tracking-wide text-primary">{t("nav.findGigs")}</h4>
            <label className="mt-3 block text-sm">Department<SearchableSelect className={field} value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}><option value="">All departments</option>{departments.map(d => <option key={d}>{d}</option>)}</SearchableSelect></label>
            {isCrew && (
              <label className="my-4 flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>I agree: if I secure a gig and don't show up or deliver, or I give less than 24 hours' notice, a penalty fee will be charged automatically to the card I pay with.</span>
              </label>
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {open.length === 0 && <p className="text-muted-foreground">{t("gigs.empty")}</p>}
              {open.map((g) => (
                <div key={g.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{g.title}</h3>
                    {isUrgent(g.event_date, g.call_time) && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">{t("gigs.urgent")}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{g.role} · {g.department}</p>
                  <p className="mt-2 text-sm">{g.event_date}{g.end_date ? ` – ${g.end_date}` : ""} · call {String(g.call_time).slice(0, 5)}</p>
                  <p className="text-sm">{g.venue}, {g.country}</p>
                  {g.kit_required && <p className="text-sm text-muted-foreground">Equipment: {g.kit_required}</p>}
                  <div className="mt-2 text-sm text-muted-foreground"><AutoTranslatedText text={g.description} /></div>
                  <p className="mt-3 text-xl font-bold text-foreground">{rand(g.amount)} <span className="text-sm font-normal text-muted-foreground">{g.pay_type === "fixed" ? t("gigs.fixed") : t("gigs.perDay")}</span></p>
                  <p className="text-xs text-muted-foreground">Posted by {g.poster_name} · expires {new Date(g.expires_at).toLocaleString("en-ZA")}</p>
                  {isCrew && <button onClick={() => secure(g)} className="mt-3 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">{t("gigs.secure", { amount: rand(g.secure_fee) })}</button>}
                </div>
              ))}
            </div>

            {secured.length > 0 && (
              <div className="mt-8">
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">{t("gigs.secured")}</h4>
                <div className="divide-y divide-border rounded-xl border border-border">{secured.map((g) => (
                  <div key={g.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="flex-1"><p className="font-semibold">{g.title}</p><p className="text-sm text-muted-foreground">{g.event_date} · {g.venue} · contact {g.contact_phone}</p></div>
                    <button onClick={() => withdraw(g)} className="rounded-xl border border-border px-3 py-1.5 text-sm">{t("gigs.withdraw")}</button>
                  </div>))}</div>
              </div>
            )}

            </>}
            {view === "post" && mine.length > 0 && (
              <div className="mt-8">
                <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">{t("gigs.posted")}</h4>
                <div className="divide-y divide-border rounded-xl border border-border">{mine.map((g) => (
                  <div key={g.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="flex-1"><p className="font-semibold">{g.title}</p><p className="text-sm text-muted-foreground">{g.event_date} · {g.status === "secured" ? `Secured by ${g.secured_name}` : g.status}{Number(g.penalty_amount) > 0 ? ` · penalty ${rand(g.penalty_amount)}` : ""}</p></div>
                    {g.status === "secured" && <>
                      <button onClick={() => act("complete_gig", g)} className="rounded-xl bg-primary px-3 py-1.5 text-sm text-primary-foreground">{t("gigs.done")}</button>
                      <button onClick={() => act("report_gig_no_show", g)} className="rounded-xl border border-destructive px-3 py-1.5 text-sm text-destructive">{t("gigs.noShow")}</button>
                    </>}
                  </div>))}</div>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </Page>
  );
}
import { AutoTranslatedText } from "@/components/AutoTranslatedText";
import { useTranslation } from "react-i18next";
