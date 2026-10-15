import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { CheckCircle2, Circle, Download, FileText, LogIn, LogOut, MapPin, Mic, Paperclip, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Panel } from "@/components/AppShell";
import { AudioRecorder } from "@/components/AudioRecorder";
import { zar, type Booking, type Production } from "@/lib/demo-data";
import { assetsTotal, providerTotal } from "@/lib/costing";
import { distanceMeters, getPosition, isOnSite } from "@/lib/geo";
import { isOnline, pendingCount, queueCheckin, syncQueue } from "@/lib/offline-checkin";
import {
  signedUrl, uploadFile, useBookingAssets, useCrewAssets, useDocs, useInvalidate, useLocationPoints, useMessages, usePosts, useRegister,
  useReviews, useSignedUrl, useSiteMembers, useTasks,
} from "@/lib/site";
import { useCreateOpenGig, useRequests, useSetRequestState } from "@/lib/db";

function OvertimeApprovals({ production }: { production: string }) {
  const reqs = (useRequests().data ?? []).filter((r) => r.kind === "Overtime" && r.production === production && r.state === "Pending");
  const setState = useSetRequestState();
  if (reqs.length === 0) return null;
  return (
    <Panel title={`Overtime to approve (${reqs.length})`}>
      <ul className="divide-y divide-border text-sm">
        {reqs.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1"><div className="font-semibold">{r.who}</div><div className="text-xs text-muted-foreground">{r.detail}</div></div>
            <span className="font-semibold">{zar(r.amount)}</span>
            <button onClick={() => setState.mutate({ id: r.id, state: "Approved" })} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">Approve</button>
            <button onClick={() => setState.mutate({ id: r.id, state: "Declined" })} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold">Decline</button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

type Ctx = { p: Production; isProducer: boolean; userId: string; myName: string; myCrewId: string | null };
const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
const initials = (n: string) => n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();

type AddressSuggestion = { label: string; lat: string; lon: string };

// Debounced address lookup against OpenStreetMap's free Nominatim search — no API key needed.
// Falls back to a plain text input (with no suggestions) if the request fails.
export function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: {
  value: string; onChange: (v: string) => void; onSelect: (s: AddressSuggestion) => void; placeholder?: string; className?: string;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || value.trim().length < 3) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { display_name: string; lat: string; lon: string }[];
        setSuggestions(data.map((d) => ({ label: d.display_name, lat: d.lat, lon: d.lon })));
      } catch { setSuggestions([]); }
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [value, open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <input
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && (loading || suggestions.length > 0) && (
        <div className="absolute z-20 mt-1 w-full rounded-sm border border-border bg-card shadow-md">
          {loading && <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>}
          {!loading && suggestions.map((s, i) => (
            <button key={i} type="button" onClick={() => { onSelect(s); setOpen(false); setSuggestions([]); }}
              className="block w-full px-3 py-2 text-left text-xs hover:bg-muted">
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FileLink({ path, name }: { path: string; name: string }) {
  return (
    <button onClick={async () => { try { window.open(await signedUrl(path), "_blank", "noopener"); } catch { toast.error("Could not open file"); } }}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-xs hover:border-primary hover:text-primary">
      <Paperclip className="h-3 w-3" /> {name}
    </button>
  );
}

/* ---------------- Location points (multi-stop schedule) — lives inside Site information ---------------- */
const blankLocationForm = { label: "", address: "", latitude: "", longitude: "", startsAt: "", endsAt: "" };
const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

function LocationPoints({ p, isProducer }: Pick<Ctx, "p" | "isProducer">) {
  const inv = useInvalidate();
  const points = useLocationPoints(p.id).data ?? [];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lf, setLf] = useState(blankLocationForm);

  function startAdd() { setLf(blankLocationForm); setEditingId(null); setAdding(true); }
  function startEdit(pt: { id: string; label: string; address: string; latitude: number | null; longitude: number | null; starts_at: string | null; ends_at: string | null }) {
    setLf({
      label: pt.label, address: pt.address ?? "", latitude: pt.latitude?.toString() ?? "", longitude: pt.longitude?.toString() ?? "",
      startsAt: toLocalInput(pt.starts_at), endsAt: toLocalInput(pt.ends_at),
    });
    setEditingId(pt.id);
    setAdding(true);
  }
  function cancelForm() { setAdding(false); setEditingId(null); setLf(blankLocationForm); }

  async function savePoint() {
    if (!lf.label.trim()) { toast.error("Give this location a name"); return; }
    setBusy(true);
    const payload = {
      label: lf.label.trim(), address: lf.address.trim(),
      latitude: lf.latitude ? Number(lf.latitude) : null, longitude: lf.longitude ? Number(lf.longitude) : null,
      starts_at: lf.startsAt ? new Date(lf.startsAt).toISOString() : null,
      ends_at: lf.endsAt ? new Date(lf.endsAt).toISOString() : null,
    };
    const { error } = editingId
      ? await supabase.from("production_locations").update(payload).eq("id", editingId)
      : await supabase.from("production_locations").insert({ production_id: p.id, ...payload });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(editingId ? "Location point updated" : "Location point added");
    cancelForm();
    inv(["location-points", p.id]);
  }

  async function removePoint(id: string) {
    const { error } = await supabase.from("production_locations").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    if (id === editingId) cancelForm();
    inv(["location-points", p.id]);
  }

  if (!isProducer && points.length === 0) return null;

  return (
    <div className="border-t border-border">
      <div className="flex items-center justify-between px-4 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location points</h3>
        {isProducer && !adding && (
          <button onClick={startAdd} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add location point</button>
        )}
      </div>
      <ul className="divide-y divide-border text-sm">
        {points.length === 0 && <li className="p-4 text-muted-foreground">No location points yet.</li>}
        {points.map((pt) => (
          <li key={pt.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-medium"><MapPin className="h-3.5 w-3.5 text-primary" /> {pt.label}</div>
              {pt.address && <div className="text-xs text-muted-foreground">{pt.address}</div>}
              <div className="text-xs text-muted-foreground">
                {pt.starts_at ? when(pt.starts_at) : "Start TBC"}{pt.ends_at ? ` → ${when(pt.ends_at)}` : ""}
              </div>
            </div>
            {isProducer && (
              <div className="flex shrink-0 items-center gap-2">
                <button onClick={() => startEdit(pt)} className="text-muted-foreground hover:text-primary" aria-label={`Edit ${pt.label}`}><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => removePoint(pt.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${pt.label}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isProducer && adding && (
        <div className="space-y-2 border-t border-border p-4">
          <input className={`${input} w-full`} placeholder="Location name *" value={lf.label} onChange={(e) => setLf({ ...lf, label: e.target.value })} />
          <AddressAutocomplete className={`${input} w-full`} placeholder="Address — start typing to search" value={lf.address}
            onChange={(v) => setLf({ ...lf, address: v })}
            onSelect={(s) => setLf({ ...lf, address: s.label, latitude: s.lat, longitude: s.lon })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block"><span className="text-xs text-muted-foreground">Starts</span>
              <input type="datetime-local" className={`${input} mt-1 w-full`} value={lf.startsAt} onChange={(e) => setLf({ ...lf, startsAt: e.target.value })} /></label>
            <label className="block"><span className="text-xs text-muted-foreground">Ends</span>
              <input type="datetime-local" className={`${input} mt-1 w-full`} value={lf.endsAt} onChange={(e) => setLf({ ...lf, endsAt: e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={savePoint} className={btn}>{busy ? "Saving…" : editingId ? "Update location" : "Save location"}</button>
            <button onClick={cancelForm} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Logical on-set order: direction, camera, lighting, art/costume/hair-MU, support. Every production
// shows all of these on its checklist, ticked once that role has a confirmed booking — there's no
// separate "pencil crew" step at creation time, assignment happens via Find Crew / pencilling as usual.
export const CREW_ROLES = [
  "Director", "Director of Photography", "Focus Puller", "Gaffer", "Art Department", "Wardrobe", "Make-Up",
  "Catering", "Production Assistant",
] as const;

/* ---------------- Production checklist (standard roles, ticked once confirmed) ---------------- */
function ProductionChecklist({ p }: Pick<Ctx, "p">) {
  const bookings = useQuery({
    queryKey: ["production-checklist", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings")
        .select("id, role, status, crew_members(name)")
        .eq("production_id", p.id).neq("status", "cancelled").order("role");
      if (error) throw error;
      return data ?? [];
    },
  }).data ?? [];

  const confirmedStatuses = ["confirmed", "in_progress", "completed", "payment_released"];
  const byRole = (role: string) => bookings.filter((b) => b.role.trim().toLowerCase() === role.toLowerCase());
  const extras = bookings.filter((b) => !CREW_ROLES.some((r) => r.toLowerCase() === b.role.trim().toLowerCase()));

  return (
    <Panel title="Production Checklist">
      <ul className="divide-y divide-border text-sm">
        {CREW_ROLES.map((role) => {
          const matches = byRole(role);
          const confirmed = matches.some((b) => confirmedStatuses.includes(b.status));
          const names = matches.map((b) => (b.crew_members as { name: string } | null)?.name).filter(Boolean).join(", ");
          return (
            <li key={role} className="flex items-center gap-3 px-4 py-2.5">
              {confirmed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="font-medium">{role}</span>
                {names && <span className="text-muted-foreground"> · {names}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{matches.length === 0 ? "Unassigned" : confirmed ? "Confirmed" : "Not yet confirmed"}</span>
            </li>
          );
        })}
        {extras.map((b) => {
          const confirmed = confirmedStatuses.includes(b.status);
          const name = (b.crew_members as { name: string } | null)?.name;
          return (
            <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
              {confirmed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="font-medium">{b.role}</span>
                {name && <span className="text-muted-foreground"> · {name}</span>}
              </span>
              {!confirmed && <span className="shrink-0 text-xs text-muted-foreground">Not yet confirmed</span>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ---------------- Overview ---------------- */
export function OverviewTab({ p, isProducer }: Ctx) {
  const inv = useInvalidate();
  const [f, setF] = useState({ address: p.address ?? "", summary: p.summary ?? "", latitude: p.latitude?.toString() ?? "", longitude: p.longitude?.toString() ?? "", geofence: String(p.geofenceM ?? 10) });
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState(() => !(p.address || p.latitude));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const dirty = useRef(false);
  const update = (patch: Partial<typeof f>) => { setF((prev) => ({ ...prev, ...patch })); dirty.current = true; };
  const createGig = useCreateOpenGig();
  const [gf, setGf] = useState({ role: "", date: p.date ?? "", callTime: "", wrapTime: "", rate: "" });
  const openGigs = useQuery({
    queryKey: ["production-open-gigs", p.id],
    queryFn: async () => { const { data, error } = await supabase.from("bookings").select("id, role, booking_date, crew_rate").eq("production_id", p.id).eq("status", "open"); if (error) throw error; return data ?? []; },
    enabled: isProducer,
  });

  async function postGig() {
    if (!gf.role.trim() || !gf.date) { toast.error("Role and date are required"); return; }
    const rate = Number(gf.rate) || 0;
    try {
      await createGig.mutateAsync({ productionId: p.id, role: gf.role.trim(), bookingDate: gf.date, callTime: gf.callTime, wrapTime: gf.wrapTime, crewRate: rate, clientCharge: rate, days: 1 });
      toast.success("Open gig posted — any crew member can grab it");
      setGf({ role: "", date: p.date ?? "", callTime: "", wrapTime: "", rate: "" });
      setPosting(false);
      inv(["production-open-gigs", p.id]);
    } catch (e) { toast.error(friendlyError(e)); }
  }

  async function save() {
    const { error } = await supabase.from("productions").update({
      address: f.address, summary: f.summary, geofence_m: Number(f.geofence) || 10,
      latitude: f.latitude ? Number(f.latitude) : null, longitude: f.longitude ? Number(f.longitude) : null,
    }).eq("id", p.id);
    if (error) { toast.error(friendlyError(error)); throw error; }
    inv(["productions"]);
  }
  async function useHere() {
    try { const pos = await getPosition(); update({ latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }); }
    catch (e) { toast.error(friendlyError(e)); }
  }

  // Autosave: once the producer edits any field here, persist it a moment after they stop typing —
  // no explicit Save button needed.
  useEffect(() => {
    if (!isProducer || !dirty.current) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      try { await save(); dirty.current = false; setSaveState("saved"); }
      catch { setSaveState("idle"); }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.address, f.summary, f.latitude, f.longitude, f.geofence]);

  return (
    <div className="space-y-5">
      <Panel title="Overview" right={isProducer && saveState !== "idle" ? (
        <span className="text-xs text-muted-foreground">{saveState === "saving" ? "Saving…" : "Saved"}</span>
      ) : undefined}>
        <div className="space-y-3 p-4 text-sm">
          {isProducer ? (
            <label className="block"><span className="text-xs text-muted-foreground">Production summary</span>
              <textarea rows={4} className={`${input} mt-1 w-full`} value={f.summary} onChange={(e) => update({ summary: e.target.value })} /></label>
          ) : (
            <p className="whitespace-pre-wrap">{p.summary || "No summary yet."}</p>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt>Job ID</dt><dd className="text-foreground">{p.jobId || "—"}</dd>
            <dt>Client</dt><dd className="text-foreground">{p.client}</dd>
            <dt>Type</dt><dd className="text-foreground">{p.type}</dd>
            <dt>Shoot</dt><dd className="text-foreground">{p.date || "TBC"} · {p.days} day(s)</dd>
            <dt>Crew</dt><dd className="text-foreground">{p.crewBooked} / {p.crewNeeded}</dd>
            {isProducer && <><dt>Budget</dt><dd className="text-foreground">{zar(p.budget)}</dd></>}
          </dl>
        </div>
      </Panel>

      <Panel title="Itinerary" right={isProducer ? (
        <div className="flex items-center gap-3">
          {saveState !== "idle" && <span className="text-xs text-muted-foreground">{saveState === "saving" ? "Saving…" : "Saved"}</span>}
          <button onClick={() => setEditing(!editing)} className="text-xs font-semibold text-primary hover:underline">{editing ? "Done" : "Edit"}</button>
        </div>
      ) : undefined}>
        <div className="space-y-3 p-4 text-sm">
          {isProducer && editing ? (
            <>
              <label className="block"><span className="text-xs text-muted-foreground">Site address</span>
                <AddressAutocomplete className={`${input} mt-1 w-full`} placeholder="Street, suburb, city" value={f.address}
                  onChange={(v) => update({ address: v })}
                  onSelect={(s) => update({ address: s.label, latitude: s.lat, longitude: s.lon })} /></label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label><span className="text-xs text-muted-foreground">Latitude</span><input className={`${input} mt-1 w-full`} value={f.latitude} onChange={(e) => update({ latitude: e.target.value })} /></label>
                <label><span className="text-xs text-muted-foreground">Longitude</span><input className={`${input} mt-1 w-full`} value={f.longitude} onChange={(e) => update({ longitude: e.target.value })} /></label>
                <label><span className="text-xs text-muted-foreground">Site radius (m)</span><input type="number" className={`${input} mt-1 w-full`} value={f.geofence} onChange={(e) => update({ geofence: e.target.value })} /></label>
              </div>
              <button onClick={useHere} className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><MapPin className="h-3 w-3" /> Use my current location as the site location</button>
            </>
          ) : (
            <div className="flex gap-2"><MapPin className="h-4 w-4 text-primary" /> {p.address || p.location || "Address not set"}</div>
          )}
          {(p.address || p.latitude) && (
            <a className="inline-flex text-xs text-primary hover:underline" target="_blank" rel="noopener noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.latitude ? `${p.latitude},${p.longitude}` : p.address ?? "")}`}>Open in maps</a>
          )}
        </div>
        <LocationPoints p={p} isProducer={isProducer} />
      </Panel>

      <ProductionChecklist p={p} />
    </div>
  );
}

/* ---------------- Members (only producers can rate; crew never rate anyone) ---------------- */
export function MembersList({ p, userId, isProducer }: Ctx) {
  const members = useSiteMembers(p.id).data ?? [];
  const [rating, setRating] = useState<{ crewId: string; name: string } | null>(null);
  return (
    <div>
      <Panel title={`Members on the job (${members.length})`}>
        <ul className="divide-y divide-border">
          {members.length === 0 && <li className="p-4 text-sm text-muted-foreground">No crew booked yet.</li>}
          {members.map((m) => (
            <li key={m.crew_id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={m.name} path={m.photo_url} />
              <div className="min-w-0 flex-1">
                <Link to="/crew/$id" params={{ id: m.crew_id }} className="block truncate text-sm font-semibold hover:text-primary">{m.name}</Link>
                <div className="truncate text-xs text-muted-foreground">{m.role} · {m.department}</div>
              </div>
              {/* Only the production team rates crew — crew never rate anyone, including each other. */}
              {isProducer && m.user_id !== userId && <button onClick={() => setRating({ crewId: m.crew_id, name: m.name })} className="rounded-sm border border-primary px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Rate me</button>}
            </li>
          ))}
        </ul>
      </Panel>
      {rating && <RateDialog {...rating} productionId={p.id} onClose={() => setRating(null)} />}
    </div>
  );
}

export function Avatar({ name, path, size = 36 }: { name: string; path?: string | null; size?: number }) {
  const url = useSignedUrl(path).data;
  return url
    ? <img src={url} alt={name} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
    : <span style={{ width: size, height: size }} className="grid shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{initials(name)}</span>;
}

function RateDialog({ crewId, name, productionId, onClose }: { crewId: string; name: string; productionId: string; onClose: () => void }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const inv = useInvalidate();
  async function submit() {
    const { data: u } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", u.user!.id).maybeSingle();
    const { error } = await supabase.from("crew_reviews").upsert(
      { crew_id: crewId, production_id: productionId, rating: stars, comment, reviewer_id: u.user!.id, reviewer_name: prof?.full_name ?? "" },
      { onConflict: "crew_id,production_id,reviewer_id" });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Rating saved for ${name}`);
    inv(["reviews"], ["crew"]);
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-sm border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-script text-3xl text-primary">Rate {name}</h3>
        <div className="my-3 flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-label={`${n} stars`} onClick={() => setStars(n)}><Star className={`h-7 w-7 ${n <= stars ? "fill-primary text-primary" : "text-muted-foreground"}`} /></button>
          ))}
        </div>
        <textarea rows={3} className={`${input} w-full`} placeholder="How did they do on this job?" value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 text-xs text-muted-foreground">Cancel</button>
          <button onClick={submit} className={btn}>Save rating</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Posts ---------------- */
export function PostsTab({ p, userId, myName, isProducer }: Ctx) {
  const posts = usePosts(p.id);
  const inv = useInvalidate();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [audio, setAudio] = useState<{ blob: Blob; transcript: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ch = supabase.channel(`posts-${p.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "site_posts", filter: `production_id=eq.${p.id}` }, () => inv(["posts", p.id]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  async function submit() {
    if (!body.trim() && !audio && !files.length) return;
    setBusy(true);
    try {
      const audio_path = audio ? await uploadFile(`${p.id}/audio`, audio.blob, "voice-note.webm") : null;
      const attachments = [];
      for (const f of files) attachments.push({ name: f.name, path: await uploadFile(`${p.id}/posts`, f, f.name), size: f.size, type: f.type });
      const { error } = await supabase.from("site_posts").insert({
        production_id: p.id, author_id: userId, author_name: myName, body: body.trim(),
        audio_path, transcript: audio?.transcript || null, attachments,
      });
      if (error) throw error;
      setBody(""); setFiles([]); setAudio(null);
      inv(["posts", p.id]);
      toast.success("Posted — everyone on the job has been notified");
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("site_posts").delete().eq("id", id);
    if (error) toast.error(friendlyError(error)); else inv(["posts", p.id]);
  }

  return (
    <div className="w-full space-y-4">
      <div className="rounded-sm border border-border bg-card p-4">
        <textarea rows={3} className={`${input} w-full`} placeholder="Share an update with everyone on this job…" value={body} onChange={(e) => setBody(e.target.value)} />
        {recording && <div className="mt-2"><AudioRecorder onCancel={() => setRecording(false)} onDone={(blob, transcript) => { setRecording(false); setAudio({ blob, transcript }); if (transcript) setBody((b) => (b ? `${b}\n${transcript}` : transcript)); }} /></div>}
        {audio && !recording && <div className="mt-2 flex items-center gap-2 text-xs text-primary"><Mic className="h-3 w-3" /> Voice note attached{audio.transcript ? " and transcribed" : ""} <button className="text-muted-foreground underline" onClick={() => setAudio(null)}>remove</button></div>}
        {files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{files.map((f, i) => <span key={i} className="rounded-sm bg-muted px-2 py-1 text-xs">{f.name} <button onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></span>)}</div>}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setRecording(true)} disabled={recording} className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs hover:border-primary"><Mic className="h-4 w-4" /> Audio</button>
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs hover:border-primary"><Paperclip className="h-4 w-4" /> Attach</button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
          <button onClick={submit} disabled={busy || recording} className={`${btn} ml-auto`}>{busy ? "Posting…" : "Post"}</button>
        </div>
      </div>
      {posts.data?.length === 0 && <p className="text-center text-sm text-muted-foreground">No posts yet. Start the conversation.</p>}
      {posts.data?.map((post) => (
        <article key={post.id} className="rounded-sm border border-border bg-card p-4">
          <header className="mb-2 flex items-center gap-3">
            <Avatar name={post.author_name || "?"} />
            <div className="flex-1"><div className="text-sm font-semibold">{post.author_name || "Team member"}</div><div className="text-xs text-muted-foreground">{when(post.created_at)}</div></div>
            {(post.author_id === userId || isProducer) && <button aria-label="Delete post" onClick={() => remove(post.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>}
          </header>
          {post.body && <p className="whitespace-pre-wrap text-sm">{post.body}</p>}
          {post.audio_path && <AudioPlayer path={post.audio_path} />}
          {post.transcript && post.transcript !== post.body && <p className="mt-2 rounded-sm bg-muted p-2 text-xs italic text-muted-foreground">Transcript: {post.transcript}</p>}
          {Array.isArray(post.attachments) && post.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">{(post.attachments as { name: string; path: string }[]).map((a) => <FileLink key={a.path} {...a} />)}</div>
          )}
        </article>
      ))}
    </div>
  );
}

function AudioPlayer({ path }: { path: string }) {
  const url = useSignedUrl(path).data;
  return url ? <audio controls src={url} className="mt-2 w-full" /> : null;
}

/* ---------------- Messages (booking-scoped) ---------------- */
export function MessagesTab({ p, userId, myName }: Ctx & { bookings: Booking[]; crewNames: Record<string, string> }) {
  const bookingId = "all" as const;
  const messages = useMessages(p.id, bookingId);
  const inv = useInvalidate();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ch = supabase.channel(`messages-${p.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `production_id=eq.${p.id}` }, () => inv(["messages", p.id, bookingId]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, bookingId]);

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("messages").insert({ production_id: p.id, booking_id: bookingId === "all" ? null : bookingId, sender_id: userId, sender_name: myName, body: body.trim() });
      if (error) throw error;
      setBody(""); inv(["messages", p.id, bookingId]);
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <div className="w-full space-y-4">
      <div className="space-y-2 rounded-sm border border-border bg-card p-4">
        {(messages.data ?? []).length === 0 && <p className="text-center text-sm text-muted-foreground">No messages yet.</p>}
        {(messages.data ?? []).map((m) => (
          <div key={m.id} className={`rounded-sm p-2 text-sm ${m.sender_id === userId ? "ml-auto max-w-[80%] bg-primary/15" : "max-w-[80%] bg-muted"}`}>
            <div className="text-xs font-semibold">{m.sender_name}</div>
            <div className="whitespace-pre-wrap">{m.body}</div>
            <div className="text-[10px] text-muted-foreground">{when(m.created_at)}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea rows={2} className={`${input} flex-1`} placeholder="Call time, location, documents, changes…" value={body} onChange={(e) => setBody(e.target.value)} />
        <button onClick={send} disabled={busy} className={btn}>Send</button>
      </div>
    </div>
  );
}

/* ---------------- Register (geolocation ins & outs) ---------------- */
export function RegisterTab({ p, isProducer, userId, myName, myCrewId }: Ctx) {
  const reg = useRegister(p.id);
  const members = useSiteMembers(p.id).data ?? [];
  const inv = useInvalidate();
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(pendingCount());
  const rows = reg.data ?? [];
  const lastByCrew = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.crew_id && !lastByCrew.has(r.crew_id)) lastByCrew.set(r.crew_id, r);
  const myLast = myCrewId ? lastByCrew.get(myCrewId) : undefined;
  const hasSite = p.latitude != null && p.longitude != null;
  const radius = p.geofenceM ?? 10;

  async function trySync() {
    const { synced } = await syncQueue();
    setPending(pendingCount());
    if (synced > 0) { toast.success(`Synced ${synced} offline check-in${synced > 1 ? "s" : ""}`); inv(["register", p.id]); }
  }

  useEffect(() => {
    if (isOnline() && pendingCount() > 0) trySync();
    const onOnline = () => trySync();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function mark(kind: "in" | "out", crewId: string, name: string, source: string, coords?: GeolocationCoordinates) {
    const distance = coords && hasSite ? distanceMeters(coords.latitude, coords.longitude, p.latitude!, p.longitude!) : null;
    const row = {
      production_id: p.id, crew_id: crewId, user_id: userId, person_name: name, kind, source,
      latitude: coords?.latitude ?? null, longitude: coords?.longitude ?? null,
      distance_m: distance, on_site: distance == null ? null : isOnSite(distance, radius),
    };
    if (!isOnline()) {
      queueCheckin(row);
      setPending(pendingCount());
      return distance;
    }
    const { error } = await supabase.from("site_attendance").insert(row);
    if (error) {
      // Network/transient failure while reportedly online — queue rather than lose the event.
      queueCheckin(row);
      setPending(pendingCount());
      return distance;
    }
    inv(["register", p.id]);
    return distance;
  }

  async function selfMark(kind: "in" | "out") {
    if (!myCrewId) return;
    setBusy(true);
    try {
      const pos = await getPosition();
      const d = await mark(kind, myCrewId, myName, "gps", pos.coords);
      if (!isOnline()) toast.warning(`${kind === "in" ? "Check-in" : "Check-out"} saved offline — will sync when you're back online.`);
      else if (kind === "in" && d != null && !isOnSite(d, radius)) toast.warning(`Checked in, but you are ${d}m from the site.`);
      else toast.success(kind === "in" ? "Checked in" : "Checked out");
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  // Automatic tracking: marks in when entering the site radius, out when leaving
  const state = useRef<boolean | null>(myLast ? myLast.kind === "in" : null);
  useEffect(() => { state.current = myLast ? myLast.kind === "in" : false; }, [myLast]);
  useEffect(() => {
    if (!auto || !myCrewId || !hasSite || !navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(async (pos) => {
      const d = distanceMeters(pos.coords.latitude, pos.coords.longitude, p.latitude!, p.longitude!);
      const inside = isOnSite(d, radius);
      if (inside !== state.current) {
        state.current = inside;
        try { await mark(inside ? "in" : "out", myCrewId, myName, "geofence", pos.coords); toast(inside ? "You arrived on site — checked in" : "You left the site — checked out"); } catch { /* ignore */ }
      }
    }, () => toast.error("Location tracking stopped. Check location permissions."), { enableHighAccuracy: true });
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, myCrewId, hasSite]);

  return (
    <div className="space-y-5">
      {isProducer && (() => {
        const st = members.map((m) => { const l = lastByCrew.get(m.crew_id); return !l ? "na" : l.kind === "in" ? "on" : "out"; });
        const cards: [string, number, string][] = [["On set", st.filter((s) => s === "on").length, "text-success"], ["Not arrived", st.filter((s) => s === "na").length, "text-destructive"], ["Wrapped", st.filter((s) => s === "out").length, "text-muted-foreground"]];
        return (
          <div className="grid grid-cols-3 gap-3">
            {cards.map(([l, v, c]) => (
              <div key={l} className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="text-xs text-muted-foreground">{l}</div><div className={`mt-1 font-display text-3xl font-semibold ${c}`}>{v}</div></div>
            ))}
          </div>
        );
      })()}
      {isProducer && <OvertimeApprovals production={p.name} />}
      {!hasSite && <p className="rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">The site location isn't set yet{isProducer ? " — add it under Overview so check-ins can be verified." : ", so check-ins can't be verified yet."}</p>}
      {myCrewId && (
        <Panel title="My attendance">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm">Status: <strong>{myLast?.kind === "in" ? "On site" : "Not checked in"}</strong></span>
            <button disabled={busy} onClick={() => selfMark("in")} className={`${btn} inline-flex items-center gap-1`}><LogIn className="h-4 w-4" /> Check in</button>
            <button disabled={busy} onClick={() => selfMark("out")} className="inline-flex items-center gap-1 rounded-sm border border-border px-3 py-2 text-xs font-semibold"><LogOut className="h-4 w-4" /> Check out</button>
            <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={auto} disabled={!hasSite} onChange={(e) => setAuto(e.target.checked)} /> Automatic tracking while this page is open</label>
          </div>
          {pending > 0 && (
            <div className="flex items-center justify-between border-t border-border bg-primary/10 px-4 py-2 text-xs">
              <span>{pending} check-in{pending > 1 ? "s" : ""} saved offline, not yet synced.</span>
              <button onClick={trySync} className="font-semibold text-primary hover:underline">Sync now</button>
            </div>
          )}
        </Panel>
      )}
      <Panel title="Who's on site" right={<span className="text-xs text-muted-foreground">Radius {radius}m</span>}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Member</th><th className="px-4">Status</th><th className="px-4">Last movement</th>{isProducer && <th className="px-4">Mark</th>}</tr></thead>
          <tbody>
            {members.map((m) => {
              const l = lastByCrew.get(m.crew_id);
              const status = !l ? "Not arrived" : l.kind === "in" ? "On set" : "Wrapped";
              return (
                <tr key={m.crew_id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium"><Link to="/crew/$id" params={{ id: m.crew_id }} className="hover:text-primary">{m.name}</Link></td>
                  <td className="px-4"><Badge>{status}</Badge></td>
                  <td className="px-4 text-xs text-muted-foreground">{l ? `${l.kind === "in" ? "In" : "Out"} · ${when(l.created_at)}${l.distance_m != null ? ` · ${l.distance_m}m` : ""}` : "—"}</td>
                  {isProducer && <td className="px-4"><div className="flex gap-2">
                    <button className="text-xs text-primary hover:underline" onClick={() => mark("in", m.crew_id, m.name, "manual").catch((e) => toast.error(e.message))}>In</button>
                    <button className="text-xs text-primary hover:underline" onClick={() => mark("out", m.crew_id, m.name, "manual").catch((e) => toast.error(e.message))}>Out</button>
                  </div></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <Panel title="Register — all ins and outs">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr><th className="px-4 py-2">Time</th><th className="px-4">Member</th><th className="px-4">In/Out</th><th className="px-4">How</th><th className="px-4">Location</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No entries yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-4 py-2 text-xs">{when(r.created_at)}</td>
                <td className="px-4">{r.person_name}</td>
                <td className="px-4 font-semibold">{r.kind}</td>
                <td className="px-4 text-xs text-muted-foreground">{r.source === "geofence" ? "Automatic" : r.source === "gps" ? "GPS" : "Marked by producer"}</td>
                <td className="px-4 text-xs">{r.on_site == null ? "—" : r.on_site ? <span className="text-success">On site ({r.distance_m}m)</span> : <span className="text-destructive">Off site ({r.distance_m}m)</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

/* ---------------- Tasks ---------------- */
export function TasksTab({ p, userId }: Ctx) {
  const tasks = useTasks(p.id).data ?? [];
  const members = useSiteMembers(p.id).data ?? [];
  const inv = useInvalidate();
  const [f, setF] = useState({ title: "", crew: "", due: "" });
  async function add() {
    if (!f.title.trim()) return;
    const { error } = await supabase.from("site_tasks").insert({ production_id: p.id, title: f.title.trim(), assigned_crew_id: f.crew || null, due_date: f.due || null, created_by: userId });
    if (error) { toast.error(friendlyError(error)); return; }
    setF({ title: "", crew: "", due: "" }); inv(["tasks", p.id]);
  }
  async function toggle(id: string, done: boolean) { await supabase.from("site_tasks").update({ done }).eq("id", id); inv(["tasks", p.id]); }
  async function remove(id: string) { const { error } = await supabase.from("site_tasks").delete().eq("id", id); if (error) toast.error(friendlyError(error)); inv(["tasks", p.id]); }
  return (
    <Panel title="Tasks">
      <div className="flex flex-wrap gap-2 border-b border-border p-4">
        <input className={`${input} min-w-56 flex-1`} placeholder="New task…" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className={input} value={f.crew} onChange={(e) => setF({ ...f, crew: e.target.value })}><option value="">Unassigned</option>{members.map((m) => <option key={m.crew_id} value={m.crew_id}>{m.name}</option>)}</select>
        <input type="date" className={input} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        <button onClick={add} className={btn}>Add task</button>
      </div>
      <ul className="divide-y divide-border">
        {tasks.length === 0 && <li className="p-4 text-sm text-muted-foreground">No tasks yet.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <button aria-label={t.done ? "Mark not done" : "Mark done"} onClick={() => toggle(t.id, !t.done)}>{t.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</button>
            <span className={`flex-1 text-sm ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
            <span className="text-xs text-muted-foreground">{members.find((m) => m.crew_id === t.assigned_crew_id)?.name ?? ""}{t.due_date ? ` · due ${t.due_date}` : ""}</span>
            <button aria-label="Delete task" onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------- Documents ---------------- */
const DOC_CATS = ["Call sheet", "Script", "Permit", "Contract", "Schedule", "General"];
export function DocumentsTab({ p, userId, myName }: Ctx) {
  const docs = useDocs(p.id).data ?? [];
  const inv = useInvalidate();
  const [cat, setCat] = useState("General");
  const [busy, setBusy] = useState(false);
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const path = await uploadFile(`${p.id}/docs`, file, file.name);
        const { error } = await supabase.from("site_documents").insert({ production_id: p.id, name: file.name, category: cat, path, size: file.size, uploaded_by: userId, uploader_name: myName });
        if (error) throw error;
      }
      toast.success("Uploaded"); inv(["docs", p.id]);
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }
  async function remove(id: string) { const { error } = await supabase.from("site_documents").delete().eq("id", id); if (error) toast.error(friendlyError(error)); inv(["docs", p.id]); }
  return (
    <Panel title="Documents" right={
      <div className="flex items-center gap-2">
        <select className={`${input} py-1`} value={cat} onChange={(e) => setCat(e.target.value)}>{DOC_CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <label className={`${btn} cursor-pointer`}>{busy ? "Uploading…" : "Upload"}<input type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} /></label>
      </div>}>
      <ul className="divide-y divide-border">
        {docs.length === 0 && <li className="p-4 text-sm text-muted-foreground">No documents yet.</li>}
        {docs.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
            <FileText className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{d.name}</div><div className="text-xs text-muted-foreground">{d.category} · {d.uploader_name || "—"} · {when(d.created_at)}</div></div>
            <button aria-label="Download" onClick={async () => window.open(await signedUrl(d.path), "_blank", "noopener")} className="text-muted-foreground hover:text-primary"><Download className="h-4 w-4" /></button>
            <button aria-label="Delete" onClick={() => remove(d.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------- Assets ---------------- */
export function AssetsTab({ p, isProducer, bookings, crewNames }: Ctx & { bookings: Booking[]; crewNames: Record<string, string> }) {
  const assets = useCrewAssets(true).data ?? [];
  const selected = useBookingAssets(true).data ?? [];
  const inv = useInvalidate();
  const rows = bookings.filter((b) => b.productionId === p.id && b.status !== "cancelled");
  const [swapping, setSwapping] = useState<Booking | null>(null);

  async function toggle(b: Booking, a: (typeof assets)[number], on: boolean) {
    const { error } = on
      ? await supabase.from("booking_assets").insert({ booking_id: b.id, asset_id: a.id, daily_fee: a.daily_fee, days: b.days })
      : await supabase.from("booking_assets").delete().eq("booking_id", b.id).eq("asset_id", a.id);
    if (error) toast.error(friendlyError(error)); else inv(["booking-assets"]);
  }

  const grandTotal = rows.reduce((sum, b) => {
    const lines = selected.filter((s) => s.booking_id === b.id).map((s) => ({ dailyFee: Number(s.daily_fee), days: s.days }));
    return sum + providerTotal(b.crewRate, b.days, lines);
  }, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{isProducer ? "Tick the kit and props from each provider's inventory that Dial a Crew has selected for this job. Each fee is added to that provider's total." : "Kit and props selected for this job."}</p>
      {isProducer && rows.length > 0 && (
        <div className="flex items-center justify-between rounded-sm border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold">Running cost as selected</span>
          <span className="font-display text-2xl font-bold text-primary">{zar(grandTotal)}</span>
        </div>
      )}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No crew booked yet.</p>}
      {rows.map((b) => {
        const own = assets.filter((a) => a.crew_id === b.crewId);
        const sel = selected.filter((s) => s.booking_id === b.id);
        const lines = sel.map((s) => ({ dailyFee: Number(s.daily_fee), days: s.days }));
        return (
          <Panel key={b.id} title={<>{b.crewId ? <Link to="/crew/$id" params={{ id: b.crewId }} className="hover:underline">{crewNames[b.crewId] ?? "Provider"}</Link> : "Provider"} — {b.role}</>} right={
            <div className="flex items-center gap-3">
              <span className="text-sm">Assets {zar(assetsTotal(lines))}{isProducer && <> · Total {zar(providerTotal(b.crewRate, b.days, lines))}</>}</span>
              {isProducer && <button onClick={() => setSwapping(b)} className="text-xs text-primary hover:underline">Swap</button>}
            </div>
          }>
            <ul className="divide-y divide-border">
              {own.length === 0 && <li className="p-4 text-sm text-muted-foreground">This provider hasn't listed any kit or props yet.</li>}
              {own.filter((a) => isProducer || sel.some((s) => s.asset_id === a.id)).map((a) => {
                const on = sel.some((s) => s.asset_id === a.id);
                return (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                    {isProducer && <input type="checkbox" className="accent-primary" checked={on} onChange={(e) => toggle(b, a, e.target.checked)} aria-label={`Select ${a.name}`} />}
                    <span className="flex-1 text-sm">{a.name} <span className="text-xs text-muted-foreground">· {a.category}</span></span>
                    <span className="text-sm">{zar(Number(a.daily_fee))}/day × {b.days}</span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
      {swapping && <SwapDialog booking={swapping} currentName={crewNames[swapping.crewId ?? ""] ?? "this provider"} onClose={() => setSwapping(null)} onDone={() => inv(["bookings"])} />}
    </div>
  );
}

function SwapDialog({ booking, currentName, onClose, onDone }: { booking: Booking; currentName: string; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState(booking.role);
  const candidates = useQuery({
    queryKey: ["swap-candidates", q],
    queryFn: async () => {
      const { data, error } = await supabase.from("crew_members").select("id, name, role, department, day_rate, available").ilike("role", `%${q}%`).neq("id", booking.crewId ?? "").limit(20);
      if (error) throw error; return data ?? [];
    },
  });
  const [busy, setBusy] = useState(false);

  async function swap(newCrewId: string, dayRate: number) {
    setBusy(true);
    try {
      const { error: cancelErr } = await supabase.from("bookings").update({ status: "cancelled", cancelled_reason: `Swapped out for a different ${booking.role}` }).eq("id", booking.id);
      if (cancelErr) throw cancelErr;
      const { error: insertErr } = await supabase.from("bookings").insert({
        production_id: booking.productionId, crew_id: newCrewId, role: booking.role, status: "confirmed",
        booking_date: booking.bookingDate ?? null, call_time: booking.callTime ?? null, wrap_time: booking.wrapTime ?? null,
        crew_rate: dayRate, client_charge: dayRate, days: booking.days,
      });
      if (insertErr) throw insertErr;
      toast.success("Crew member swapped");
      onDone();
      onClose();
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-sm border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-script text-3xl text-primary">Swap out {currentName}</h3>
        <p className="mt-1 text-xs text-muted-foreground">The current booking will be cancelled and a new one created for whoever you pick, at their own day rate.</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by role…" className="mt-3 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring" />
        <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
          {(candidates.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2">
              <div>
                <div className="text-sm font-semibold">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.role} · {c.department} · {zar(c.day_rate)}/day {!c.available && "· Booked"}</div>
              </div>
              <button disabled={busy} onClick={() => swap(c.id, c.day_rate)} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">Use this person</button>
            </li>
          ))}
          {candidates.data?.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">No matches.</li>}
        </ul>
        <div className="mt-3 text-right"><button onClick={onClose} className="text-xs text-muted-foreground">Cancel</button></div>
      </div>
    </div>
  );
}

/* ---------------- Commercials (producer only) ---------------- */
export function CommercialsTab({ p, bookings, crewNames, requests }: Ctx & { bookings: Booking[]; crewNames: Record<string, string>; requests: { production: string; amount: number; state: string; kind: string; detail: string }[] }) {
  const selected = useBookingAssets(true).data ?? [];
  const [clientView, setClientView] = useState(false);
  const rows = bookings.filter((b) => b.productionId === p.id).map((b) => {
    const lines = selected.filter((s) => s.booking_id === b.id).map((s) => ({ dailyFee: Number(s.daily_fee), days: s.days }));
    return { b, assets: assetsTotal(lines), cost: providerTotal(b.crewRate, b.days, lines), charge: b.clientCharge * b.days + assetsTotal(lines) };
  });
  const extras = requests.filter((r) => r.production === p.name && r.state === "Approved");
  const extrasTotal = extras.reduce((a, r) => a + r.amount, 0);
  const crewCost = rows.reduce((a, r) => a + r.b.crewRate * r.b.days, 0);
  const assetCost = rows.reduce((a, r) => a + r.assets, 0);
  const running = crewCost + assetCost + extrasTotal;
  const billing = rows.reduce((a, r) => a + r.charge, 0) + extrasTotal;
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <div className="flex rounded-sm border border-border text-xs font-semibold">
          <button onClick={() => setClientView(false)} className={`px-3 py-2 ${!clientView ? "bg-primary text-primary-foreground" : ""}`}>Producer view</button>
          <button onClick={() => setClientView(true)} className={`px-3 py-2 ${clientView ? "bg-primary text-primary-foreground" : ""}`}>Client view</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border md:grid-cols-5">
        {(clientView
          ? [["Budget", zar(p.budget)], ["Quoted to client", zar(billing)], ["Crew booked", `${p.crewBooked}/${p.crewNeeded}`], ["Secured funds", zar(p.securedFunds)], ["Balance due", zar(Math.max(0, billing - p.securedFunds))]]
          : [["Budget", zar(p.budget)], ["Running cost", zar(running)], ["Client billing", zar(billing)], ["Margin", zar(billing - running)], ["Budget left", zar(p.budget - running)]]
        ).map(([l, v]) => (
          <div key={l} className="bg-card px-4 py-3"><div className="text-[11px] text-muted-foreground">{l}</div><div className="font-display text-2xl font-semibold">{v}</div></div>
        ))}
      </div>
      <Panel title="Cost breakdown">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground"><tr>
            <th className="px-4 py-2">Role</th><th className="px-4">Provider</th><th className="px-4">Days</th>
            {!clientView && <><th className="px-4">Crew rate</th><th className="px-4">Assets</th><th className="px-4">Provider total</th></>}
            <th className="px-4">{clientView ? "Charge" : "Client charge"}</th><th className="px-4">Status</th></tr></thead>
          <tbody>
            {rows.map(({ b, assets, cost, charge }) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">{b.role}</td>
                <td className="px-4">{b.crewId ? <Link to="/crew/$id" params={{ id: b.crewId }} className="hover:text-primary">{crewNames[b.crewId] ?? "Open"}</Link> : "Open"}</td>
                <td className="px-4">{b.days}</td>
                {!clientView && <><td className="px-4 text-muted-foreground">{zar(b.crewRate)}</td><td className="px-4">{zar(assets)}</td><td className="px-4 font-semibold">{zar(cost)}</td></>}
                <td className="px-4">{zar(charge)}</td><td className="px-4"><Badge>{b.status}</Badge></td>
              </tr>
            ))}
            {extras.map((r, i) => (
              <tr key={i} className="border-t border-border"><td className="px-4 py-2.5 font-medium">{r.kind}</td><td className="px-4 text-muted-foreground" colSpan={clientView ? 2 : 5}>{r.detail}</td><td className="px-4">{zar(r.amount)}</td><td className="px-4"><Badge>Approved</Badge></td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {clientView && <p className="text-xs text-muted-foreground">Client view hides internal crew rates, provider totals and margin.</p>}
    </div>
  );
}

export const SiteIcons = { Users };
