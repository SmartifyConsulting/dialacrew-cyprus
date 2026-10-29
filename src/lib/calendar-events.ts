// One normalized calendar event model shared by the full calendar, the dashboard mini-calendar and ICS exports.
// Pure functions only (no browser or server imports) so the subscription feed builds exactly the same events.
import { groupRecces, type RecceLocation } from "@/lib/recce";

export const DEFAULT_TZ = "Africa/Johannesburg";

export type ProdIn = {
  id: string; name: string; client: string; location: string; address: string | null;
  date: string | null; days: number; timezone: string | null;
  latitude: number | null; longitude: number | null;
  recceDate: string | null; recceStart: string | null; recceEnd: string | null;
  gearPickupDate: string | null; gearPickupTime: string | null; gearDropoffDate: string | null; gearDropoffTime: string | null;
};
export type LocIn = RecceLocation & { starts_at: string | null; ends_at?: string | null; sort_order?: number | null };
export type BookingIn = { productionId: string; crewId: string | null; status: string; bookingDate: string | null; callTime: string | null; wrapTime: string | null; days: number };

export type EventKind = "shoot" | "recce" | "gear";
export type CalEvent = {
  // details is optional text
  uid: string; kind: EventKind; productionId: string; productionName: string; client: string; title: string;
  timezone: string;
  /** Local (production timezone) first and last calendar day the event touches. */
  day: string; endDay: string;
  /** Exact UTC instants; null means the time is not scheduled — never treated as midnight. */
  start: string | null; end: string | null;
  timeLabel: string; location: string; details?: string | undefined;
  lat: number | null; lon: number | null;
};

export type BuildOptions = {
  /** Whether the viewer may see exact street addresses for this production. */
  canSeeAddress: (productionId: string) => boolean;
  /** Crew view: restrict shoot days to the viewer's own booking span and times. */
  crewBooking?: ((productionId: string) => BookingIn | null) | undefined;
};

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

function tzOffsetMs(utcMs: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - utcMs;
}

/** Local wall-clock date + HH:MM in `tz` → exact UTC ISO string. */
export function zonedToUtc(date: string, time: string, tz: string = DEFAULT_TZ) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!);
  let ms = guess - tzOffsetMs(guess, tz);
  ms = guess - tzOffsetMs(ms, tz);
  return new Date(ms).toISOString();
}

export function localDay(iso: string, tz: string = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}
export function localTime(iso: string, tz: string = DEFAULT_TZ) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

function label(start: string | null, end: string | null, tz: string, day: string, endDay: string) {
  const s = start ? localTime(start, tz) : null;
  const e = end ? localTime(end, tz) : null;
  if (day !== endDay) return `${shortDay(day)} ${s ?? "time TBC"} → ${shortDay(endDay)} ${e ?? "time TBC"}`;
  if (s && e) return `${s}–${e}`;
  if (s) return `From ${s}`;
  if (e) return `Until ${e}`;
  return "Time TBC";
}

function make(e: Omit<CalEvent, "timeLabel">): CalEvent {
  return { ...e, timeLabel: label(e.start, e.end, e.timezone, e.day, e.endDay) };
}

