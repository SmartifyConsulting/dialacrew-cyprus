import { useState } from "react";
import { toast } from "sonner";
import { useClaimGig, useOpenGigs } from "@/lib/db";
import { zar } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground";

/** Country of a gig = last comma-separated part of its address (or location). */
export const gigCountry = (g: { address: string; location: string }) => ((g.address || g.location || "").split(",").pop() ?? "").trim();

export function FindGigsTab({ canClaim }: { canClaim: boolean }) {
  const gigs = useOpenGigs();
  const claim = useClaimGig();
  const [q, setQ] = useState("");
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState("100");
  const [country, setCountry] = useState("");

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

  const countries = [...new Set((gigs.data ?? []).map(gigCountry).filter(Boolean))].sort();
  const list = (gigs.data ?? []).filter((g) => {
    const text = `${g.production_name} ${g.role} ${g.location} ${g.address}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (country && gigCountry(g) !== country) return false;
    if (near && g.latitude != null && g.longitude != null) {
      const d = distanceKm(g.latitude, g.longitude);
      if (d > (Number(radiusKm) || 100)) return false;
    }
    return true;
  });

  async function grab(id: string, role: string) {
    try { await claim.mutateAsync(id); toast.success(`Grabbed — you're confirmed for ${role}`); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Open gigs aren't assigned to anyone specific yet — first to grab it gets it. Available anywhere in the world; filter by location below.</p>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search role, production, city, country…" className={`${input} min-w-56 flex-1`} />
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
      {!gigs.isLoading && list.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No open gigs match these filters right now.</p>}
      <ul className="divide-y divide-border">
        {list.map((g) => (
          <li key={g.id} className="flex items-center justify-between py-3">
            <div>
              <div className="font-semibold">{g.role} <span className="font-normal text-muted-foreground">· {g.production_name}</span></div>
              <div className="text-xs text-muted-foreground">
                {g.address || g.location || "Location TBC"}{near && g.latitude != null && g.longitude != null ? ` · ${distanceKm(g.latitude, g.longitude)}km away` : ""}
                {g.booking_date ? ` · ${g.booking_date}` : ""}{g.call_time ? ` · call ${g.call_time}` : ""} · {zar(g.crew_rate)}/day
              </div>
            </div>
            {canClaim && <button onClick={() => grab(g.id, g.role)} disabled={claim.isPending} className={`${btn} disabled:opacity-60`}>Grab it</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

