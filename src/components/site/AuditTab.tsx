import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { useLocationPoints, useSiteMembers } from "@/lib/site";

type Event = { id: string; at: string; text: string; detail?: string | undefined };

const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dayLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });

// Each event belongs to the location whose scheduled window contains it. A location without an end time
// covers its start day. Anything outside every window is Unassigned.
function locationFor(at: number, locations: { label: string; starts_at: string | null; ends_at: string | null }[]) {
  for (const l of locations) {
    if (!l.starts_at) continue;
    const start = new Date(l.starts_at).getTime();
    const end = l.ends_at ? new Date(l.ends_at).getTime() : null;
    if (end !== null ? at >= start && at <= end : dayKey(l.starts_at) === dayKey(new Date(at).toISOString())) return l.label;
  }
  return "Unassigned";
}

export function AuditTab({ p }: { p: { id: string } }) {
  const members = useSiteMembers(p.id).data ?? [];
  const locations = useLocationPoints(p.id).data ?? [];
  const nameOf = (crewId: string | null) => members.find((m) => m.crew_id === crewId)?.name ?? "Crew member";

  const events = useQuery({
    queryKey: ["audit", p.id],
    queryFn: async () => {
      const out: Event[] = [];
      const attendance = await supabase.from("site_attendance").select("id, kind, person_name, created_at, source").eq("production_id", p.id);
      for (const a of attendance.data ?? []) {
        out.push({ id: `att-${a.id}`, at: a.created_at, text: `${a.person_name || "Crew member"} checked ${a.kind === "in" ? "in" : "out"}`, detail: a.source === "manual" ? "Marked by producer" : "Self check-in" });
      }
      const wraps = await supabase.from("site_wraps").select("id, crew_id, wrapped_at, left_at").eq("production_id", p.id);
      for (const w of wraps.data ?? []) {
        out.push({ id: `wrap-${w.id}`, at: w.wrapped_at, text: `${nameOf(w.crew_id)} wrapped` });
        if (w.left_at) out.push({ id: `left-${w.id}`, at: w.left_at, text: `${nameOf(w.crew_id)} officially left site` });
      }
      const ot = await supabase.from("overtime_requests").select("id, crew_id, shift, status, decline_reason, requested_at, responded_at, accepted_at, ended_at").eq("production_id", p.id);
      for (const r of ot.data ?? []) {
        const who = nameOf(r.crew_id);
        const shift = r.shift === "night" ? "night" : "day";
        out.push({ id: `otreq-${r.id}`, at: r.requested_at, text: `Overtime requested from ${who}`, detail: `${shift} shift` });
        if (r.status === "accepted" && r.accepted_at) out.push({ id: `otacc-${r.id}`, at: r.accepted_at, text: `${who} accepted overtime`, detail: "Clock started" });
        if (r.status === "declined" && r.responded_at) out.push({ id: `otdec-${r.id}`, at: r.responded_at, text: `${who} declined overtime`, detail: r.decline_reason ?? undefined });
        if (r.ended_at) out.push({ id: `otend-${r.id}`, at: r.ended_at, text: `${who}'s overtime ended` });
      }
      const posts = await supabase.from("site_posts").select("id, author_name, body, created_at").eq("production_id", p.id);
      for (const po of posts.data ?? []) {
        out.push({ id: `post-${po.id}`, at: po.created_at, text: `${po.author_name || "Someone"} posted`, detail: po.body ? (po.body.length > 80 ? `${po.body.slice(0, 80)}…` : po.body) : undefined });
      }
      const photos = await supabase.from("site_photos").select("id, created_at").eq("production_id", p.id);
      for (const ph of photos.data ?? []) out.push({ id: `photo-${ph.id}`, at: ph.created_at, text: "Photo uploaded" });
      const tasks = await supabase.from("site_tasks").select("id, title, created_at").eq("production_id", p.id);
      for (const t of tasks.data ?? []) out.push({ id: `task-${t.id}`, at: t.created_at, text: `Task added: ${t.title}` });
      return out.sort((a, b) => a.at.localeCompare(b.at));
    },
  }).data ?? [];

  // day -> location -> events, both in order
  const groups = new Map<string, Map<string, Event[]>>();
  for (const e of events) {
    const day = dayKey(e.at);
    const loc = locationFor(new Date(e.at).getTime(), locations);
    if (!groups.has(day)) groups.set(day, new Map());
    const byLoc = groups.get(day)!;
    if (!byLoc.has(loc)) byLoc.set(loc, []);
    byLoc.get(loc)!.push(e);
  }
  const days = [...groups.keys()].sort();

  if (days.length === 0) {
    return <Panel title="Audit trail"><p className="p-4 text-sm text-muted-foreground">Nothing recorded yet. Check-ins, wraps, overtime, posts, photos and tasks will appear here as they happen.</p></Panel>;
  }

  return (
    <div className="space-y-5">
      {days.map((day) => (
        <Panel key={day} title={dayLabel(day)}>
          <div className="divide-y divide-border">
            {[...groups.get(day)!.entries()].map(([loc, items]) => (
              <div key={loc} className="p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">{loc}</div>
                <ul className="space-y-2 text-sm">
                  {items.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{timeLabel(e.at)}</span>
                      <span className="min-w-0 flex-1">
                        {e.text}
                        {e.detail && <span className="block text-xs text-muted-foreground">{e.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
