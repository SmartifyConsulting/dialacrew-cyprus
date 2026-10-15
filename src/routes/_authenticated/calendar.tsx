import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Page, clientColor } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { useBookings, useProductions } from "@/lib/db";
import { useMyCrewId } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Book a Crew" },
      { name: "description", content: "See shoot days and crew bookings by month." },
      { property: "og:title", content: "Calendar — Book a Crew" },
      { property: "og:description", content: "Monthly view of productions and bookings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function CalendarPage() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const isCrewOnly = role.data === "crew";
  const myCrewId = useMyCrewId(isCrewOnly).data ?? null;
  const prods = useProductions().data ?? [];
  const bookings = useBookings().data ?? [];
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  // map each day to the productions shooting on it (start date + days)
  const byDay = new Map<string, { id: string; name: string; client: string; crew: number }[]>();
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
      byDay.set(k, [...(byDay.get(k) ?? []), { id: p.id, name: p.name, client: p.client, crew: isCrewOnly ? 0 : crew }]);
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

  return (
    <Page title="Calendar" subtitle="Shoot days and crew booked, month by month." open>
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
          const items = d ? byDay.get(iso(d)) ?? [] : [];
          return (
            <div key={i} className="min-h-24 bg-card p-1.5">
              {d && <p className={`mb-1 text-xs font-semibold ${iso(d) === today ? "text-primary" : "text-muted-foreground"}`}>{d.getDate()}</p>}
              {items.map((it) => (
                <Link key={it.id} to="/productions/$id" params={{ id: it.id }} className={`mb-1 block truncate rounded-md px-1.5 py-0.5 text-xs font-medium hover:opacity-90 ${clientColor(it.client)}`}>
                  {it.name}{it.crew ? ` · ${it.crew} crew` : ""}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </Page>
  );
}