export function buildCalendarEvents(prods: ProdIn[], locations: LocIn[], bookings: BookingIn[], opts: BuildOptions): CalEvent[] {
  const out: CalEvent[] = [];
  for (const p of prods) {
    const tz = p.timezone || DEFAULT_TZ;
    const exact = opts.canSeeAddress(p.id);
    const locs = locations.filter((l) => l.production_id === p.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const place = (l?: LocIn | null) => (exact ? l?.address || p.address || l?.label || p.location : l?.label || p.location) || "Location TBC";
    const base = { productionId: p.id, productionName: p.name, client: p.client, timezone: tz };

    // Location recces: one event per production per date, earliest start → latest end.
    const recceDays = new Set<string>();
    for (const g of groupRecces(locs)) {
      recceDays.add(g.date);
      const first = g.locations[0]!.loc as LocIn;
      out.push(make({
        ...base, uid: `recce-${p.id}-${g.date}`, kind: "recce", title: `Recce · ${p.name}`, day: g.date, endDay: g.date,
        start: g.start ? zonedToUtc(g.date, g.start, tz) : null, end: g.end ? zonedToUtc(g.date, g.end, tz) : null,
        location: g.locations.length > 1 ? `${g.locations.length} locations` : place(first),
        details: g.locations.map((x) => `Location ${x.index}: ${place(x.loc as LocIn)} · ${x.start && x.end ? `${x.start}–${x.end}` : x.start ? `From ${x.start}` : x.end ? `Until ${x.end}` : "Time TBC"}`).join("\n"),
        lat: first.latitude ?? p.latitude, lon: first.longitude ?? p.longitude,
      }));
    }
    if (p.recceDate && !recceDays.has(p.recceDate)) {
      const s = hm(p.recceStart), e = hm(p.recceEnd);
      out.push(make({
        ...base, uid: `recce-${p.id}-${p.recceDate}`, kind: "recce", title: `Recce · ${p.name}`, day: p.recceDate, endDay: p.recceDate,
        start: s ? zonedToUtc(p.recceDate, s, tz) : null, end: e ? zonedToUtc(p.recceDate, e, tz) : null,
        location: place(null), lat: p.latitude, lon: p.longitude,
      }));
    }

    // Gear check: one event from pickup through drop-off (may span several days).
    if (p.gearPickupDate) {
      const endDay = p.gearDropoffDate || p.gearPickupDate;
      const s = hm(p.gearPickupTime), e = hm(p.gearDropoffTime);
      out.push(make({
        ...base, uid: `gear-${p.id}`, kind: "gear", title: `Gear check · ${p.name}`, day: p.gearPickupDate, endDay,
        start: s ? zonedToUtc(p.gearPickupDate, s, tz) : null, end: e && p.gearDropoffDate ? zonedToUtc(p.gearDropoffDate, e, tz) : null,
        location: place(null), details: `Pickup ${shortDay(p.gearPickupDate)} ${s ?? "time TBC"} · Drop-off ${p.gearDropoffDate ? shortDay(p.gearDropoffDate) : "date TBC"} ${e ?? "time TBC"}`,
        lat: p.latitude, lon: p.longitude,
      }));
    }

    // Shoot days: location schedule times first, else crew call/wrap times, else unscheduled.
    const mine = opts.crewBooking?.(p.id) ?? null;
    if (opts.crewBooking && !mine) continue;
    const startDay = mine?.bookingDate || p.date;
    if (!startDay) continue;
    const span = Math.max(1, mine ? mine.days || 1 : p.days || 1);
    for (let i = 0; i < span; i++) {
      const day = addDays(startDay, i);
      const loc = locs.find((l) => l.starts_at && localDay(l.starts_at, tz) === day);
      let start: string | null = null, end: string | null = null;
      if (loc?.starts_at && (localTime(loc.starts_at, tz) !== "00:00" || loc.ends_at)) { start = loc.starts_at; end = loc.ends_at ?? null; }
      else {
        const dayBookings = mine ? [mine] : bookings.filter((b) => b.productionId === p.id && b.status !== "cancelled" && (b.bookingDate === day || (!b.bookingDate && i === 0)));
        const calls = dayBookings.map((b) => hm(b.callTime)).filter((t): t is string => !!t).sort();
        const wraps = dayBookings.map((b) => hm(b.wrapTime)).filter((t): t is string => !!t).sort();
        if (calls[0]) start = zonedToUtc(day, calls[0], tz);
        const w = wraps.at(-1);
        if (w && (!calls[0] || w > calls[0])) end = zonedToUtc(day, w, tz);
      }
      out.push(make({
        ...base, uid: `shoot-${p.id}-${day}`, kind: "shoot", title: p.name, day, endDay: day, start, end,
        location: place(loc), lat: loc?.latitude ?? p.latitude, lon: loc?.longitude ?? p.longitude,
      }));
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.start ?? "").localeCompare(b.start ?? ""));
}

/** UIDs of timed events that overlap a timed event from a different production. Unscheduled events never clash. */
export function findConflicts(events: CalEvent[]) {
  const timed = events.filter((e) => e.start && e.end).sort((a, b) => a.start!.localeCompare(b.start!));
  const clash = new Set<string>();
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j]!.start! < timed[i]!.end!; j++) {
      if (timed[i]!.productionId !== timed[j]!.productionId) { clash.add(timed[i]!.uid); clash.add(timed[j]!.uid); }
    }
  }
  return clash;
}

/** Group events by every local day they touch (multi-day gear checks show once, on their first day). */
export function eventsByDay(events: CalEvent[]) {
  const m = new Map<string, CalEvent[]>();
  for (const e of events) m.set(e.day, [...(m.get(e.day) ?? []), e]);
  return m;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utcStamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateStamp = (day: string) => day.replace(/-/g, "");
function fold(line: string) {
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 74) { parts.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  parts.push(rest);
  return parts.join("\r\n");
}

/** RFC 5545 calendar. Timed events use exact UTC instants; unscheduled ones are date-only, marked "time TBC" and free (not busy). */
export function toICS(events: CalEvent[], calName = "Book a Crew", now = new Date()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Book a Crew//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(calName)}`];
  const stamp = utcStamp(now.toISOString());
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@bookacrew`, `DTSTAMP:${stamp}`);
    if (e.start) {
      lines.push(`DTSTART:${utcStamp(e.start)}`);
      if (e.end) lines.push(`DTEND:${utcStamp(e.end)}`);
      lines.push(`SUMMARY:${esc(e.title)}`, "TRANSP:OPAQUE");
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateStamp(e.day)}`, `DTEND;VALUE=DATE:${dateStamp(addDays(e.endDay, 1))}`, `SUMMARY:${esc(`${e.title} (time TBC)`)}`, "TRANSP:TRANSPARENT");
    }
    lines.push(`LOCATION:${esc(e.location)}`);
    const desc = [e.client, e.timeLabel, e.details].filter(Boolean).join("\n");
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Map a raw productions row (DB snake_case) to the builder input. */
export const prodInFromRow = (r: any): ProdIn => ({
  id: r.id, name: r.name, client: r.client, location: r.location ?? "", address: r.address ?? null, date: r.date ?? null, days: r.days ?? 1,
  timezone: r.timezone ?? null, latitude: r.latitude ?? null, longitude: r.longitude ?? null,
  recceDate: r.recce_date ?? null, recceStart: r.recce_start_time ?? null, recceEnd: r.recce_end_time ?? null,
  gearPickupDate: r.gear_pickup_date ?? null, gearPickupTime: r.gear_pickup_time ?? null, gearDropoffDate: r.gear_dropoff_date ?? null, gearDropoffTime: r.gear_dropoff_time ?? null,
});
export const bookingInFromRow = (r: any): BookingIn => ({
  productionId: r.production_id, crewId: r.crew_id, status: r.status, bookingDate: r.booking_date ?? null, callTime: r.call_time ?? null, wrapTime: r.wrap_time ?? null, days: r.days ?? 1,
});
export const CONFIRMED = ["confirmed", "in_progress", "awaiting_review", "payment_released", "completed"];
