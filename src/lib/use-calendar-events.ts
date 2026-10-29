import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import { useBookings, useProductions } from "@/lib/db";
import { useMyCrewId } from "@/lib/site";
import type { Production } from "@/lib/demo-data";
import { CONFIRMED, buildCalendarEvents, findConflicts, type BookingIn, type LocIn, type ProdIn } from "@/lib/calendar-events";

const toProdIn = (p: Production): ProdIn => ({
  id: p.id, name: p.name, client: p.client, location: p.location, address: p.address ?? null, date: p.date || null, days: p.days,
  timezone: p.timezone ?? null, latitude: p.latitude ?? null, longitude: p.longitude ?? null,
  recceDate: p.recceDate ?? null, recceStart: p.recceStart ?? null, recceEnd: p.recceEnd ?? null,
  gearPickupDate: p.gearPickupDate ?? null, gearPickupTime: p.gearPickupTime ?? null, gearDropoffDate: p.gearDropoffDate ?? null, gearDropoffTime: p.gearDropoffTime ?? null,
});

/** The signed-in user's authorized calendar events — used by the full calendar, the dashboard calendar and .ics download. */
export function useCalendarEvents() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const isCrewOnly = role.data === "crew";
  const myCrewId = useMyCrewId(isCrewOnly).data ?? null;
  const prods = useProductions().data ?? [];
  const bookings = useBookings().data ?? [];
  const confirmedIds = new Set(bookings.filter((b) => b.crewId === myCrewId && CONFIRMED.includes(b.status)).map((b) => b.productionId));

  // Base location fields carry no street address; addresses are fetched only where the viewer may see them.
  const locations = useQuery({
    queryKey: ["calendar-locations", "events"],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_locations")
        .select("id, production_id, label, recce_date, recce_start_time, recce_end_time, starts_at, ends_at, latitude, longitude, sort_order").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  }).data ?? [];
  const addressIds = isCrewOnly ? [...confirmedIds].sort() : null;
  const addresses = useQuery({
    queryKey: ["calendar-location-addresses", isCrewOnly, addressIds?.join(",") ?? "all"],
    enabled: role.isSuccess && (!isCrewOnly || confirmedIds.size > 0),
    queryFn: async () => {
      let q = supabase.from("production_locations").select("id, address");
      if (addressIds) q = q.in("production_id", addressIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  }).data ?? [];
  const addrById = new Map(addresses.map((a) => [a.id, a.address]));
  const locs: LocIn[] = locations.map((l) => ({ ...l, address: addrById.get(l.id) ?? null }));

  const bIn: BookingIn[] = bookings.map((b) => ({ productionId: b.productionId, crewId: b.crewId ?? null, status: b.status, bookingDate: b.bookingDate ?? null, callTime: b.callTime ?? null, wrapTime: b.wrapTime ?? null, days: b.days }));
  const canSeeAddress = (pid: string) => !isCrewOnly || confirmedIds.has(pid);
  const visibleProds = (isCrewOnly ? prods.filter((p) => bIn.some((b) => b.productionId === p.id && b.crewId === myCrewId && b.status !== "cancelled")) : prods)
    .map((p) => ({ ...toProdIn(p), address: canSeeAddress(p.id) ? p.address ?? null : null }));
  const events = buildCalendarEvents(visibleProds, locs, bIn, {
    canSeeAddress,
    crewBooking: isCrewOnly ? (pid) => bIn.find((b) => b.productionId === pid && b.crewId === myCrewId && b.status !== "cancelled") ?? null : undefined,
  });
  const crewCount = (pid: string) => bookings.filter((b) => b.productionId === pid && b.status !== "cancelled").length;
  return { events, conflicts: findConflicts(events), isCrewOnly, crewCount };
}

export const EVENT_CHIP: Record<"shoot" | "recce" | "gear", string> = {
  shoot: "",
  recce: "bg-black text-white",
  gear: "bg-purple-700 text-white",
};
