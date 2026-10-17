import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Camera, CheckCircle2, Circle, Download, FileText, GripVertical, ImageUp, LogIn, LogOut, MapPin, Mic, Minus, Paperclip, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Panel } from "@/components/AppShell";
import { AudioRecorder } from "@/components/AudioRecorder";
import { fmtMoney, zar, type Booking, type Crew, type Production } from "@/lib/demo-data";
import { assetsTotal, providerTotal } from "@/lib/costing";
import { distanceMeters, getPosition, isOnSite } from "@/lib/geo";
import { isOnline, pendingCount, queueCheckin, syncQueue } from "@/lib/offline-checkin";
import {
  signedUrl, uploadFile, useBookingAssets, useChecklists, useCrewAssets, useDocs, useInvalidate, useLocationPoints, useMessages, usePosts, useRegister,
  useReviews, useSignedUrl, useSiteMembers, useTasks,
} from "@/lib/site";
import { useCancelBooking, useCreateOpenGig, useCrew, useRequests, useSetRequestState } from "@/lib/db";
import { LocationRisks, ProjectWideRisks } from "@/components/site/ProjectInsights";

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

type AddressSuggestion = { label: string; place: string; lat: string; lon: string };

type NominatimAddress = { suburb?: string; neighbourhood?: string; quarter?: string; village?: string; hamlet?: string; city?: string; town?: string; municipality?: string; county?: string };
function placeFromAddress(a: NominatimAddress | undefined, fallback: string) {
  const area = a?.suburb ?? a?.neighbourhood ?? a?.quarter ?? a?.village ?? a?.hamlet;
  const city = a?.city ?? a?.town ?? a?.municipality ?? a?.county;
  const parts = [area, city].filter((v): v is string => !!v);
  return [...new Set(parts)].join(", ") || fallback;
}

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
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(value)}`);
        const data = (await res.json()) as { display_name: string; lat: string; lon: string; address?: NominatimAddress }[];
        setSuggestions(data.map((d) => ({ label: d.display_name, place: placeFromAddress(d.address, d.display_name.split(",")[0] ?? d.display_name), lat: d.lat, lon: d.lon })));
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
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const clockLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
const hasTime = (iso: string) => { const d = new Date(iso); return d.getHours() !== 0 || d.getMinutes() !== 0; };
const timeRange = (start: string, end: string | null) => (hasTime(start) ? `${clockLabel(start)}${end ? ` – ${clockLabel(end)}` : ""}` : "Time TBC");

function NumberedPin({ n }: { n: number }) {
  return (
    <span role="img" aria-label={`Location ${n}`} className="relative inline-flex h-10 w-8 shrink-0 justify-center">
      <MapPin className="h-10 w-8 fill-destructive text-destructive" strokeWidth={1.75} />
      <span className="absolute inset-x-0 top-[3px] flex h-[26px] items-center justify-center text-[10px] font-bold leading-none text-white">{n}</span>
    </span>
  );
}
const localYmd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const WEATHER_CODES: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm",
};

function DayWeather({ lat, lon, date }: { lat: number; lon: number; date: string }) {
  const forecast = useQuery({
    queryKey: ["weather", lat, lon, date],
    queryFn: async () => {
      const qs = new URLSearchParams({
        latitude: String(lat), longitude: String(lon), timezone: "auto", start_date: date, end_date: date,
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
      if (!res.ok) throw new Error("forecast unavailable");
      const j = (await res.json()) as { daily?: { weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] } };
      const d = j.daily;
      if (!d?.weather_code?.length) throw new Error("no forecast");
      return { code: d.weather_code[0]!, max: d.temperature_2m_max?.[0], min: d.temperature_2m_min?.[0], rain: d.precipitation_probability_max?.[0] };
    },
    staleTime: 3 * 60 * 60 * 1000,
    retry: false,
  });
  if (forecast.isPending) return <p className="text-xs text-muted-foreground">Checking the forecast…</p>;
  if (forecast.isError || !forecast.data) return <p className="text-xs text-muted-foreground">No forecast for this date yet (forecasts run up to 16 days ahead).</p>;
  const w = forecast.data;
  return (
    <p className="text-xs font-medium text-foreground">
      {WEATHER_CODES[w.code] ?? "Mixed conditions"}
      {w.min != null && w.max != null ? ` · ${Math.round(w.min)}–${Math.round(w.max)}°C` : ""}
      {w.rain != null ? ` · ${Math.round(w.rain)}% chance of rain` : ""}
    </p>
  );
}

function LocationPoints({ p, isProducer }: Pick<Ctx, "p" | "isProducer">) {
  const inv = useInvalidate();
  const points = useLocationPoints(p.id).data ?? [];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lf, setLf] = useState(blankLocationForm);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
    if (!lf.address.trim()) { toast.error("Pick the address from the list so the location gets its suburb and city"); return; }
    setBusy(true);
    const payload = {
      label: lf.label.trim() || lf.address.split(",").slice(0, 2).join(",").trim(), address: lf.address.trim(),
      latitude: lf.latitude ? Number(lf.latitude) : null, longitude: lf.longitude ? Number(lf.longitude) : null,
      starts_at: lf.startsAt ? new Date(lf.startsAt).toISOString() : null,
      ends_at: lf.endsAt ? new Date(lf.endsAt).toISOString() : null,
    };
    const { error } = editingId
      ? await supabase.from("production_locations").update(payload).eq("id", editingId)
      : await supabase.from("production_locations").insert({ production_id: p.id, sort_order: points.length, ...payload });
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

  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const order = points.map((pt) => pt.id);
    const from = order.indexOf(fromId);
    const to = order.indexOf(toId);
    if (from === -1 || to === -1) return;
    order.splice(to, 0, order.splice(from, 1)[0]!);
    const results = await Promise.all(order.map((id, i) => supabase.from("production_locations").update({ sort_order: i }).eq("id", id)));
    const error = results.find((r) => r.error)?.error;
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["location-points", p.id]);
  }

  if (!isProducer && points.length === 0) return null;

  function mapHref(pt: { label: string; address: string; latitude: number | null; longitude: number | null }) {
    if (pt.latitude != null && pt.longitude != null) return `https://www.google.com/maps?q=${pt.latitude},${pt.longitude}`;
    if (pt.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pt.address)}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pt.label)}`;
  }

  return (
    <div>
      {isProducer && !adding && points.length === 0 && (
        <div className="flex justify-end px-4 pt-4">
          <button onClick={startAdd} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add Location</button>
        </div>
      )}
      <ul className="space-y-3 p-3 text-sm">
        {points.length === 0 && <li className="p-4 text-muted-foreground">No locations yet.</li>}
        {points.map((pt, i) => (
          <li key={pt.id}
            draggable={isProducer && points.length > 1}
            onDragStart={() => setDragId(pt.id)}
            onDragOver={(e) => { if (isProducer) { e.preventDefault(); setDragOverId(pt.id); } }}
            onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, pt.id); setDragId(null); setDragOverId(null); }}
            onDragEnd={() => { setDragId(null); setDragOverId(null); }}
            className={`flex items-start justify-between gap-3 rounded-sm border border-border bg-card p-4 ${dragOverId === pt.id && dragId && dragId !== pt.id ? "bg-muted" : ""}`}>
            {isProducer && points.length > 1 && <div className="flex h-10 shrink-0 items-center"><GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" /></div>}
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-start gap-2">
                <NumberedPin n={i + 1} />
                <div>
                  <div className="text-base font-bold text-foreground">{pt.label}</div>
                  <div className="text-sm font-semibold text-foreground">{pt.starts_at ? dayLabel(pt.starts_at) : "Date TBC"}</div>
                  <div className="text-sm text-foreground">{pt.starts_at ? timeRange(pt.starts_at, pt.ends_at) : "Time TBC"}</div>
                </div>
              </div>
              <a href={mapHref(pt)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:underline">
                <MapPin className="h-3.5 w-3.5 text-primary" /> {pt.label}{pt.address ? ` · ${pt.address}` : ""}
              </a>
              {pt.starts_at && (pt.latitude != null && pt.longitude != null
                ? <DayWeather lat={pt.latitude} lon={pt.longitude} date={localYmd(pt.starts_at)} />
                : <p className="text-xs text-muted-foreground">Add a map location to see the forecast for this day.</p>)}
              {isProducer && <LocationRisks p={p} locationId={pt.id} hasCoords={pt.latitude != null && pt.longitude != null} />}
            </div>
            {isProducer && (
              <div className="flex h-10 shrink-0 items-center gap-2">
                <button onClick={() => startEdit(pt)} className="text-muted-foreground hover:text-primary" aria-label={`Edit ${pt.label}`}><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => removePoint(pt.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${pt.label}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {isProducer && adding && (
        <div className="m-3 space-y-2 rounded-sm border border-primary/40 bg-primary/5 p-4">
          <AddressAutocomplete className={`${input} w-full`} placeholder="Address — start typing to search" value={lf.address}
            onChange={(v) => setLf({ ...lf, address: v })}
            onSelect={(s) => setLf({ ...lf, label: s.place, address: s.label, latitude: s.lat, longitude: s.lon })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block min-w-0"><span className="text-xs text-muted-foreground">Starts</span>
              <input type="datetime-local" className={`${input} mt-1 w-full min-w-0`} value={lf.startsAt} onChange={(e) => setLf({ ...lf, startsAt: e.target.value })} /></label>
            <label className="block min-w-0"><span className="text-xs text-muted-foreground">Ends</span>
              <input type="datetime-local" className={`${input} mt-1 w-full min-w-0`} value={lf.endsAt} onChange={(e) => setLf({ ...lf, endsAt: e.target.value })} /></label>
          </div>
          <div className="flex gap-2">
            <button disabled={busy} onClick={savePoint} className={btn}>{busy ? "Saving…" : editingId ? "Update location" : "Save location"}</button>
            <button onClick={cancelForm} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
          </div>
        </div>
      )}
      {isProducer && !adding && points.length > 0 && (
        <div className="flex justify-end px-4 pb-4">
          <button onClick={startAdd} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add Location</button>
        </div>
      )}
      {isProducer && <div className="border-t border-border p-3"><ProjectWideRisks p={p} /></div>}
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

export const CONFIRMED_BOOKING_STATUSES = ["confirmed", "in_progress", "completed", "payment_released"];

/* ---------------- Crew role required (standard roles still needing a confirmed booking) — shown on Members tab ---------------- */
function CrewRoleStatus({ p, onFind }: Pick<Ctx, "p"> & { onFind: (role: string) => void }) {
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

  const byRole = (role: string) => bookings.filter((b) => b.role.trim().toLowerCase() === role.toLowerCase());
  // Once a role has a confirmed booking, it's done — drop it from this list entirely; it now shows under Confirmed Members instead.
  const openRoles = CREW_ROLES.filter((role) => !byRole(role).some((b) => CONFIRMED_BOOKING_STATUSES.includes(b.status)));
  const extras = bookings.filter((b) => !CREW_ROLES.some((r) => r.toLowerCase() === b.role.trim().toLowerCase()) && !CONFIRMED_BOOKING_STATUSES.includes(b.status));
  const unassignedRoles = openRoles.filter((role) => byRole(role).length === 0);

  if (openRoles.length === 0 && extras.length === 0) return null;

  return (
    <Panel title="Crew Role Required" right={
      <select aria-label="Find a crew member for an unassigned role" value="" disabled={unassignedRoles.length === 0}
        onChange={(e) => { if (e.target.value) onFind(e.target.value); }}
        className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">
        <option value="">Find a Crew</option>
        {unassignedRoles.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    }>
      <ul className="divide-y divide-border text-sm">
        {openRoles.map((role) => {
          const matches = byRole(role);
          const names = matches.map((b) => (b.crew_members as { name: string } | null)?.name).filter(Boolean).join(", ");
          return (
            <li key={role} className="flex items-center gap-3 px-4 py-2.5">
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{role}</span>
                {names && <span className="text-muted-foreground"> · {names}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{matches.length === 0 ? "Unassigned" : "Not yet confirmed"}</span>
            </li>
          );
        })}
        {extras.map((b) => {
          const name = (b.crew_members as { name: string } | null)?.name;
          return (
            <li key={b.id} className="flex items-center gap-3 px-4 py-2.5">
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{b.role}</span>
                {name && <span className="text-muted-foreground"> · {name}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">Not yet confirmed</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/* ---------------- Custom checklists (producers add checklists + items, e.g. "Wardrobe checklist") ---------------- */
type ChecklistItemPhoto = { id: string; path: string; sort_order: number };
type ChecklistItem = { id: string; label: string; done: boolean; production_checklist_item_photos: ChecklistItemPhoto[] };

function ChecklistItemPhotoThumb({ photo, index, count, canEdit, onDelete, onMove }: {
  photo: ChecklistItemPhoto; index: number; count: number; canEdit: boolean; onDelete: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const url = useSignedUrl(photo.path).data;
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1">
      <div className="relative">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Photo ${index + 1}`} className="h-16 w-16 rounded-sm object-cover" /></a>
        ) : (
          <div className="h-16 w-16 animate-pulse rounded-sm bg-muted" />
        )}
        {canEdit && (
          <button onClick={onDelete} aria-label="Remove photo"
            className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 text-xs">
          <button onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move photo earlier" className="rounded-sm border border-border px-1.5 text-muted-foreground hover:text-primary disabled:opacity-30">←</button>
          <span className="w-4 text-center font-semibold">{index + 1}</span>
          <button onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move photo later" className="rounded-sm border border-border px-1.5 text-muted-foreground hover:text-primary disabled:opacity-30">→</button>
        </div>
      )}
    </div>
  );
}

