import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Sparkles } from "lucide-react";
import { Badge, Page } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { useBookings, useCrew, useProductions, useRequests } from "@/lib/db";
import { useMyCrewId, useMyName } from "@/lib/site";
import { RetroTab } from "@/components/site/RetroTab";
import { ScenarioPlanner } from "@/components/site/ScenarioPlanner";
import { ProjectInsights } from "@/components/site/ProjectInsights";
import { AssetsTab, CommercialsTab, DocumentsTab, MembersList, MessagesTab, OverviewTab, PostsTab, RegisterTab, TasksTab } from "@/components/site/SiteTabs";

export const Route = createFileRoute("/_authenticated/productions/$id")({
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

// Crew see only Posts, Members, Tasks, Kit (Overview is the fixed left widget).
// Find Crew (scenario planner) opens from the header button beside the status badge.
const CREW_TABS = ["Posts", "Members", "Tasks", "Kit"] as const;
const MANAGER_TABS = ["Posts", "Members", "Tasks", "Kit", "Messages", "Documents", "Budget", "Review"] as const;
type Tab = (typeof MANAGER_TABS)[number] | "Find Crew";

function ProductionSite() {
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
  const [tab, setTab] = useState<Tab>("Posts");
  const p = prods.data?.find((x) => x.id === id);
  if (!p) return <Page open title={prods.isLoading ? "Loading…" : "Production not found"}>{null}</Page>;
  const crewNames = Object.fromEntries(crew.map((c) => [c.id, c.name]));
  const ctx = { p, isProducer, userId, myName, myCrewId };
  const tabs: readonly Tab[] = isProducer ? MANAGER_TABS : CREW_TABS;

  const actions = (
    <div className="flex items-center gap-2">
      {isProducer && (
        <button onClick={() => setTab("Find Crew")}
          className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${tab === "Find Crew" ? "bg-primary text-primary-foreground" : "border border-primary text-primary hover:bg-primary/10"}`}>
          <Sparkles className="h-4 w-4" /> Find Crew
        </button>
      )}
      <Badge>{p.status}</Badge>
    </div>
  );

  return (
    <Page open title={p.name} subtitle={`${p.client} · ${p.type} · ${p.date} · ${p.days} day(s)`} actions={actions}>
      <div className="-mt-3 mb-4 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4 text-primary" /> {p.address || p.location}</div>
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
          <OverviewTab {...ctx} />
          <ProjectInsights p={p} isProducer={isProducer} />
        </aside>
        <section className="flex min-w-0 flex-col">
          <nav className="mb-4 flex w-full gap-1 overflow-x-auto rounded-sm border border-border bg-card">
            {tabs.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
            ))}
          </nav>
          <div className="w-full [&>*]:w-full">
          {tab === "Posts" && <PostsTab {...ctx} />}
          {tab === "Members" && <div className="space-y-5"><MembersList {...ctx} /><RegisterTab {...ctx} /></div>}
          {tab === "Tasks" && <TasksTab {...ctx} />}
          {tab === "Kit" && <AssetsTab {...ctx} bookings={bookings} crewNames={crewNames} />}
          {tab === "Messages" && isProducer && <MessagesTab {...ctx} bookings={bookings} crewNames={crewNames} />}
          {tab === "Documents" && isProducer && <DocumentsTab {...ctx} />}
          {tab === "Budget" && isProducer && <CommercialsTab {...ctx} bookings={bookings} crewNames={crewNames} requests={requests} />}
          {tab === "Find Crew" && isProducer && <ScenarioPlanner p={p} />}
          {tab === "Review" && isProducer && <RetroTab p={p} />}
          </div>
        </section>
      </div>
    </Page>
  );
}
