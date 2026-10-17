import { useQueries, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { WEATHER_CODES, fetchDailyForecast, type DayForecast } from "@/lib/weather";

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const coordKey = (lat: number, lon: number) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

export type DayShoot = { id: string; lat: number | null; lon: number | null };

export const forecastSummary = (w: DayForecast) =>
  `${WEATHER_CODES[w.code] ?? "Mixed"}${w.max != null && w.min != null ? ` · ${Math.round(w.min)}–${Math.round(w.max)}°C` : ""}${w.rain != null ? ` · ${Math.round(w.rain)}% rain` : ""}`;

// Weather and tasks for a calendar. Each day's forecast point is a location scheduled that day, else the
// production's own coordinates; tasks are those due between `from` and `to` that the user can see (RLS decides).
export function useCalendarExtras(byDay: Map<string, DayShoot[]>, from: string, to: string) {
  const locations = useQuery({
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
      const loc = locations.find((l) => l.production_id === it.id && l.starts_at && isoDay(new Date(l.starts_at)) === day && l.latitude != null && l.longitude != null);
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
  const forecastFor = (day: string): DayForecast | null => {
    const pt = dayPoints.get(day);
    if (!pt) return null;
    const idx = uniqueCoords.findIndex((c) => c.key === pt.key);
    return forecasts[idx]?.data?.[day] ?? null;
  };

  const tasks = useQuery({
    queryKey: ["calendar-tasks", from],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_tasks").select("id, title, done, due_date, production_id")
        .gte("due_date", from).lte("due_date", to).order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  }).data ?? [];
  const tasksByDay = new Map<string, typeof tasks>();
  for (const t of tasks) if (t.due_date) tasksByDay.set(t.due_date, [...(tasksByDay.get(t.due_date) ?? []), t]);

  return { forecastFor, tasksByDay };
}
