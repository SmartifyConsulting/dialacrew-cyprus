import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CheckSquare, ChevronLeft, ChevronRight, Square } from "lucide-react";
import { Page, clientColor } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { useBookings, useProductions } from "@/lib/db";
import { useMyCrewId } from "@/lib/site";
import { WEATHER_ICONS } from "@/lib/weather";
import { forecastSummary, isoDay, useCalendarExtras } from "@/lib/calendar-extras";

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

const iso = isoDay;

type DayItem = { id: string; productionId: string; name: string; client: string; crew: number; lat: number | null; lon: number | null };

function CalendarPage() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const isCrewOnly = role.data === "crew";
  const myCrewId = useMyCrewId(isCrewOnly).data ?? null;
  const prods = useProductions().data ?? [];
  const bookings = useBookings().data ?? [];
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [openTask, setOpenTask] = useState<string | null>(null);

  // Map every shoot and recce date to its production so each calendar day can show the matching forecast.
  const byDay = new Map<string, DayItem[]>();
  for (const p of prods) {
    if (p.recceDate) {
      const k = p.recceDate;
      const crew = bookings.filter((b) => b.productionId === p.id && b.status !== "cancelled").length;
      byDay.set(k, [...(byDay.get(k) ?? []), {
        id: `${p.id}-recce`, productionId: p.id, name: `Recce · ${p.name}`, client: p.client, crew: isCrewOnly ? 0 : crew,
        lat: p.latitude ?? null, lon: p.longitude ?? null,
      }]);
    }
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
      byDay.set(k, [...(byDay.get(k) ?? []), { id: p.id, productionId: p.id, name: p.name, client: p.client, crew: isCrewOnly ? 0 : crew, lat: p.latitude ?? null, lon: p.longitude ?? null }]);
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

  // Weather per day (from that day's location) and the tasks due this month.
  const monthStart = iso(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthEnd = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const { forecastFor, tasksByDay } = useCalendarExtras(byDay, monthStart, monthEnd);

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
                <p className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground" title={forecastSummary(weather)}>
                  <span className="text-sm leading-none" aria-hidden="true">{WEATHER_ICONS[weather.code] ?? "🌡️"}</span>
                  {weather.max != null && weather.min != null ? `${Math.round(weather.min)}–${Math.round(weather.max)}°` : ""}
                </p>
              )}
              {items.map((it) => (
                <Link key={it.id} to="/productions/$id" params={{ id: it.productionId }} title={it.name} className={`mb-1 block truncate rounded-xl px-1.5 py-0.5 text-xs font-medium hover:opacity-90 ${clientColor(it.client)}`}>
                  {it.name}{it.crew ? ` · ${it.crew} crew` : ""}
                </Link>
              ))}
              {dayTasks.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {dayTasks.map((t) => (
                    <button key={t.id} type="button" onClick={() => setOpenTask(openTask === t.id ? null : t.id)} aria-label={`${t.done ? "Done" : "To do"}: ${t.title}`}
                      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md ${t.done ? "bg-success/20 text-success" : "bg-primary/20 text-primary"}`}>
                      {t.done ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      {openTask === t.id && (
                        <span className="absolute left-0 top-full z-10 mt-1 w-48 rounded-md border border-border bg-card p-2 text-left text-xs text-foreground shadow-lg">
                          <span className="block font-semibold text-muted-foreground">{t.done ? "Done" : "To do"}</span>
                          {t.title}
                        </span>
                      )}
                    </button>
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