export function ChecklistsPanel({ p, isProducer }: Pick<Ctx, "p" | "isProducer">) {
  const inv = useInvalidate();
  const checklists = (useChecklists(p.id).data ?? []) as Array<{ id: string; title: string; production_checklist_items: ChecklistItem[] }>;
  const [addingList, setAddingList] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const [uploadingItem, setUploadingItem] = useState<string | null>(null);

  async function addChecklist() {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from("production_checklists").insert({ production_id: p.id, title: newTitle.trim(), sort_order: checklists.length });
    if (error) { toast.error(friendlyError(error)); return; }
    setNewTitle("");
    setAddingList(false);
    inv(["checklists", p.id]);
  }

  async function removeChecklist(id: string) {
    const { error } = await supabase.from("production_checklists").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["checklists", p.id]);
  }

  async function addItem(checklistId: string, count: number) {
    const label = (newItem[checklistId] ?? "").trim();
    if (!label) return;
    const { error } = await supabase.from("production_checklist_items").insert({ checklist_id: checklistId, label, sort_order: count });
    if (error) { toast.error(friendlyError(error)); return; }
    setNewItem((prev) => ({ ...prev, [checklistId]: "" }));
    inv(["checklists", p.id]);
  }

  async function toggleItem(id: string, done: boolean) {
    const { error } = await supabase.from("production_checklist_items").update({ done: !done }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["checklists", p.id]);
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("production_checklist_items").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["checklists", p.id]);
  }

  async function addPhotos(itemId: string, files: FileList | null) {
    if (!files?.length) return;
    setUploadingItem(itemId);
    try {
      const { count } = await supabase.from("production_checklist_item_photos").select("id", { count: "exact", head: true }).eq("item_id", itemId);
      let next = count ?? 0;
      for (const file of Array.from(files)) {
        const path = await uploadFile(`${p.id}/checklist-photos/${itemId}`, file, file.name);
        const { error } = await supabase.from("production_checklist_item_photos").insert({ item_id: itemId, path, sort_order: next++ });
        if (error) throw error;
      }
      inv(["checklists", p.id]);
    } catch (e) { toast.error(friendlyError(e)); }
    setUploadingItem(null);
  }

  async function removePhoto(id: string) {
    const { error } = await supabase.from("production_checklist_item_photos").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["checklists", p.id]);
  }

  async function movePhoto(photos: ChecklistItemPhoto[], photoId: string, dir: -1 | 1) {
    const i = photos.findIndex((x) => x.id === photoId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= photos.length) return;
    const reordered = [...photos];
    [reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!];
    const results = await Promise.all(reordered.map((ph, k) => supabase.from("production_checklist_item_photos").update({ sort_order: k }).eq("id", ph.id)));
    const error = results.find((r) => r.error)?.error;
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["checklists", p.id]);
  }

  if (!isProducer && checklists.length === 0) return null;

  return (
    <div className="space-y-5">
      {checklists.map((c) => (
        <Panel key={c.id} title={c.title} right={isProducer && (
          <button onClick={() => removeChecklist(c.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${c.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
        )}>
          <ul className="divide-y divide-border text-sm">
            {c.production_checklist_items.length === 0 && <li className="p-4 text-muted-foreground">No items yet.</li>}
            {c.production_checklist_items.map((item) => (
              <li key={item.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <button onClick={() => isProducer && toggleItem(item.id, item.done)} disabled={!isProducer} aria-label={item.done ? `Mark ${item.label} not done` : `Mark ${item.label} done`}>
                    {item.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>
                  <span className={`min-w-0 flex-1 ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.label}</span>
                  {isProducer && uploadingItem === item.id && <span className="text-xs text-muted-foreground">Uploading…</span>}
                  {isProducer && uploadingItem !== item.id && (
                    <>
                      <label className="cursor-pointer text-muted-foreground hover:text-primary" aria-label={`Take photo for ${item.label}`}>
                        <Camera className="h-4 w-4" />
                        <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addPhotos(item.id, e.target.files); e.target.value = ""; }} />
                      </label>
                      <label className="cursor-pointer text-muted-foreground hover:text-primary" aria-label={`Upload photos for ${item.label}`}>
                        <ImageUp className="h-4 w-4" />
                        <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(item.id, e.target.files); e.target.value = ""; }} />
                      </label>
                    </>
                  )}
                  {isProducer && <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${item.label}`}><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
                {item.production_checklist_item_photos.length > 0 && (() => {
                  const photos = [...item.production_checklist_item_photos].sort((a, b) => a.sort_order - b.sort_order);
                  return (
                    <div className="ml-7 mt-2 flex flex-wrap gap-3">
                      {photos.map((photo, idx) => (
                        <ChecklistItemPhotoThumb key={photo.id} photo={photo} index={idx} count={photos.length} canEdit={isProducer}
                          onDelete={() => removePhoto(photo.id)} onMove={(dir) => movePhoto(photos, photo.id, dir)} />
                      ))}
                    </div>
                  );
                })()}
              </li>
            ))}
          </ul>
          {isProducer && (
            <form onSubmit={(e) => { e.preventDefault(); addItem(c.id, c.production_checklist_items.length); }} className="flex gap-2 border-t border-border p-3">
              <input className={`${input} flex-1`} placeholder="Add item…" value={newItem[c.id] ?? ""} onChange={(e) => setNewItem((prev) => ({ ...prev, [c.id]: e.target.value }))} />
              <button type="submit" className={btn}>Add</button>
            </form>
          )}
        </Panel>
      ))}

      {isProducer && (
        addingList ? (
          <div className="flex gap-2 rounded-sm border border-border bg-card p-3">
            <input autoFocus className={`${input} flex-1`} placeholder="Checklist name, e.g. Wardrobe checklist"
              value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addChecklist(); if (e.key === "Escape") { setAddingList(false); setNewTitle(""); } }} />
            <button onClick={addChecklist} className={btn}>Add</button>
            <button onClick={() => { setAddingList(false); setNewTitle(""); }} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAddingList(true)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add checklist</button>
        )
      )}
    </div>
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
            {isProducer && <><dt>Budget</dt><dd className="text-foreground">{fmtMoney(p.budget, p.currency)}</dd></>}
          </dl>
        </div>
      </Panel>

      <Panel title="Locations">
        <LocationPoints p={p} isProducer={isProducer} />
      </Panel>
    </div>
  );
}

/* ---------------- Members (only producers can rate; crew never rate anyone) ---------------- */
export function MembersList({ p, userId, isProducer }: Ctx) {
  const members = (useSiteMembers(p.id).data ?? []).filter((m) => CONFIRMED_BOOKING_STATUSES.includes(m.booking_status));
  const rows = useRegister(p.id).data ?? [];
  const inv = useInvalidate();
  const [rating, setRating] = useState<{ crewId: string; name: string } | null>(null);
  const [fitRole, setFitRole] = useState<string | null>(null);
  const crewDirectory = useCrew().data ?? [];
  const cancelBooking = useCancelBooking();

  async function removeMember(m: { crew_id: string; name: string }) {
    if (!window.confirm(`Remove ${m.name} from this production? If the shoot is close, the cancellation penalty applies.`)) return;
    const { data: rows, error: lookupErr } = await supabase.from("bookings").select("id").eq("production_id", p.id).eq("crew_id", m.crew_id).neq("status", "cancelled");
    if (lookupErr || !rows?.length) { toast.error("Couldn't find this crew member's booking."); return; }
    try {
      for (const r of rows) await cancelBooking.mutateAsync({ bookingId: r.id, reason: "Removed by the production team" });
      toast.success(`${m.name} removed`);
      inv(["site-members", p.id]);
    } catch {
      toast.error("Couldn't remove that crew member.");
    }
  }
  const lastByCrew = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.crew_id && !lastByCrew.has(r.crew_id)) lastByCrew.set(r.crew_id, r);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isShootDay = !!p.date && todayStr >= p.date && todayStr <= (p.endDate ?? p.date);
  const shootStarted = !!p.date && todayStr >= p.date;
  const isActive = p.status === "Active";

  async function mark(kind: "in" | "out", crewId: string, name: string) {
    const { error } = await supabase.from("site_attendance").insert({ production_id: p.id, crew_id: crewId, user_id: userId, person_name: name, kind, source: "manual" });
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["register", p.id]);
  }

  return (
    <div className="space-y-5">
      {isProducer && isActive && (() => {
        const st = members.map((m) => { const l = lastByCrew.get(m.crew_id); return !l ? "na" : l.kind === "in" ? "on" : "out"; });
        const cards: [string, number | string, string][] = [
          ["On set", st.filter((s) => s === "on").length, "text-success"],
          ["Not arrived", isShootDay ? st.filter((s) => s === "na").length : "—", "text-destructive"],
          ["Wrapped", st.filter((s) => s === "out").length, "text-muted-foreground"],
        ];
        return (
          <div className="grid grid-cols-3 gap-3">
            {cards.map(([l, v, c]) => (
              <div key={l} className="rounded-xl border border-border bg-card p-4 shadow-sm"><div className="text-xs text-muted-foreground">{l}</div><div className={`mt-1 font-display text-3xl font-semibold ${c}`}>{v}</div></div>
            ))}
          </div>
        );
      })()}
      <CrewRoleStatus p={p} onFind={setFitRole} />
      {fitRole ? (
        <FitCrewPanel role={fitRole} crew={crewDirectory} confirmedIds={new Set(members.map((m) => m.crew_id))} onClear={() => setFitRole(null)} />
      ) : (
      <Panel title={`${isActive ? "Crew on Set" : "Confirmed Crew"} (${members.length})`}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4">Status</th>
              <th className="px-4">Last movement</th>
              {isProducer && <th className="px-4">Mark</th>}
              {isProducer && <th className="px-4" />}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={isProducer ? 5 : 2} className="px-4 py-3 text-sm text-muted-foreground">No crew confirmed yet.</td></tr>}
            {members.map((m) => {
              const l = lastByCrew.get(m.crew_id);
              const status = !l ? (shootStarted ? "Not arrived" : "Not started") : l.kind === "in" ? "On set" : "Wrapped";
              return (
                <tr key={m.crew_id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} path={m.photo_url} />
                      <div className="min-w-0">
                        <Link to="/crew/$id" params={{ id: m.crew_id }} className="block truncate text-sm font-semibold hover:text-primary">{m.name}</Link>
                        <div className="truncate text-xs text-muted-foreground">{m.role} · {m.department}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4"><Badge>{status}</Badge></td>
                  <td className="px-4 text-xs text-muted-foreground">{l ? `${l.kind === "in" ? "In" : "Out"} · ${when(l.created_at)}${l.distance_m != null ? ` · ${l.distance_m}m` : ""}` : "—"}</td>
                  {isProducer && (
                    <td className="px-4">
                      <div className="flex gap-2">
                        <button className="text-xs text-primary hover:underline" onClick={() => mark("in", m.crew_id, m.name)}>In</button>
                        <button className="text-xs text-primary hover:underline" onClick={() => mark("out", m.crew_id, m.name)}>Out</button>
                      </div>
                    </td>
                  )}
                  {/* Only the production team rates crew — crew never rate anyone, including each other. */}
                  {isProducer && (
                    <td className="px-4">
                      <div className="flex gap-2">
                        <button onClick={() => removeMember(m)} aria-label={`Remove ${m.name}`} title="Remove from production" className="grid h-6 w-6 place-items-center rounded-sm border border-destructive text-destructive hover:bg-destructive/10"><Minus className="h-3.5 w-3.5" /></button>
                        {m.user_id !== userId && <button onClick={() => setRating({ crewId: m.crew_id, name: m.name })} className="rounded-sm border border-primary px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10">Rate me</button>}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      )}
      {rating && <RateDialog {...rating} productionId={p.id} onClose={() => setRating(null)} />}
    </div>
  );
}

function FitCrewPanel({ role, crew, confirmedIds, onClear }: { role: string; crew: Crew[]; confirmedIds: Set<string>; onClear: () => void }) {
  const key = role.trim().toLowerCase();
  const fits = crew.filter((c) => c.role.trim().toLowerCase() === key);
  return (
    <Panel title={`Crew who fit ${role} (${fits.length})`} right={<button onClick={onClear} className="text-xs font-semibold text-primary hover:underline">Back to crew list</button>}>
      {fits.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No crew on the register are listed as {role}.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {fits.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link to="/crew/$id" params={{ id: c.id }} className="block truncate font-semibold hover:text-primary">{c.name}</Link>
                <div className="truncate text-xs text-muted-foreground">{c.role} · {c.department} · {zar(c.dayRate)}/day</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {confirmedIds.has(c.id) && <Badge>Confirmed</Badge>}
                <Badge>{c.available ? "Available" : "Unavailable"}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
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
  const points = useLocationPoints(p.id).data ?? [];
  const inv = useInvalidate();
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(pendingCount());
  const rows = reg.data ?? [];
  const lastByCrew = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (r.crew_id && !lastByCrew.has(r.crew_id)) lastByCrew.set(r.crew_id, r);
  const myLast = myCrewId ? lastByCrew.get(myCrewId) : undefined;
  // The production's own address/lat/long fields were retired in favour of locations —
  // use the first location with coordinates as the site to geofence against.
  const sitePoint = points.find((pt) => pt.latitude != null && pt.longitude != null);
  const siteLat = sitePoint?.latitude ?? p.latitude;
  const siteLon = sitePoint?.longitude ?? p.longitude;
  const hasSite = siteLat != null && siteLon != null;
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
    const distance = coords && hasSite ? distanceMeters(coords.latitude, coords.longitude, siteLat!, siteLon!) : null;
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
      const d = distanceMeters(pos.coords.latitude, pos.coords.longitude, siteLat!, siteLon!);
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
      {isProducer && <OvertimeApprovals production={p.name} />}
      {!hasSite && <p className="rounded-sm border border-primary/40 bg-primary/10 p-3 text-sm">No location has an address with coordinates yet{isProducer ? " — add one under Locations so check-ins can be verified." : ", so check-ins can't be verified yet."}</p>}
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
      {p.status === "Active" && (
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
      )}
    </div>
  );
}

/* ---------------- Tasks ---------------- */
export function TasksTab({ p, userId }: Ctx) {
  const tasks = useTasks(p.id).data ?? [];
  const members = useSiteMembers(p.id).data ?? [];
  const inv = useInvalidate();
  const [f, setF] = useState({ title: "", crew: "", due: "" });
  const assigneeLabel = (crewId: string | null) => {
    const m = members.find((x) => x.crew_id === crewId);
    return m ? (m.user_id === userId ? "Self" : m.name) : "";
  };
  async function togglePublic(id: string, is_public: boolean) {
    const { error } = await supabase.from("site_tasks").update({ is_public }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    inv(["tasks", p.id]);
  }
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
        <select className={input} value={f.crew} onChange={(e) => setF({ ...f, crew: e.target.value })}><option value="">Unassigned</option>{members.map((m) => <option key={m.crew_id} value={m.crew_id}>{m.user_id === userId ? "Self" : m.name}</option>)}</select>
        <input type="date" className={input} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        <button onClick={add} className={btn}>Add task</button>
      </div>
      <ul className="divide-y divide-border">
        {tasks.length === 0 && <li className="p-4 text-sm text-muted-foreground">No tasks yet.</li>}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
            <button aria-label={t.done ? "Mark not done" : "Mark done"} onClick={() => toggle(t.id, !t.done)}>{t.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}</button>
            <span className={`flex-1 text-sm ${t.done ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
            <button onClick={() => togglePublic(t.id, !t.is_public)} aria-label={t.is_public ? "Make private" : "Post to the team"}
              className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.is_public ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {t.is_public ? "Public" : "Private"}
            </button>
            <span className="text-xs text-muted-foreground">{assigneeLabel(t.assigned_crew_id)}{t.due_date ? ` · due ${t.due_date}` : ""}</span>
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
      <p className="text-sm text-muted-foreground">{isProducer ? "Tick the equipment and props from each provider's inventory that Dial a Crew has selected for this job. Each fee is added to that provider's total." : "Equipment and props selected for this job."}</p>
      {isProducer && rows.length > 0 && (
        <div className="flex items-center justify-between rounded-sm border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold">Running cost as selected</span>
          <span className="font-display text-2xl font-bold text-primary">{fmtMoney(grandTotal, p.currency)}</span>
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
          ? [["Budget", fmtMoney(p.budget, p.currency)], ["Quoted to client", fmtMoney(billing, p.currency)], ["Crew booked", `${p.crewBooked}/${p.crewNeeded}`], ["Secured funds", fmtMoney(p.securedFunds, p.currency)], ["Balance due", fmtMoney(Math.max(0, billing - p.securedFunds), p.currency)]]
          : [["Budget", fmtMoney(p.budget, p.currency)], ["Running cost", fmtMoney(running, p.currency)], ["Client billing", fmtMoney(billing, p.currency)], ["Margin", fmtMoney(billing - running, p.currency)], ["Budget left", fmtMoney(p.budget - running, p.currency)]]
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
