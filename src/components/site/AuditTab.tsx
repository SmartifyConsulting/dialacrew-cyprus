import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { useLocationPoints, useSiteMembers } from "@/lib/site";

type Event = { changes?: { field: string; before: unknown; after: unknown }[]; id: string; at: string; text: string; detail?: string | undefined; actor?: string; type?: string };

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
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("");
  const members = useSiteMembers(p.id).data ?? [];
  const locations = useLocationPoints(p.id).data ?? [];
  const nameOf = (crewId: string | null) => members.find((m) => m.crew_id === crewId)?.name ?? "Crew member";

  const eventsQuery = useQuery({
    queryKey: ["audit", p.id],
    queryFn: async () => {
      const out: Event[] = [];
      const attendance = await supabase.from("site_attendance").select("id, kind, person_name, created_at, source").eq("production_id", p.id);
      if (attendance.error) throw attendance.error;
      for (const a of attendance.data ?? []) {
        out.push({ id: `att-${a.id}`, at: a.created_at, text: `${a.person_name || "Crew member"} checked ${a.kind === "in" ? "in" : "out"}`, detail: a.source === "manual" ? "Marked by producer" : "Self check-in" });
      }
      const wraps = await supabase.from("site_wraps").select("id, crew_id, wrapped_at, left_at").eq("production_id", p.id);
      if (wraps.error) throw wraps.error;
      for (const w of wraps.data ?? []) {
        out.push({ id: `wrap-${w.id}`, at: w.wrapped_at, text: `${nameOf(w.crew_id)} wrapped` });
        if (w.left_at) out.push({ id: `left-${w.id}`, at: w.left_at, text: `${nameOf(w.crew_id)} officially left site` });
      }
      const ot = await supabase.from("overtime_requests").select("id, crew_id, shift, status, decline_reason, requested_at, responded_at, accepted_at, ended_at").eq("production_id", p.id);
      if (ot.error) throw ot.error;
      for (const r of ot.data ?? []) {
        const who = nameOf(r.crew_id);
        const shift = r.shift === "night" ? "night" : "day";
        out.push({ id: `otreq-${r.id}`, at: r.requested_at, text: `Overtime requested from ${who}`, detail: `${shift} shift` });
        if (r.status === "accepted" && r.accepted_at) out.push({ id: `otacc-${r.id}`, at: r.accepted_at, text: `${who} accepted overtime`, detail: "Clock started" });
        if (r.status === "declined" && r.responded_at) out.push({ id: `otdec-${r.id}`, at: r.responded_at, text: `${who} declined overtime`, detail: r.decline_reason ?? undefined });
        if (r.ended_at) out.push({ id: `otend-${r.id}`, at: r.ended_at, text: `${who}'s overtime ended` });
      }
      const posts = await supabase.from("site_posts").select("id, author_name, body, created_at").eq("production_id", p.id);
      if (posts.error) throw posts.error;
      for (const po of posts.data ?? []) {
        out.push({ id: `post-${po.id}`, at: po.created_at, text: `${po.author_name || "Someone"} posted`, detail: po.body ? (po.body.length > 80 ? `${po.body.slice(0, 80)}…` : po.body) : undefined });
      }
      const photos = await supabase.from("site_photos").select("id, created_at").eq("production_id", p.id);
      if (photos.error) throw photos.error;
      for (const ph of photos.data ?? []) out.push({ id: `photo-${ph.id}`, at: ph.created_at, text: "Photo uploaded" });
      const tasks = await supabase.from("site_tasks").select("id, title, created_at").eq("production_id", p.id);
      if (tasks.error) throw tasks.error;
      for (const t of tasks.data ?? []) out.push({ id: `task-${t.id}`, at: t.created_at, text: `Task added: ${t.title}` });
      const completion = await supabase.from("productions").select("completed_at, completed_by").eq("id", p.id).maybeSingle();
      if (completion.error) throw completion.error;
      if (completion.data?.completed_at) out.push({ id: `completion-${p.id}`, at: completion.data.completed_at, actor: completion.data.completed_by ?? "Producer", type: "Production completion", text: `${(completion.data as { profiles?: { full_name?: string | null } | null }).profiles?.full_name ?? "Producer"} completed and locked the production` });
      const termsAccepted = await supabase.from("booking_terms_acceptances").select("id, booking_id, accepted_by, terms_version, accepted_at").eq("production_id", p.id);
      if (termsAccepted.error) throw termsAccepted.error;
      for (const a of termsAccepted.data ?? []) out.push({ id: `terms-${a.id}`, at: a.accepted_at, actor: a.accepted_by, type: "Terms accepted", text: `Crew member accepted job terms`, detail: `Booking ${a.booking_id} · Version ${a.terms_version} · User ${a.accepted_by}` });
      const acknowledgements = await supabase.from("notification_acknowledgement_audit").select("id, actor_name, activity_type, notification_title, occurred_at").eq("production_id", p.id);
      if (acknowledgements.error) throw acknowledgements.error;
      for (const a of acknowledgements.data ?? []) out.push({ id: `ack-${a.id}`, at: a.occurred_at, actor: a.actor_name, type: a.activity_type, text: `${a.actor_name} acknowledged notification`, detail: a.notification_title });
      const negotiations = await supabase.from("gig_negotiation_events" as any).select("*").eq("production_id",p.id);
      if(negotiations.error) throw negotiations.error;
      for(const ev of (negotiations.data ?? []) as any[]) out.push({id:`neg-${ev.id}`,at:ev.occurred_at,type:ev.action==="below_usual_acknowledged"?"Below-rate acknowledgment":"Rate negotiation",actor:ev.actor_id,text:ev.action==="counter"?`${ev.actor_role} counter-offered ${Number(ev.offered_rate).toFixed(2)}`:ev.action==="accept"?`${ev.actor_role} accepted rate ${Number(ev.offered_rate).toFixed(2)}`:ev.action==="below_usual_acknowledged"?`Crew acknowledged rate below usual ${Number(ev.usual_rate).toFixed(2)}`:`${ev.actor_role} declined rate`,detail:`Negotiation ${ev.negotiation_id}`});
      type Journal = { id:string; occurred_at:string; actor_name:string; entity_table:string; entity_id:string; action:string; changed_fields:string[]; before_values:Record<string,unknown>|null; after_values:Record<string,unknown>|null };
      const journal: Journal[] = [];
      for(let offset=0;;offset+=1000){
        const result = await supabase.from("production_audit_events" as any).select("*").eq("production_id",p.id).order("occurred_at").order("id").range(offset,offset+999);
        if(result.error)throw result.error;
        const rows=(result.data??[]) as unknown as Journal[];journal.push(...rows);if(rows.length<1000)break;
      }
      const created = new Set(journal.filter(j=>j.action==="insert").map(j=>j.entity_table+":"+j.entity_id));
      const source:Record<string,string>={post:"site_posts",photo:"site_photos",task:"site_tasks"};
      const historical=out.filter(e=>{const split=e.id.indexOf("-");const table=source[e.id.slice(0,split)];return !table||!created.has(table+":"+e.id.slice(split+1));});
      return [...historical,...journal.map(j=>({id:"journal-"+j.id,at:j.occurred_at,actor:j.actor_name,type:"Record change",text:j.entity_table.replaceAll("_"," ")+" · "+({insert:"Created",update:"Updated",delete:"Deleted"}[j.action]??j.action),detail:"Record "+j.entity_id,changes:j.changed_fields.map(field=>({field,before:j.before_values?.[field],after:j.after_values?.[field]}))}))].sort((a,b)=>b.at.localeCompare(a.at));
    },
  });
  const events = eventsQuery.data ?? [];

  // Search across actor, activity and detail, with optional exact date and activity type.
  const activityOf = (e: Event) => e.type ?? ({ att: "Attendance", wrap: "Wrap", left: "Departure", otreq: "Overtime", otacc: "Overtime", otdec: "Overtime", otend: "Overtime", post: "Post", photo: "Photo", task: "Task" } as Record<string, string>)[e.id.split("-")[0] ?? ""] ?? "Other";
  const types = [...new Set(events.map(activityOf))].sort();
  const auditColor = (e: Event) => { const t=activityOf(e); if(t==="Rate negotiation")return "text-sky-600 dark:text-sky-400";if(t==="Below-rate acknowledgment")return "text-amber-600 dark:text-amber-400";if(t==="Production completion")return "text-emerald-600 dark:text-emerald-400";if(t==="Terms accepted")return "text-violet-600 dark:text-violet-400";return "text-foreground"; };
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
      {eventsQuery.isPending && <p role="status">Loading activity history…</p>}
      {eventsQuery.isError && <p role="alert" className="rounded border border-destructive p-3 text-sm">Could not load complete activity history. <button className="underline" onClick={() => void eventsQuery.refetch()}>Retry</button></p>}
      <Panel title={t("audit.title")}>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          <label className="text-xs font-semibold">{t("audit.search")}
            <input aria-label={t("audit.search")} className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm" placeholder={t("audit.placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="text-xs font-semibold">{t("productionList.columns.Date")}
            <input type="date" aria-label={t("audit.dateFilter")} className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          </label>
          <label className="text-xs font-semibold">{t("audit.type")}
            <select aria-label={t("audit.typeFilter")} className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">{t("audit.all")}</option>
              {types.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        </div>
        <p className="px-4 pb-3 text-xs text-muted-foreground">{t("audit.count", { shown: filtered.length, total: events.length })}</p>
      </Panel>
      {eventsQuery.isSuccess && days.length === 0 && <Panel title={t("audit.noMatch")}><p className="p-4 text-sm text-muted-foreground">{t("audit.empty")}</p></Panel>}
      {days.map((day) => (
        <details key={day} className="overflow-hidden rounded-md border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 font-semibold">{new Date(`${day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} <span className="ml-2 text-xs font-normal text-muted-foreground">({t("audit.activities", { count: [...groups.get(day)!.values()].reduce((total, entries) => total + entries.length, 0) })})</span></summary>
          <div className="divide-y divide-border">
            {[...groups.get(day)!.entries()].map(([loc, items]) => (
              <div key={loc} className="p-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">{loc}</div>
                <ul className="space-y-3 text-sm">
                  {items.map((e) => (
                    <li key={e.id} className="flex gap-3 border-b border-border/40 pb-2">
                      <time dateTime={e.at} className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{new Date(e.at).toLocaleString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                      <span className="min-w-0 flex-1">
                        <span className={`mb-1 block text-xs font-semibold ${auditColor(e)}`}>{activityOf(e).replaceAll("_", " ")}</span>
                        <span className="block">{e.text}</span>
                        {e.actor && <span className="block text-xs text-muted-foreground">{t("audit.by", { name: e.actor })}</span>}
                        {e.detail && <span className="block text-xs text-muted-foreground">{e.detail}</span>}
                        {e.changes && <details className="mt-1 text-xs"><summary className="cursor-pointer text-primary">Changes ({e.changes.length})</summary><dl className="mt-2 space-y-2 break-words">{e.changes.map(change=><div key={change.field}><dt className="font-semibold">{change.field.replaceAll("_"," ")}</dt><dd className="whitespace-pre-wrap text-muted-foreground">{JSON.stringify(change.before??null)} → {JSON.stringify(change.after??null)}</dd></div>)}</dl></details>}
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
import { useTranslation } from "react-i18next";
