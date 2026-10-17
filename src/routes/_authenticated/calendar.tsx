import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckSquare, ChevronLeft, ChevronRight, Square } from "lucide-react";
import { Page, clientColor } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { useBookings, useProductions } from "@/lib/db";
import { useMyCrewId } from "@/lib/site";
import { WEATHER_CODES, WEATHER_ICONS, fetchDailyForecast } from "@/lib/weather";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Book a Crew" },
      { name: "description", content: "See shoot days, weather and tasks by month." },
      { property: "og:title", content: "Calendar — Book a Crew" },
      { property: "og:description", content: "Monthly view of productions, weather and tasks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const coordKey = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

type DayItem = { id: string; name: string; client: string; crew: number; lat: number | null; lon: number | null };

function CalendarPage() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const isCrewOnly = role.data === "crew";
  const myCrewId = useMyCrewId(isCrewOnly).data ?? null;
  const prods = useProductions().data ?? [];
  const bookings = useBookings().data ?? [];
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  // map each day to the productions shooting on it (start date + days)
  const byDay = new Map<string, DayItem[]>();
  for (const p of prods) {
    if (!p.date) continue;
    const myBooking = isCrewOnly ? bookings.find((b) => b.productionId === p.id && b.crewId === myCrewId && b.status !== "cancelled") : undefined;
    if (isCrewOnly && !myBooking) continue;
    const spanStart = isCrewOnly && myBooking?.bookingDate ? myBooking.bookingDate : p.date;
    const spanDays = isCrewOnly && myBooking ? Math.max(1, myBooking.days || 1) : Math.max(1, p.days);
    const start = new Date(`${spanStart}T00:00:00`);
    for (let i = 0; i < spanDays; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const k = iso(d);
      const crew = bookings.filter((b) => b.productionId === p.id && b.status !== "cancelled").length;
      byDay.set(k, [...(byDay.get(k) ?? []), { id: p.id, name: p.name, client: p.client, crew: isCrewOnly ? 0 : crew, lat: p.latitude ?? null, lon: p.longitude ?? null }]);
    }
  }

  const first = new Date(month);
  const offset = (first.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + daysIn) / 7) * 7 }, (_, i) => {
    const n = i - offset + 1;
    return n >= 1 && n <= daysIn ? new Date(month.getFullYear(), month.getMonth(), n) : null;
  });
  const today = iso(new Date());
  const shift = (m: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + m, 1));

  // Each day's forecast point: a location scheduled that day, else the production's own coordinates.
  const locationsQ = useQuery({
    queryKey: ["calendar-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_locations").select("production_id, latitude, longitude, starts_at").not("latitude", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  }).data ?? [];
  const dayPoint = (day: string) => {
    const items = byDay.get(day) ?? [];
    for (const it of items) {
      const loc = locationsQ.find((l) => l.production_id === it.id && l.starts_at && iso(new Date(l.starts_at)) === day && l.latitude != null && l.longitude != null);
      if (loc) return { lat: loc.latitude as number, lon: loc.longitude as number };
    }
    const withCoords = items.find((it) => it.lat != null && it.lon != null);
    return withCoords ? { lat: withCoords.lat as number, lon: withCoords.lon as number } : null;
  };
  const dayPoints = new Map<string, { key: string; lat: number; lon: number }>();
  for (const day of byDay.keys()) {
    const pt = dayPoint(day);
    if (pt) dayPoints.set(day, { key: coordKey(pt.lat, pt.lon), ...pt });
  }
  const uniqueCoords = [...new Map([...dayPoints.values()].map((c) => [c.key, c])).values()];
  const forecasts = useQueries({
    queries: uniqueCoords.map((c) => ({
      queryKey: ["forecast", c.key], queryFn: () => fetchDailyForecast(c.lat, c.lon), staleTime: 3 * 60 * 60 * 1000, retry: false,
    })),
  });
  const forecastFor = (day: string) => {
    const pt = dayPoints.get(day);
    if (!pt) return null;
    const idx = uniqueCoords.findIndex((c) => c.key === pt.key);
    return forecasts[idx]?.data?.[day] ?? null;
  };

  // Tasks due this month that the signed-in user can see (RLS decides which).
  const monthStart = iso(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthEnd = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const tasks = useQuery({
    queryKey: ["calendar-tasks", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_tasks").select("id, title, done, due_date, production_id")
        .gte("due_date", monthStart).lte("due_date", monthEnd).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  }).data ?? [];
  const tasksByDay = new Map<string, typeof tasks>();
  for (const t of tasks) if (t.due_date) tasksByDay.set(t.due_date, [...(tasksByDay.get(t.due_date) ?? []), t]);

  return (
    <Page title="Calendar" subtitle="Shoot days, weather and tasks, month by month." open>
      <div className="mb-4 flex items-center gap-3">
        <button aria-label="Previous month" onClick={() => shift(-1)} className="rounded-xl border border-border bg-card p-2"><ChevronLeft className="h-4 w-4" /></button>
        <h2 className="min-w-48 text-center text-xl">{month.toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}</h2>
        <button aria-label="Next month" onClick={() => shift(1)} className="rounded-xl border border-border bg-card p-2"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
        {cells.map((d, i) => {
          const key = d ? iso(d) : "";
          const items = d ? byDay.get(key) ?? [] : [];
          const weather = d ? forecastFor(key) : null;
          const dayTasks = d ? tasksByDay.get(key) ?? [] : [];
          return (
            <div key={i} className="min-h-28 min-w-0 bg-card p-1.5">
              {d && <p className={`mb-1 text-xs font-semibold ${key === today ? "text-primary" : "text-muted-foreground"}`}>{d.getDate()}</p>}
              {weather && (
                <p className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground" title={`${WEATHER_CODES[weather.code] ?? "Mixed"}${weather.max != null && weather.min != null ? ` · ${Math.round(weather.min)}–${Math.round(weather.max)}°C` : ""}${weather.rain != null ? ` · ${Math.round(weather.rain)}% rain` : ""}`}>
                  <span className="text-sm leading-none" aria-hidden="true">{WEATHER_ICONS[weather.code] ?? "🌡️"}</span>
                  {weather.max != null && weather.min != null ? `${Math.round(weather.min)}–${Math.round(weather.max)}°` : ""}
                </p>
              )}
              {items.map((it) => (
                <Link key={it.id} to="/productions/$id" params={{ id: it.id }} title={it.name} className={`mb-1 block truncate rounded-xl px-1.5 py-0.5 text-xs font-medium hover:opacity-90 ${clientColor(it.client)}`}>
                  {it.name}{it.crew ? ` · ${it.crew} crew` : ""}
                </Link>
              ))}
              {dayTasks.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {dayTasks.map((t) => (
                    <span key={t.id} title={`${t.done ? "Done" : "To do"}: ${t.title}`} aria-label={`${t.done ? "Done" : "To do"}: ${t.title}`}
                      className={`inline-flex h-5 w-5 cursor-default items-center justify-center rounded-sm ${t.done ? "bg-success/20 text-success" : "bg-primary/20 text-primary"}`}>
                      {t.done ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Page>
  );
}
