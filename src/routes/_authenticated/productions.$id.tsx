import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MapPin } from "lucide-react";
import { Badge, ClientBadge, Page } from "@/components/AppShell";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useRole, useSession } from "@/lib/auth";
import { useBookings, useCrew, useProductions, useRequests } from "@/lib/db";
import { useMyCrewId, useMyName } from "@/lib/site";
import { RetroTab } from "@/components/site/RetroTab";
import { CrewDayPlanner } from "@/components/site/CrewDayPlanner";
import { PhotosTab } from "@/components/site/PhotosTab";
import { StoryboardStudio } from "@/components/site/StoryboardStudio";
import { AuditTab } from "@/components/site/AuditTab";
import { ProductionCover } from "@/components/site/ProductionCover";
import { DocumentsTab } from "@/components/site/DocumentsTab";
import { CrewOvertimePanel, useBookingRates } from "@/components/site/Overtime";
import { ChecklistsPanel, CommercialsTab, CONFIRMED_BOOKING_STATUSES, MembersList, OverviewTab, PostsTab, RegisterTab, TasksTab } from "@/components/site/SiteTabs";

export const Route = createFileRoute("/_authenticated/productions/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: string; audio_ref?: string } => ({
    ...(typeof s["tab"] === "string" ? { tab: s["tab"] } : {}),
    ...(typeof s["audio_ref"] === "string" ? { audio_ref: s["audio_ref"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Production site — Book a Crew" },
      { name: "description", content: "Site page for this production: overview, posts, members, tasks and kit." },
      { property: "og:title", content: "Production site — Book a Crew" },
      { property: "og:description", content: "Everyone on the job, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductionSite,
});

// Crew see only Posts, Tasks and Photos (Overview is the fixed left widget).
// The Crew tab is a live workspace: Crew Role Required on top, the Sandbox scenario planner below.
const CREW_TABS = ["Posts", "Tasks", "Photos"] as const;
const MANAGER_TABS = ["Posts", "Crew", "Storyboard", "Checklists", "Tasks", "Photos", "Files", "Budget", "Review", "Audit"] as const;
type Tab = (typeof MANAGER_TABS)[number];
function ProductionSite() {
  const { t: translate } = useTranslation();
  const { id } = Route.useParams();
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const role = useRole(userId || undefined);
  const isProducer = role.data === "producer" || (role.data as string) === "admin";
  const prods = useProductions();
  const crew = useCrew().data ?? [];
  const bookings = useBookings().data ?? [];
  const requests = useRequests().data ?? [];
  const myCrewId = useMyCrewId(!!userId && role.data === "crew").data ?? null;
  const myName = useMyName(userId || undefined).data ?? "";
  const { tab: tabParam } = Route.useSearch();
  const isValidTab = (t: string | undefined): t is Tab => !!t && (MANAGER_TABS as readonly string[]).includes(t);
  const [tab, setTab] = useState<Tab>(tabParam === "find-crew" ? "Crew" : isValidTab(tabParam) ? tabParam : "Posts");
  useEffect(() => { if (tabParam === "find-crew") setTab("Crew"); else if (isValidTab(tabParam)) setTab(tabParam); }, [tabParam]);
  const [asideOpen, setAsideOpen] = useState(true);
  // Crew is the busiest tab (Crew Role Required + the Sandbox scenario planner) — collapse the
  // overview/location panel to give it room once the producer switches there, but never on the
  // page's first render, so a freshly created production still opens with the panel expanded.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    setAsideOpen(tab !== "Crew" && tab !== "Storyboard");
  }, [tab]);
  const p = prods.data?.find((x) => x.id === id);
  const rates = useBookingRates(p?.id ?? "");
  const qc = useQueryClient();
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState("");
  const closed = p?.status === "Completed";
  async function completeJob() {
    if (!p || !(await confirmDialog("Complete this production permanently? All activity and invoice changes will be locked.", { destructive: true }))) return;
    setClosing(true); setCloseError("");
    const { error } = await supabase.rpc("complete_production", { p_production_id: p.id });
    if (error) setCloseError(error.message);
    else { await qc.invalidateQueries({ queryKey: ["productions"] }); await qc.invalidateQueries({ queryKey: ["notifications"] }); }
    setClosing(false);
  }
  if (!p) return <Page open title={prods.isLoading ? "Loading…" : "Production not found"}>{null}</Page>;
  const crewNames = Object.fromEntries(crew.map((c) => [c.id, c.name]));
  const ctx = { p, isProducer, userId, myName, myCrewId };
  const tabs: readonly Tab[] = isProducer ? MANAGER_TABS : CREW_TABS;

  const actions = (
    <div className="flex items-center gap-2">
      <Badge>{translate(`productionList.status.${p.status}`, p.status)}</Badge>
      {isProducer && !closed && <button type="button" disabled={closing} onClick={completeJob} className="rounded border border-primary px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-50">{closing ? translate("workspace.closing") : translate("workspace.complete")}</button>}
    </div>
  );

  return (
    <Page open compact title={<span className="inline-flex items-center gap-3"><ProductionCover p={p} isProducer={isProducer} />{p.name}</span>} subtitle={<span className="inline-flex items-center gap-2"><ClientBadge name={p.client} /> {p.type} · {p.date} · {p.days} day(s) · <MapPin className="h-3 w-3 text-primary" />{p.address || p.location}</span>} actions={actions}>
      {closeError && <p role="alert" className="mb-3 text-sm text-destructive">{closeError}</p>}
      {closed && <div className="mb-4 rounded border border-border bg-muted p-3 text-sm font-semibold">Completed — read-only archive. No new activity or invoices can be added.</div>}
      <div className={`grid gap-5 ${asideOpen ? "lg:grid-cols-[380px_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1fr)]"}`}>
        {/* The side panel hides only while the Crew tab is open — no manual collapse button. */}
        <aside className={`relative space-y-5 lg:sticky lg:top-28 lg:self-start ${asideOpen ? "" : "lg:hidden"}`}>
          {myCrewId && <CrewOvertimePanel productionId={p.id} crewId={myCrewId} rate={rates[myCrewId] ?? 0} date={p.date || null} />}
          <fieldset disabled={closed} className="min-w-0">
            <OverviewTab key={p.id} {...ctx} />
          </fieldset>
        </aside>
        <section className="flex min-w-0 flex-col">
          <nav className="mb-4 flex w-full gap-1 overflow-x-auto rounded-sm border border-border bg-card">
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{translate(`workspace.tabs.${t}`)}</button>
            ))}
          </nav>
          <fieldset disabled={closed} className="min-w-0 w-full [&>*]:w-full">
          {tab === "Posts" && <PostsTab {...ctx} />}
          {tab === "Crew" && isProducer && (
            <div className="space-y-5">
              <CrewDayPlanner p={p} />
              {/* Hidden until someone's actually confirmed — pencilled bookings don't count, and an empty roster + register is just visual noise before then. */}
              {bookings.some((b) => b.productionId === p.id && CONFIRMED_BOOKING_STATUSES.includes(b.status)) && <><MembersList {...ctx} /><RegisterTab {...ctx} /></>}
            </div>
          )}
          {tab === "Checklists" && <ChecklistsPanel p={p} isProducer={isProducer} />}
          {tab === "Tasks" && <TasksTab {...ctx} />}
          {tab === "Audit" && isProducer && <AuditTab p={p} />}
          {tab === "Photos" && <PhotosTab p={p} userId={userId} isProducer={isProducer} />}
          {tab === "Files" && isProducer && <DocumentsTab key={p.id} p={p} userId={userId} myName={myName} isProducer={isProducer} />}
          {tab === "Storyboard" && <StoryboardStudio key={p.id} p={p} isProducer={isProducer} />}
                    {tab === "Budget" && isProducer && <CommercialsTab {...ctx} bookings={bookings} crewNames={crewNames} requests={requests} />}
          {tab === "Review" && isProducer && <RetroTab p={p} />}
          </fieldset>
        </section>
      </div>
    </Page>
  );
}
import { useTranslation } from "react-i18next";
