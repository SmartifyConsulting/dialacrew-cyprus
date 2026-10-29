import { createFileRoute } from "@tanstack/react-router";
import { CONFIRMED, bookingInFromRow, buildCalendarEvents, prodInFromRow, toICS, type LocIn } from "@/lib/calendar-events";

// Private, read-only calendar subscription feed. The secret token in the URL identifies the user; we rebuild
// exactly the events that user may see (same builder as the app) and never include addresses they can't see.
export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token.replace(/\.ics$/i, "");
        if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { data: feed } = await db.from("calendar_feed_tokens").select("user_id").eq("token", token).maybeSingle();
        if (!feed) return new Response("Not found", { status: 404 });
        const uid = feed.user_id;
        const [{ data: roles }, { data: prof }] = await Promise.all([
          db.from("user_roles").select("role").eq("user_id", uid),
          db.from("profiles").select("suspended").eq("id", uid).maybeSingle(),
        ]);
        if (prof?.suspended) return new Response("Not found", { status: 404 });
        const r = new Set((roles ?? []).map((x) => x.role));
        let events: ReturnType<typeof buildCalendarEvents> = [];
        if (r.has("producer") || r.has("admin")) {
          const [{ data: prods }, { data: locs }, { data: books }] = await Promise.all([
            db.from("productions").select("*"), db.from("production_locations").select("*"), db.from("bookings").select("*"),
          ]);
          events = buildCalendarEvents((prods ?? []).map(prodInFromRow), (locs ?? []) as LocIn[], (books ?? []).map(bookingInFromRow), { canSeeAddress: () => true });
        } else if (r.has("crew")) {
          const { data: crew } = await db.from("crew_members").select("id").eq("user_id", uid).maybeSingle();
          if (crew) {
            const { data: books } = await db.from("bookings").select("*").eq("crew_id", crew.id).neq("status", "cancelled");
            const mine = (books ?? []).map(bookingInFromRow);
            const ids = [...new Set(mine.map((b) => b.productionId))];
            if (ids.length) {
              const [{ data: prods }, { data: locs }] = await Promise.all([
                db.from("productions").select("*").in("id", ids), db.from("production_locations").select("*").in("production_id", ids),
              ]);
              const confirmed = new Set(mine.filter((b) => CONFIRMED.includes(b.status)).map((b) => b.productionId));
              const can = (pid: string) => confirmed.has(pid);
              events = buildCalendarEvents(
                (prods ?? []).map(prodInFromRow).map((p) => ({ ...p, address: can(p.id) ? p.address : null })),
                ((locs ?? []) as LocIn[]).map((l) => ({ ...l, address: can(l.production_id) ? l.address : null })),
                mine, { canSeeAddress: can, crewBooking: (pid) => mine.find((b) => b.productionId === pid) ?? null },
              );
            }
          }
        }
        return new Response(toICS(events, "Book a Crew"), {
          headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900", "Content-Disposition": 'inline; filename="book-a-crew.ics"' },
        });
      },
    },
  },
});
