import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { useOpenGigs, type OpenGig } from "@/lib/db";
import { useCountries } from "@/lib/use-countries";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GigNegotiation } from "@/components/GigNegotiation";
import { JobTermsDialog } from "@/components/JobTermsDialog";
import { zar } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground";

/** Country of a gig = last comma-separated part of its address (or location). */
export const gigCountry = (g: { address: string; location: string }) => ((g.address || g.location || "").split(",").pop() ?? "").trim();

export function FindGigsTab({ canClaim, canManage = false }: { canClaim: boolean; canManage?: boolean }) {
  const gigs = useOpenGigs();
  const qc = useQueryClient();
  const [pendingGig, setPendingGig] = useState<OpenGig | null>(null);
  const [reviewGig, setReviewGig] = useState<OpenGig | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [q, setQ] = useState("");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState("100");
  const [country, setCountry] = useState("");
  const [department, setDepartment] = useState("");
  const configuredCountries = useCountries();
  const roleDepartments = useQuery({ queryKey: ["gig-role-departments"], queryFn: async () => { const { data, error } = await supabase.from("crew_members").select("role, department"); if (error) throw error; return data ?? []; } });
  const departmentNames = [...new Set((roleDepartments.data ?? []).map(r => r.department).filter(Boolean))].sort();
  const roleKey = (value: string) => value.trim().toLowerCase().replace(/s$/, "");

  async function useMyLocation() {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true }));
      setNear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      toast.success("Filtering by your current location");
    } catch { toast.error("Could not get your location"); }
  }

  function distanceKm(lat: number, lng: number) {
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat - near!.lat), dLng = toRad(lng - near!.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(near!.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }

  const countries = [...new Set([...configuredCountries.map(c => c.name), ...(gigs.data ?? []).map(gigCountry).filter(Boolean)])].sort();
  const list = (gigs.data ?? []).filter((g) => {
    const text = `${g.production_name} ${g.role} ${g.location} ${g.address}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (country && gigCountry(g) !== country) return false;
    if (department && !(roleDepartments.data ?? []).some(r => roleKey(r.role) === roleKey(g.role) && r.department === department)) return false;
    if (near && g.latitude != null && g.longitude != null) {
      const d = distanceKm(g.latitude, g.longitude);
      if (d > (Number(radiusKm) || 100)) return false;
    }
    return true;
  });

  async function grab() {
    if (!pendingGig || claimBusy) return;
    setClaimBusy(true);
    const { error } = await supabase.rpc("claim_gig_with_terms", { p_booking_id: pendingGig.id, p_terms_version: "dialacrew-terms-2026-10" });
    setClaimBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Terms accepted — you're confirmed for ${pendingGig.role}`);
    setPendingGig(null);
    void qc.invalidateQueries({ queryKey: ["open-gigs"] });
    void qc.invalidateQueries({ queryKey: ["bookings"] });
  }

  return (
    <div className="space-y-4">
      {pendingGig && <JobTermsDialog jobName={pendingGig.production_name} role={pendingGig.role} busy={claimBusy} onClose={() => setPendingGig(null)} onAccept={grab} />}
      {reviewGig && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="gig-rate-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl">
          <h2 id="gig-rate-title" className="text-xl font-bold">Review rate & accept gig</h2>
          <p className="mt-2 text-sm">{reviewGig.role} · {reviewGig.production_name} · {reviewGig.booking_date || "Date TBC"}</p>
          <p className="mt-2 text-sm text-muted-foreground">Accept the advertised rate and review the job terms, or send a counter-offer. A counter-offer does not reserve the gig. Once a rate is agreed, accept the reserved booking’s terms from Home.</p>
          <GigNegotiation bookingId={reviewGig.id} role="crew" offeredRate={Number(reviewGig.crew_rate)} productionId={reviewGig.production_id} onBusyChange={setClaimBusy} onReserved={() => setReviewGig(null)} />
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button disabled={claimBusy} onClick={() => setReviewGig(null)} className="rounded border border-border px-3 py-2 text-sm">Close</button>
            <button disabled={claimBusy} onClick={() => { setPendingGig(reviewGig); setReviewGig(null); }} className="rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">Accept {zar(reviewGig.crew_rate)}/day & review terms</button>
          </div>
        </section>
      </div>}
      <p className="text-sm text-muted-foreground">Open gigs aren't assigned to anyone specific yet — first to grab it gets it. Available anywhere in the world; filter by location below.</p>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search role, production, city, country…" className={`${input} min-w-56 flex-1`} />
        <select aria-label="Department" value={department} onChange={e => setDepartment(e.target.value)} className={input}><option value="">All departments</option>{departmentNames.map(d => <option key={d}>{d}</option>)}</select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={input} aria-label="Country">
          <option value="">All countries</option>
          {countries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input type="number" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} className={`${input} w-28`} placeholder="Radius (km)" disabled={!near} />
        <button onClick={useMyLocation} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold hover:border-primary">
          {near ? "Near me ✓" : "Filter near me"}
        </button>
        {near && <button onClick={() => setNear(null)} className="text-xs text-muted-foreground hover:underline">Clear location filter</button>}
      </div>
      {gigs.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {gigs.isError && <p role="alert" className="text-sm text-destructive">Could not load open gigs. <button onClick={() => void gigs.refetch()} className="underline">Try again</button></p>}
      {!gigs.isLoading && !gigs.isError && list.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No open gigs match these filters right now.</p>}
      <ul className="divide-y divide-border">
        {list.map((g) => (
          <li key={g.id} className="flex items-center justify-between py-3">
            <div>
              <div className="font-semibold">{g.role} <span className="font-normal text-muted-foreground">· {g.production_name}</span></div>
              <div className="text-xs text-muted-foreground">
                {g.address || g.location || "Location TBC"}{near && g.latitude != null && g.longitude != null ? ` · ${distanceKm(g.latitude, g.longitude)}km away` : ""}
                {g.booking_date ? ` · ${g.booking_date}` : ""}{g.call_time ? ` · call ${g.call_time}` : ""} · {zar(g.crew_rate)}/day
              </div>
              {canManage && <GigNegotiation bookingId={g.id} role="producer" offeredRate={Number(g.crew_rate)} productionId={g.production_id} />}
            </div>
            {canClaim && <button onClick={() => setReviewGig(g)} disabled={claimBusy} className={`${btn} disabled:opacity-60`}>Grab it</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

