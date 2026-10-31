import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Award, Briefcase, Camera, Eye, EyeOff, Lock, Mail, MapPin, Package, Phone, Plus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CrewRateCard } from "@/components/CrewRateCard";
import { CrewEmergencySettings } from "@/components/CrewEmergencyDetails";
import { CrewPersonalChecklists } from "@/components/CrewPersonalChecklists";
import { Page, Panel } from "@/components/AppShell";
import { Avatar } from "@/components/site/SiteTabs";
import { useRole, useSession } from "@/lib/auth";
import { zar } from "@/lib/demo-data";
import { FRAMEWORKS, summarize, type FrameworkId, type Scores } from "@/lib/rating-frameworks";
import { uploadFile, useInvalidate, useOnTimePct, useReviews } from "@/lib/site";
import {
  useApproveJob, useCancelBooking, useClaimGig, useMarkJobCompleted, useMarkPaymentReceived, useNegotiations,
  useOpenGigs, useProposeRate, useReleasePayment, useRespondToBooking, useRespondToNegotiation,
  useProductions,
} from "@/lib/db";

export const Route = createFileRoute("/_authenticated/crew/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: string } => (typeof s["tab"] === "string" ? { tab: s["tab"] } : {}),
  head: () => ({
    meta: [
      { title: "Crew profile — Book a Crew" },
      { name: "description", content: "Service provider profile: skills, certifications, projects, kit and reviews." },
      { property: "og:title", content: "Crew profile — Book a Crew" },
      { property: "og:description", content: "Skills, certifications, kit and ratings." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CrewProfile,
});

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground";
const TABS = ["About", "Projects", "Portfolio", "Equipment", "Checklists", "Reviews", "Banking", "Emergency"] as const;

function CrewProfile() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const inv = useInvalidate();
  const { tab: tabParam } = Route.useSearch();
  const initialTab: (typeof TABS)[number] = tabParam === "kit" ? "Equipment" : "About";
  const [tab, setTab] = useState<(typeof TABS)[number]>(initialTab);
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  const [editing, setEditing] = useState(false);

  const c = useQuery({
    queryKey: ["crew-profile", id],
    queryFn: async () => { const { data, error } = await supabase.from("crew_members").select("*").eq("id", id).maybeSingle(); if (error) throw error; return data; },
  });
  const jobs = useQuery({
    queryKey: ["crew-jobs", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("id, role, status, days, crew_rate, booking_date, call_time, wrap_time, pencil_expires_at, cancelled_reason, payment_status, client_approved, production_id, productions(name, client, date, status)").eq("crew_id", id);
      if (error) throw error; return data ?? [];
    },
  });
  const assets = useQuery({
    queryKey: ["crew-assets", id],
    queryFn: async () => { const { data, error } = await supabase.from("crew_assets").select("*").eq("crew_id", id).order("name"); if (error) throw error; return data ?? []; },
  });
  const noShows = useQuery({ queryKey: ["crew-no-shows", id], queryFn: async () => { const { data, error } = await supabase.from("crew_no_shows").select("occurred_on,expires_at").eq("crew_id",id).gt("expires_at",new Date().toISOString()).order("occurred_on",{ascending:false}); if(error) throw error; return data ?? []; } });
  const composite = useQuery({queryKey:["crew-recommendation-score",id],queryFn:async()=>{const {data,error}=await supabase.from("crew_recommendation_scores" as any).select("*").eq("crew_id",id).maybeSingle();if(error)throw error;return data as {overall_score:number;review_rating:number;discounted_daily_rate:boolean;verified_wrap_count:number;avg_wrap_minutes:number|null;comparable_wrap_count:number}|null;}});
  const reviews = useReviews(id).data ?? [];
  const onTimePct = useOnTimePct(id);

  const m = c.data;
  if (!m) return <Page open title={c.isLoading ? "Loading…" : "Profile not found"}>{null}</Page>;
  const canEdit = role.data === "producer" || role.data === "admin" || m.user_id === session?.user.id;
  const isOwnProfile = m.user_id === session?.user.id;
  const done = (jobs.data ?? []).filter((j) => (j.productions as { status?: string } | null)?.status === "Wrapped").length;
  // Distinct productions this crew member has been booked on (excluding cancelled bookings) — a simple
  // popularity signal producers can see at a glance, separate from "Projects completed" (wrapped only).
  const productionsBooked = new Set((jobs.data ?? []).filter((j) => j.status !== "cancelled").map((j) => j.production_id)).size;
  const refresh = () => inv(["crew-profile", id], ["crew"], ["crew-assets", id], ["crew-assets"]);

  async function update(patch: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await supabase.from("crew_members").update(patch as any).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return false; }
    refresh(); return true;
  }
  async function photo(file?: File) {
    if (!file) return;
    try { const path = await uploadFile(`crew/${id}`, file, file.name); await update({ photo_url: path }); toast.success("Photo updated"); }
    catch (e) { toast.error(friendlyError(e)); }
  }

  return (
    <Page open title="Profile">
      <div className="mx-auto max-w-3xl rounded-sm border border-border bg-card">
        <div className="p-6">
          <div className="flex items-center gap-5">
            <div className="relative">
              <Avatar name={m.name} path={m.photo_url} size={88} />
              {canEdit && <label className="absolute bottom-0 right-0 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Change photo"><Camera className="h-3.5 w-3.5" /><input type="file" accept="image/*" hidden onChange={(e) => photo(e.target.files?.[0])} /></label>}
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold">{m.name}</h2>
              <div className="text-muted-foreground">{m.role} · {m.department}</div>
              <div className="mt-1 flex items-center gap-1 text-sm"><Star className="h-4 w-4 fill-primary text-primary" /> <strong>{Number(m.rating).toFixed(1)}</strong> <span className="text-muted-foreground">({reviews.length} reviews)</span><span className="ml-3 text-destructive font-semibold">No-shows: {noShows.data?.length ?? 0}</span></div>
              {composite.data && <div className="mt-2 rounded-md border border-border bg-muted/30 p-2 text-xs"><strong>Overall recommendation score: {Number(composite.data.overall_score).toFixed(2)} / 5</strong><div className="mt-1 text-muted-foreground">Reviews: {Number(composite.data.review_rating).toFixed(1)} / 5 · {composite.data.discounted_daily_rate?"★ Discounted daily rate":"Standard daily rate"} · Average verified wrap: {composite.data.avg_wrap_minutes==null?"Not yet available":Math.round(composite.data.avg_wrap_minutes)+" min"} ({composite.data.verified_wrap_count} recorded; {composite.data.comparable_wrap_count} comparable)</div><div className="text-muted-foreground">80% review rating · up to 10% daily-rate discount · up to 10% wrap efficiency. Wrap speed is compared only with the same crew role and equipment source. Fewer than 3 comparable wrap records receive a neutral score.</div></div>}
               {!!noShows.data?.length && <div className="mt-1 text-xs text-destructive">No-show date{noShows.data.length > 1 ? "s" : ""}: {noShows.data.map((n) => new Date(`${n.occurred_on}T12:00:00`).toLocaleDateString("en-ZA",{day:"numeric",month:"short",year:"numeric"})).join(", ")} · visible for six months</div>}
            </div>
            {canEdit && <button onClick={() => setEditing(!editing)} className="ml-auto text-xs text-primary hover:underline">{editing ? "Close" : "Edit profile"}</button>}
          </div>
          <CrewRateCard crewId={id} canEdit={isOwnProfile} />
          {editing ? <EditForm m={m} onSave={async (patch) => { if (await update(patch)) { toast.success("Profile saved"); setEditing(false); } }} /> : (
            <div className="mt-5 space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-3"><Mail className="h-4 w-4" /> {m.email || "No email"}</div>
              <div className="flex items-center gap-3"><Phone className="h-4 w-4" /> {m.phone || "No phone"}</div>
              <div className="flex items-center gap-3"><MapPin className="h-4 w-4" /> {m.location || "No location"}</div>
            </div>
          )}
        </div>

        <nav className="flex gap-1 overflow-x-auto border-y border-border px-4">
          {TABS.filter((t) => (t !== "Banking" && t !== "Checklists" && t !== "Emergency") || isOwnProfile).map((t) => <button key={t} onClick={() => setTab(t)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>{t}</button>)}
        </nav>

        <div className="p-6">
          {tab === "About" && (
            <div className="space-y-6">
              <section><h3 className="mb-2 flex items-center gap-2 font-semibold"><Award className="h-4 w-4" /> Skills & Expertise</h3>
                {m.skills.length ? <div className="flex flex-wrap gap-2">{m.skills.map((s) => <span key={s} className="rounded-sm bg-primary/15 px-2 py-1 text-xs text-primary">{s}</span>)}</div> : <p className="text-sm text-muted-foreground">No skills added yet</p>}
              </section>
              <section className="border-t border-border pt-5"><h3 className="mb-2 flex items-center gap-2 font-semibold"><Briefcase className="h-4 w-4" /> Experience</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{m.experience_notes || m.bio || "No experience added yet"}</p>
              </section>
              <section className="grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-5">
                {[[String(productionsBooked), "Productions booked"], [String(done), "Projects completed"], [String(m.team_led), "Team members led"], [`${m.safety_record}%`, "Safety record"], [onTimePct.data != null ? `${onTimePct.data}%` : "—", "On-time"]].map(([v, l]) => (
                  <div key={l}><div className="font-display text-3xl font-bold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
                ))}
              </section>
            </div>
          )}
          {tab === "Projects" && (
            <ul className="divide-y divide-border">
              {(jobs.data ?? []).length === 0 && <li className="py-3 text-sm text-muted-foreground">No projects yet.</li>}
              {(jobs.data ?? []).map((j) => (
                <ProjectRow key={j.id} job={j} userId={session?.user.id} canRespond={canEdit && m.user_id === session?.user.id} isProducer={role.data === "producer"} onChange={() => { jobs.refetch(); }} />
              ))}
            </ul>
          )}
          {tab === "Portfolio" && (
            m.portfolio_url || m.youtube_url || m.vimeo_url || m.instagram_url ? (
              <div className="flex flex-wrap gap-3 text-sm">
                {m.portfolio_url && <a href={m.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Portfolio / showreel</a>}
                {m.youtube_url && <a href={m.youtube_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">YouTube</a>}
                {m.vimeo_url && <a href={m.vimeo_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Vimeo</a>}
                {m.instagram_url && <a href={m.instagram_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Instagram</a>}
              </div>
            ) : <p className="text-sm text-muted-foreground">No portfolio links added yet.</p>
          )}
          {tab === "Equipment" && <Kit crewId={id} items={assets.data ?? []} canEdit={canEdit} onChange={refresh} />}
          {tab === "Checklists" && isOwnProfile && <CrewPersonalChecklists crewId={id} />}
          {tab === "Reviews" && <ReviewsTab crewId={id} />}
          {tab === "Banking" && isOwnProfile && <BankingTab crewId={id} />}
          {tab === "Emergency" && isOwnProfile && <CrewEmergencySettings crewId={id} />}
        </div>
      </div>
    </Page>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pencil: "Confirmed", awaiting_crew_confirmation: "Pending", confirmed: "Confirmed",
  in_progress: "In progress", awaiting_review: "Awaiting review", payment_released: "Payment released",
  completed: "Completed", cancelled: "Cancelled", disputed: "Disputed",
};

const PAYMENT_LABEL: Record<string, string> = {
  not_required: "", payment_required: "Awaiting client payment", payment_received: "Payment received",
  funds_held: "Funds held in escrow", awaiting_release: "Awaiting producer release", release_authorised: "Release authorised",
  payment_released: "Payment released", payment_failed: "Payment failed", payment_disputed: "Payment disputed",
};

type Job = {
  id: string; role: string; status: string; days: number; crew_rate: number;
  booking_date: string | null; call_time: string | null; wrap_time: string | null; pencil_expires_at: string | null; cancelled_reason: string | null;
  payment_status: string; client_approved: boolean | null;
  production_id: string; productions: { name: string; client: string; date: string | null; status: string } | null;
};

function ProjectRow({ job: j, userId, canRespond, isProducer, onChange }: { job: Job; userId?: string | undefined; canRespond: boolean; isProducer: boolean; onChange: () => void }) {
  const pr = j.productions;
  const respond = useRespondToBooking();
  const markCompleted = useMarkJobCompleted();
  const markPaid = useMarkPaymentReceived();
  const approve = useApproveJob();
  const release = useReleasePayment();
  const cancelBooking = useCancelBooking();
  const [negOpen, setNegOpen] = useState(false);
  const negotiations = useNegotiations(j.id, negOpen);
  const propose = useProposeRate();
  const respondNeg = useRespondToNegotiation();
  const [proposedRate, setProposedRate] = useState(String(j.crew_rate));
  const canAct = canRespond || isProducer;
  const pending = j.status === "pencil" || j.status === "awaiting_crew_confirmation";
  const onJob = j.status === "confirmed" || j.status === "in_progress";

  async function completeJob() {
    try { await markCompleted.mutateAsync(j.id); toast.success("Marked as completed — client has 24 hours to review"); onChange(); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function recordPayment() {
    try { await markPaid.mutateAsync(j.id); toast.success("Payment recorded — funds held"); onChange(); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function approveOnClientBehalf() {
    try { await approve.mutateAsync(j.id); toast.success("Job approved — ready to release payment"); onChange(); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function releaseFunds() {
    try { const invId = await release.mutateAsync(j.id); toast.success(`Payment released, invoice generated (${invId})`); onChange(); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function doCancelBooking() {
    const reason = window.prompt("Reason for cancelling this booking?");
    if (!reason) return;
    try { await cancelBooking.mutateAsync({ bookingId: j.id, reason }); toast.success("Booking cancelled"); onChange(); }
    catch (e) { toast.error(friendlyError(e)); }
  }


  async function accept() {
    try { await respond.mutateAsync({ id: j.id, status: "confirmed" }); toast.success("Booking confirmed"); onChange(); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function decline() {
    try { await respond.mutateAsync({ id: j.id, status: "cancelled", reason: "Declined by crew" }); toast.success("Booking declined"); onChange(); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function sendProposal() {
    const rate = Number(proposedRate);
    if (!rate || rate <= 0) return;
    try { await propose.mutateAsync({ bookingId: j.id, proposedRate: rate }); toast.success("Rate proposal sent"); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  async function respondProposal(id: string, status: "accepted" | "declined") {
    try { await respondNeg.mutateAsync({ id, bookingId: j.id, status }); toast.success(status === "accepted" ? "Rate accepted" : "Rate declined"); onChange(); }
    catch (e) { toast.error(friendlyError(e)); }
  }

  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/productions/$id" params={{ id: j.production_id }} className="font-semibold hover:text-primary">{pr?.name}</Link>
          <div className="text-xs text-muted-foreground">{j.role} · {pr?.client} · {j.booking_date ?? pr?.date}{j.call_time ? ` · call ${j.call_time}` : ""} · {zar(j.crew_rate)}/day</div>
          {j.status === "cancelled" && j.cancelled_reason && <div className="text-xs text-destructive">{j.cancelled_reason}</div>}
          {j.status === "pencil" && j.pencil_expires_at && <div className="text-xs text-muted-foreground">Expires {new Date(j.pencil_expires_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</div>}
        </div>
        <div className="text-right">
          <span className="text-xs text-muted-foreground">{STATUS_LABEL[j.status] ?? j.status}</span>
          {j.payment_status !== "not_required" && PAYMENT_LABEL[j.payment_status] && (
            <div className="text-xs text-muted-foreground">{PAYMENT_LABEL[j.payment_status]}</div>
          )}
        </div>
      </div>
      {canRespond && onJob && (
        <button onClick={completeJob} className="mt-2 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Mark job completed</button>
      )}
      {isProducer && j.status === "confirmed" && j.payment_status === "payment_required" && (
        <button onClick={recordPayment} className="mt-2 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Record payment received</button>
      )}
      {isProducer && j.status === "awaiting_review" && j.client_approved == null && (
        <button onClick={approveOnClientBehalf} className="mt-2 rounded-sm border border-primary px-3 py-1.5 text-xs font-semibold text-primary">Approve job (on client's behalf)</button>
      )}
      {isProducer && (j.payment_status === "awaiting_release" || j.payment_status === "release_authorised") && (
        <button onClick={releaseFunds} className="mt-2 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Release payment</button>
      )}
      {isProducer && ["pencil", "awaiting_crew_confirmation", "confirmed"].includes(j.status) && (
        <button onClick={doCancelBooking} className="mt-2 ml-2 text-xs text-destructive hover:underline">Cancel booking</button>
      )}
      {canRespond && pending && (
        <div className="mt-2 flex gap-2">
          <button onClick={accept} className="rounded-sm bg-success px-3 py-1.5 text-xs font-semibold text-white">Accept</button>
          <button onClick={decline} className="rounded-sm bg-[#DC143C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#DC143C]/90">Decline</button>
          <button onClick={() => setNegOpen(!negOpen)} className="ml-auto text-xs text-primary hover:underline">{negOpen ? "Hide rate negotiation" : "Negotiate rate"}</button>
        </div>
      )}
      {canAct && pending && !canRespond && (
        <button onClick={() => setNegOpen(!negOpen)} className="mt-2 text-xs text-primary hover:underline">{negOpen ? "Hide rate negotiation" : "Negotiate rate"}</button>
      )}
      {negOpen && (
        <div className="mt-2 space-y-2 rounded-sm border border-border bg-muted/30 p-3">
          {(negotiations.data ?? []).map((n) => (
            <div key={n.id} className="flex items-center justify-between text-xs">
              <span>{n.proposed_by === userId ? "You" : "They"} proposed {zar(n.proposed_rate)} — <span className="uppercase">{n.status}</span></span>
              {n.status === "pending" && n.proposed_by !== userId && (
                <div className="flex gap-2">
                  <button onClick={() => respondProposal(n.id, "accepted")} className="text-primary hover:underline">Accept</button>
                  <button onClick={() => respondProposal(n.id, "declined")} className="font-semibold text-destructive hover:underline">Decline</button>
                </div>
              )}
            </div>
          ))}
          {pending && (
            <div className="flex items-center gap-2">
              <input type="number" className="w-28 rounded-sm border border-input bg-background px-2 py-1 text-xs" value={proposedRate} onChange={(e) => setProposedRate(e.target.value)} />
              <button onClick={sendProposal} className="rounded-sm bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">Propose</button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function EditForm({ m, onSave }: { m: { name: string; role: string; department: string; email: string; phone: string; location: string; bio: string; skills: string[]; experience_notes: string; team_led: number; safety_record: number; portfolio_url?: string | null; youtube_url?: string | null; vimeo_url?: string | null; instagram_url?: string | null }; onSave: (p: Record<string, unknown>) => void }) {
  const [f, setF] = useState({
    ...m, skills: m.skills.join(", "),
    portfolio_url: m.portfolio_url ?? "", youtube_url: m.youtube_url ?? "", vimeo_url: m.vimeo_url ?? "", instagram_url: m.instagram_url ?? "",
  });
  const field = (k: keyof typeof f, label: string, type = "text") => (
    <label className="block"><span className="text-xs text-muted-foreground">{label}</span>
      <input type={type} className={`${input} mt-1 w-full`} value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {field("name", "Name")}{field("role", "Role")}{field("department", "Department")}{field("location", "Location")}
      {field("email", "Email", "email")}{field("phone", "Phone", "tel")}
      <div className="sm:col-span-2">{field("skills", "Skills (comma separated)")}</div>
      <label className="block sm:col-span-2"><span className="text-xs text-muted-foreground">Experience</span>
        <textarea rows={4} className={`${input} mt-1 w-full`} value={f.experience_notes} onChange={(e) => setF({ ...f, experience_notes: e.target.value })} /></label>
      {field("team_led", "Team members led", "number")}{field("safety_record", "Safety record %", "number")}
      {field("portfolio_url", "Portfolio / showreel URL", "url")}{field("youtube_url", "YouTube URL", "url")}
      {field("vimeo_url", "Vimeo URL", "url")}{field("instagram_url", "Instagram URL", "url")}
      <div className="sm:col-span-2"><button className={btn} onClick={() => onSave({
        name: f.name, role: f.role, department: f.department, location: f.location, email: f.email, phone: f.phone,
        experience_notes: f.experience_notes, team_led: Number(f.team_led) || 0, safety_record: Math.min(100, Math.max(0, Number(f.safety_record) || 0)),
        skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
        portfolio_url: f.portfolio_url || null, youtube_url: f.youtube_url || null, vimeo_url: f.vimeo_url || null, instagram_url: f.instagram_url || null,
      })}>Save profile</button></div>
    </div>
  );
}

type BankingDetails = {
  accountHolderName: string; bankName: string; bankCountry: string; bankAddress: string;
  accountNumber: string; iban: string; swiftBic: string; routingOrSortCode: string; currency: string; notes: string;
};
const blankBanking: BankingDetails = {
  accountHolderName: "", bankName: "", bankCountry: "", bankAddress: "",
  accountNumber: "", iban: "", swiftBic: "", routingOrSortCode: "", currency: "", notes: "",
};

// Banking details are encrypted at rest (pgcrypto, server-side key in Supabase Vault) and only ever
// reach the client through SECURITY DEFINER RPCs that check the caller is this crew member or a
// producer/admin.

function BankingTab({ crewId }: { crewId: string }) {
  const { session } = useSession();
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [f, setF] = useState<BankingDetails>(blankBanking);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  async function load() {
    setChecking(true);
    try {
      const { data, error: rpcError } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: BankRow[] | null; error: Error | null }>)("get_banking_details", { _crew_id: crewId });
      if (rpcError) throw rpcError;
      const row = data?.[0];
      if (row) {
        setF({
          accountHolderName: row.account_holder_name ?? "", bankName: row.bank_name ?? "", bankCountry: row.bank_country ?? "",
          bankAddress: row.bank_address ?? "", accountNumber: row.account_number ?? "", iban: row.iban ?? "",
          swiftBic: row.swift_bic ?? "", routingOrSortCode: row.routing_or_sort_code ?? "", currency: row.currency ?? "", notes: row.notes ?? "",
        });
        setUpdatedAt(row.updated_at ?? null);
      }
      setUnlocked(true);
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setChecking(false); }
  }

  async function save() {
    if (!f.swiftBic.trim()) { toast.error("SWIFT/BIC is required for an international transfer"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ error: Error | null }>)("upsert_banking_details", {
        _crew_id: crewId, _account_holder_name: f.accountHolderName, _bank_name: f.bankName, _bank_country: f.bankCountry,
        _bank_address: f.bankAddress, _account_number: f.accountNumber, _iban: f.iban, _swift_bic: f.swiftBic,
        _routing_or_sort_code: f.routingOrSortCode, _currency: f.currency, _notes: f.notes,
      });
      if (error) throw error;
      toast.success("Banking details saved — encrypted at rest");
      setEditing(false);
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setSaving(false); }
  }

  const mask = (v: string) => (v ? `•••• ${v.slice(-4)}` : "—");

  useEffect(() => { void load(); }, [crewId]);

  if (!unlocked) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{checking ? "Loading banking details…" : "Banking details couldn't be loaded."}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Encrypted at rest · only you and producers can view this</p>
        {!editing && <button onClick={() => setEditing(true)} className="text-xs font-semibold text-primary hover:underline">Edit</button>}
      </div>
      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-xs text-muted-foreground">Account holder name *</span>
            <input className={`${input} mt-1 w-full`} value={f.accountHolderName} onChange={(e) => setF({ ...f, accountHolderName: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Bank name</span>
            <input className={`${input} mt-1 w-full`} value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Bank country</span>
            <input className={`${input} mt-1 w-full`} value={f.bankCountry} onChange={(e) => setF({ ...f, bankCountry: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Currency</span>
            <input className={`${input} mt-1 w-full`} placeholder="e.g. USD, EUR, GBP" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="text-xs text-muted-foreground">Bank address</span>
            <input className={`${input} mt-1 w-full`} value={f.bankAddress} onChange={(e) => setF({ ...f, bankAddress: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Account number</span>
            <input className={`${input} mt-1 w-full`} value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">IBAN (if applicable)</span>
            <input className={`${input} mt-1 w-full`} value={f.iban} onChange={(e) => setF({ ...f, iban: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">SWIFT / BIC *</span>
            <input className={`${input} mt-1 w-full`} value={f.swiftBic} onChange={(e) => setF({ ...f, swiftBic: e.target.value.toUpperCase() })} /></label>
          <label className="block"><span className="text-xs text-muted-foreground">Routing / sort / branch code</span>
            <input className={`${input} mt-1 w-full`} value={f.routingOrSortCode} onChange={(e) => setF({ ...f, routingOrSortCode: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="text-xs text-muted-foreground">Notes for the person paying you (optional)</span>
            <textarea rows={2} className={`${input} mt-1 w-full`} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={saving} onClick={save} className={`${btn} disabled:opacity-60`}>{saving ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(false)} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><div className="text-xs text-muted-foreground">Account holder</div><div className="font-medium">{f.accountHolderName || "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Bank</div><div className="font-medium">{f.bankName || "—"} {f.bankCountry && `· ${f.bankCountry}`}</div></div>
          <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">Bank address</div><div className="font-medium">{f.bankAddress || "—"}</div></div>
          <div>
            <div className="text-xs text-muted-foreground">Account number</div>
            <div className="flex items-center gap-2 font-medium">
              {reveal ? (f.accountNumber || "—") : mask(f.accountNumber)}
              {f.accountNumber && <button onClick={() => setReveal(!reveal)} aria-label={reveal ? "Hide" : "Show"}>{reveal ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}</button>}
            </div>
          </div>
          <div><div className="text-xs text-muted-foreground">IBAN</div><div className="font-medium">{reveal ? (f.iban || "—") : mask(f.iban)}</div></div>
          <div><div className="text-xs text-muted-foreground">SWIFT / BIC</div><div className="font-medium">{f.swiftBic || "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Routing / sort / branch code</div><div className="font-medium">{f.routingOrSortCode || "—"}</div></div>
          <div><div className="text-xs text-muted-foreground">Currency</div><div className="font-medium">{f.currency || "—"}</div></div>
          {f.notes && <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">Notes</div><div className="font-medium">{f.notes}</div></div>}
          {updatedAt && <div className="text-xs text-muted-foreground sm:col-span-2">Last updated {new Date(updatedAt).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</div>}
        </div>
      )}
    </div>
  );
}

function Kit({ crewId, items, canEdit, onChange }: { crewId: string; items: { id: string; name: string; category: string; daily_fee: number }[]; canEdit: boolean; onChange: () => void }) {
  const [n, setN] = useState({ name: "", category: "Equipment", fee: "" });
  async function add() {
    if (!n.name.trim()) return;
    const { error } = await supabase.from("crew_assets").insert({ crew_id: crewId, name: n.name.trim(), category: n.category, daily_fee: Number(n.fee) || 0 });
    if (error) { toast.error(friendlyError(error)); return; }
    setN({ name: "", category: "Equipment", fee: "" }); onChange();
  }
  async function remove(id: string) { const { error } = await supabase.from("crew_assets").delete().eq("id", id); if (error) toast.error(friendlyError(error)); onChange(); }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Equipment and props this provider can bring. Dial a Crew selects items per job and the fees are added to the provider's total.</p>
      {items.length === 0 && <p className="text-sm text-muted-foreground">No equipment or props captured yet.</p>}
      {items.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-sm border border-border p-3">
          <Package className="h-4 w-4 text-primary" /><span className="flex-1 text-sm">{a.name} <span className="text-xs text-muted-foreground">· {a.category}</span></span>
          <span className="text-sm">{zar(Number(a.daily_fee))}/day</span>
          {canEdit && <button aria-label="Remove" onClick={() => remove(a.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <input className={`${input} flex-1`} placeholder="Item (e.g. ARRI Alexa Mini)" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
          <select className={input} value={n.category} onChange={(e) => setN({ ...n, category: e.target.value })}>{["Equipment", "Prop", "Vehicle", "Lighting", "Sound", "Wardrobe"].map((c) => <option key={c}>{c}</option>)}</select>
          <input type="number" className={`${input} w-32`} placeholder="Fee / day (R)" value={n.fee} onChange={(e) => setN({ ...n, fee: e.target.value })} />
          <button className={btn} onClick={add}>Add</button>
        </div>
      )}
    </div>
  );
}

type BankRow = {
  account_holder_name: string | null; bank_name: string | null; bank_country: string | null; bank_address: string | null;
  account_number: string | null; iban: string | null; swift_bic: string | null; routing_or_sort_code: string | null;
  currency: string | null; notes: string | null; updated_at: string | null;
};

function ReviewsTab({ crewId }: { crewId: string }) {
  const reviews = useReviews(crewId).data ?? [];
  const productions = useProductions().data ?? [];
  const onTime = useOnTimePct(crewId).data;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;
  const prodName = (id: string | null) => (id ? productions.find((p) => p.id === id)?.name ?? "Production" : "Production");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-border bg-border">
        {[[avg ? avg.toFixed(1) : "—", "Average rating"], [String(reviews.length), "Reviews"], [onTime != null ? `${onTime}%` : "—", "On-time"]].map(([v, l]) => (
          <div key={l} className="bg-card p-3"><div className="font-display text-2xl font-bold">{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
        ))}
      </div>
      <Panel title="All reviews">
        <ul className="divide-y divide-border">
          {reviews.length === 0 && <li className="p-4 text-sm text-muted-foreground">No reviews yet. People on their jobs can rate them from the Members list.</li>}
          {reviews.map((r) => (
            <li key={r.id} className="p-4">
              {/* Shows the star rating, the production and when — never the comment or who left it. */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= r.rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}
                <span className="ml-2 text-sm font-medium">{prodName(r.production_id)}</span>
              </div>
              {r.framework && FRAMEWORKS[r.framework as FrameworkId] && (() => {
                const sm = summarize(r.framework as FrameworkId, (r.scores ?? {}) as Scores);
                return (
                  <div className="mt-2 space-y-1 text-xs">
                    <p className="font-semibold text-foreground">{FRAMEWORKS[r.framework as FrameworkId].name} · Overall {sm.overall != null ? `${sm.overall}/5` : "Not rated"}{r.work_again ? ` · Would work again: ${r.work_again[0]!.toUpperCase()}${r.work_again.slice(1)}` : ""}</p>
                    <div className="grid gap-x-3 sm:grid-cols-2">
                      {sm.categories.map((c) => <span key={c.name} className="text-muted-foreground">{c.name}: <span className="text-foreground">{c.score != null ? `${c.score}/5` : "Not rated"}</span></span>)}
                    </div>
                  </div>
                );
              })()}
              <div className="mt-0.5 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}</div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
