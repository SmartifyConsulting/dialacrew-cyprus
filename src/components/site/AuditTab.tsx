import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { useLocationPoints, useSiteMembers } from "@/lib/site";

type Event = { id: string; at: string; text: string; detail?: string | undefined; actor?: string; type?: string };

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
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("");
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
      const completion = await supabase.from("productions").select("completed_at, completed_by").eq("id", p.id).maybeSingle();
      if (completion.data?.completed_at) out.push({ id: `completion-${p.id}`, at: completion.data.completed_at, actor: completion.data.completed_by ?? "Producer", type: "Production completion", text: `${completion.data.profiles?.full_name ?? "Producer"} completed and locked the production` });
      const acknowledgements = await supabase.from("notification_acknowledgement_audit").select("id, actor_name, activity_type, notification_title, occurred_at").eq("production_id", p.id);
      if (acknowledgements.error) throw acknowledgements.error;
      for (const a of acknowledgements.data ?? []) out.push({ id: `ack-${a.id}`, at: a.occurred_at, actor: a.actor_name, type: a.activity_type, text: `${a.actor_name} acknowledged notification`, detail: a.notification_title });
      return out.sort((a, b) => b.at.localeCompare(a.at));
    },
  }).data ?? [];

  // Search across actor, activity and detail, with optional exact date and activity type.
  const activityOf = (e: Event) => e.type ?? ({ att: "Attendance", wrap: "Wrap", left: "Departure", otreq: "Overtime", otacc: "Overtime", otdec: "Overtime", otend: "Overtime", post: "Post", photo: "Photo", task: "Task" } as Record<string, string>)[e.id.split("-")[0]] ?? "Other";
  const types = [...new Set(events.map(activityOf))].sort();
  const filtered = events.filter((e) => {
    const needle = search.trim().toLowerCase();
    return (!filterDate || dayKey(e.at) === filterDate) && (!filterType || activityOf(e) === filterType) && (!needle || [e.text, e.detail, e.actor, activityOf(e), new Date(e.at).toLocaleString("en-ZA")].join(" ").toLowerCase().includes(needle));
  });
  const groups = new Map<string, Map<string, Event[]>>();
  for (const e of filtered) {
    const day = dayKey(e.at);
    const loc = locationFor(new Date(e.at).getTime(), locations);
    if (!groups.has(day)) groups.set(day, new Map());
    const byLoc = groups.get(day)!;
    if (!byLoc.has(loc)) byLoc.set(loc, []);
    byLoc.get(loc)!.push(e);
  }
  const days = [...groups.keys()].sort().reverse();

  return (
    <div className="space-y-4">
      <Panel title="Audit trail — activity history">
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <label className="text-xs font-semibold">Search name or activity
            <input aria-label="Search audit trail" className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder="Person, action, detail..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="text-xs font-semibold">Date
            <input type="date" aria-label="Filter audit by date" className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </label>
          <label className="text-xs font-semibold">Activity type
            <select aria-label="Filter audit by activity" className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">All activities</option>
              {types.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        </div>
        <p className="px-4 pb-3 text-xs text-muted-foreground">{filtered.length} of {events.length} recorded activities</p>
      </Panel>
      {days.length === 0 && <Panel title="No matching activity"><p className="p-4 text-sm text-muted-foreground">No audit records match these filters.</p></Panel>}
      {days.map((day, index) => (
        <details key={day} open={index === 0} className="overflow-hidden rounded-md border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 font-semibold">{dayLabel(day)} <span className="ml-2 text-xs font-normal text-muted-foreground">({[...groups.get(day)!.values()].reduce((n, a) => n + a.length, 0)} activities)</span></summary>
          <div className="divide-y divide-border">
            {[...groups.get(day)!.entries()].map(([loc, items]) => (
              <div key={loc} className="p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">{loc}</div>
                <ul className="space-y-3 text-sm">
                  {items.map((e) => (
                    <li key={e.id} className="flex gap-3 border-b border-border/40 pb-2">
                      <time dateTime={e.at} className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{new Date(e.at).toLocaleString("en-ZA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                      <span className="min-w-0 flex-1">
                        <span className="mb-1 block text-xs font-semibold text-primary">{activityOf(e).replaceAll("_", " ")}</span>
                        <span className="block">{e.text}</span>
                        {e.actor && <span className="block text-xs text-muted-foreground">By {e.actor}</span>}
                        {e.detail && <span className="block text-xs text-muted-foreground">{e.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
