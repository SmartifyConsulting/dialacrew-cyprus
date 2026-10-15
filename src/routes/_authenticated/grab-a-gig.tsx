import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { startGigCheckout, verifyGigCheckout, chargeGigPenalties } from "@/lib/paystack.functions";
import { toast } from "sonner";
import { Page, Panel } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { isUrgent, lateWithdrawal } from "@/lib/gigs";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/grab-a-gig")({
  head: () => ({
    meta: [
      { title: "Grab a Gig — Book a Crew" },
      { name: "description", content: "Crew post gigs to the whole community. Secure one for a small fee." },
      { property: "og:title", content: "Grab a Gig — Book a Crew" },
      { property: "og:description", content: "Community gig board for crew." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GrabAGig,
});

const rand = (n: number) => `R ${Math.round(n).toLocaleString("en-ZA")}`;
const field = "w-full rounded-xl border border-input bg-background px-3 py-2 text-sm";
const COUNTRIES = ["South Africa", "Namibia", "Botswana", "Kenya", "Nigeria", "Cyprus", "United Kingdom"];
type Gig = Database["public"]["Tables"]["community_gigs"]["Row"];

const empty = { title: "", role: "", department: "", description: "", event_date: "", end_date: "", call_time: "", venue: "", country: "South Africa", kit_required: "", pay_type: "day_rate", amount: "", contact_phone: "", expires_at: "" };

function GrabAGig() {
  const { session } = useSession();
  const uid = session?.user.id;
  const role = useRole(uid).data;
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [agree, setAgree] = useState(false);
  const startCheckout = useServerFn(startGigCheckout);
  const verifyCheckout = useServerFn(verifyGigCheckout);
  const chargePenalties = useServerFn(chargeGigPenalties);
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("reference");
    if (!ref || !uid) return;
    window.history.replaceState(null, "", "/grab-a-gig");
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
  const open = all.filter((g) => g.status === "open" && new Date(g.expires_at) > new Date() && g.posted_by !== uid);
  const mine = all.filter((g) => g.posted_by === uid);
  const secured = all.filter((g) => g.secured_by === uid && g.status === "secured");
  const refresh = () => qc.invalidateQueries({ queryKey: ["community-gigs"] });
  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function post() {
    const required: (keyof typeof empty)[] = ["title", "role", "department", "description", "event_date", "call_time", "venue", "country", "amount", "contact_phone", "expires_at"];
    const missing = required.filter((k) => !String(form[k]).trim());
    if (missing.length) return void toast.error("Please fill in every required field.");
    if (new Date(form.expires_at) > new Date(`${form.event_date}T${form.call_time}`)) return void toast.error("The posting must expire before the event starts.");
    const { data: p } = await supabase.from("profiles").select("full_name, email").eq("id", uid!).maybeSingle();
    const { error } = await supabase.from("community_gigs").insert({
      ...form, amount: Number(form.amount), end_date: form.end_date || null,
      expires_at: new Date(form.expires_at).toISOString(), poster_name: p?.full_name || p?.email || "Crew member",
    });
    if (error) return void toast.error(error.message);
    toast.success("Gig posted to the community"); setForm(empty); setShowForm(false); refresh();
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
    if (!confirm(late ? "Less than 24 hours' notice — a penalty fee will be charged to your card. Withdraw anyway?" : "Withdraw from this gig?")) return;
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
    <Page open title="Grab a Gig" subtitle="Crew post gigs to the whole community. First to secure it gets it."
      actions={isCrew && <button onClick={() => setShowForm((s) => !s)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{showForm ? "Close" : "Post a gig"}</button>}>
      {showForm && (
        <Panel title="Post a gig">
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <label className="text-sm">Gig title *<input className={field} value={form.title} onChange={set("title")} /></label>
            <label className="text-sm">Role needed *<input className={field} placeholder="e.g. Focus puller" value={form.role} onChange={set("role")} /></label>
            <label className="text-sm">Department *<input className={field} placeholder="e.g. Camera" value={form.department} onChange={set("department")} /></label>
            <label className="text-sm">Contact phone *<input className={field} value={form.contact_phone} onChange={set("contact_phone")} /></label>
            <label className="text-sm">Event date *<input type="date" className={field} value={form.event_date} onChange={set("event_date")} /></label>
            <label className="text-sm">End date<input type="date" className={field} value={form.end_date} onChange={set("end_date")} /></label>
            <label className="text-sm">Call time *<input type="time" className={field} value={form.call_time} onChange={set("call_time")} /></label>
            <label className="text-sm">Posting expires *<input type="datetime-local" className={field} value={form.expires_at} onChange={set("expires_at")} /></label>
            <label className="text-sm md:col-span-2">Venue / address *<input className={field} value={form.venue} onChange={set("venue")} /></label>
            <label className="text-sm">Country *<select className={field} value={form.country} onChange={set("country")}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-sm">Kit required<input className={field} value={form.kit_required} onChange={set("kit_required")} /></label>
            <label className="text-sm">Pay type *<select className={field} value={form.pay_type} onChange={set("pay_type")}><option value="day_rate">Day rate</option><option value="fixed">Fixed price</option></select></label>
            <label className="text-sm">Amount (R) *<input type="number" min="1" className={field} value={form.amount} onChange={set("amount")} /></label>
            <label className="text-sm md:col-span-2">Description *<textarea rows={3} className={field} value={form.description} onChange={set("description")} /></label>
            <div className="md:col-span-2"><button onClick={post} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Post to community</button></div>
          </div>
        </Panel>
      )}

      {isCrew && (
        <label className="my-4 flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I agree: if I secure a gig and don't show up or deliver, or I give less than 24 hours' notice, a penalty fee will be charged automatically from my bank account.</span>
        </label>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {open.length === 0 && <p className="text-muted-foreground">No open gigs right now.</p>}
        {open.map((g) => (
          <div key={g.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-foreground">{g.title}</h3>
              {isUrgent(g.event_date, g.call_time) && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">Urgent</span>}
            </div>
            <p className="text-sm text-muted-foreground">{g.role} · {g.department}</p>
            <p className="mt-2 text-sm">{g.event_date}{g.end_date ? ` – ${g.end_date}` : ""} · call {String(g.call_time).slice(0, 5)}</p>
            <p className="text-sm">{g.venue}, {g.country}</p>
            {g.kit_required && <p className="text-sm text-muted-foreground">Kit: {g.kit_required}</p>}
            <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{g.description}</p>
            <p className="mt-3 text-xl font-bold text-foreground">{rand(g.amount)} <span className="text-sm font-normal text-muted-foreground">{g.pay_type === "fixed" ? "fixed" : "per day"}</span></p>
            <p className="text-xs text-muted-foreground">Posted by {g.poster_name} · expires {new Date(g.expires_at).toLocaleString("en-ZA")}</p>
            {isCrew && <button onClick={() => secure(g)} className="mt-3 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Secure for {rand(g.secure_fee)}</button>}
          </div>
        ))}
      </div>

      {secured.length > 0 && (
        <div className="mt-8"><Panel title="Gigs I've secured">
          <div className="divide-y divide-border px-4">{secured.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex-1"><p className="font-semibold">{g.title}</p><p className="text-sm text-muted-foreground">{g.event_date} · {g.venue} · contact {g.contact_phone}</p></div>
              <button onClick={() => withdraw(g)} className="rounded-xl border border-border px-3 py-1.5 text-sm">Withdraw</button>
            </div>))}</div>
        </Panel></div>
      )}

      {mine.length > 0 && (
        <div className="mt-8"><Panel title="Gigs I've posted">
          <div className="divide-y divide-border px-4">{mine.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex-1"><p className="font-semibold">{g.title}</p><p className="text-sm text-muted-foreground">{g.event_date} · {g.status === "secured" ? `Secured by ${g.secured_name}` : g.status}{Number(g.penalty_amount) > 0 ? ` · penalty ${rand(g.penalty_amount)}` : ""}</p></div>
              {g.status === "secured" && <>
                <button onClick={() => act("complete_gig", g)} className="rounded-xl bg-primary px-3 py-1.5 text-sm text-primary-foreground">Mark done</button>
                <button onClick={() => act("report_gig_no_show", g)} className="rounded-xl border border-destructive px-3 py-1.5 text-sm text-destructive">Report no-show</button>
              </>}
            </div>))}</div>
        </Panel></div>
      )}
    </Page>
  );
}
