import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin } from "lucide-react";
import { Badge, Page } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { useBookings, useCrew, useProductions, useRequests } from "@/lib/db";
import { useMyCrewId, useMyName } from "@/lib/site";
import { AssetsTab, CommercialsTab, DocumentsTab, MessagesTab, OverviewTab, PostsTab, RegisterTab, TasksTab } from "@/components/site/SiteTabs";

export const Route = createFileRoute("/_authenticated/productions/$id")({
  head: () => ({
    meta: [
      { title: "Production site — Book a Crew" },
      { name: "description", content: "Site page for this production: members, posts, register, tasks, documents and assets." },
      { property: "og:title", content: "Production site — Book a Crew" },
      { property: "og:description", content: "Everyone on the job, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProductionSite,
});

const TABS = ["Overview", "Posts", "Messages", "Register", "Tasks", "Documents", "Assets", "Commercials"] as const;

function ProductionSite() {
  const { id } = Route.useParams();
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const role = useRole(userId || undefined);
  const isProducer = role.data === "producer";
  const prods = useProductions();
  const crew = useCrew().data ?? [];
  const bookings = useBookings().data ?? [];
  const requests = useRequests().data ?? [];
  const myCrewId = useMyCrewId(!!userId && role.data === "crew").data ?? null;
  const myName = useMyName(userId || undefined).data ?? "";
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const p = prods.data?.find((x) => x.id === id);
  if (!p) return <Page open title={prods.isLoading ? "Loading…" : "Production not found"}>{null}</Page>;
  const crewNames = Object.fromEntries(crew.map((c) => [c.id, c.name]));
  const ctx = { p, isProducer, userId, myName, myCrewId };
  const tabs = TABS.filter((t) => t !== "Commercials" || isProducer);

  return (
    <Page open title={p.name} subtitle={`${p.client} · ${p.type} · ${p.date} · ${p.days} day(s)`} actions={<Badge>{p.status}</Badge>}>
      <div className="-mt-3 mb-4 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4 text-primary" /> {p.address || p.location}</div>
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t}</button>
        ))}
      </nav>
      {tab === "Overview" && <OverviewTab {...ctx} />}
      {tab === "Posts" && <PostsTab {...ctx} />}
      {tab === "Messages" && <MessagesTab {...ctx} bookings={bookings} crewNames={crewNames} />}
      {tab === "Register" && <RegisterTab {...ctx} />}
      {tab === "Tasks" && <TasksTab {...ctx} />}
      {tab === "Documents" && <DocumentsTab {...ctx} />}
      {tab === "Assets" && <AssetsTab {...ctx} bookings={bookings} crewNames={crewNames} />}
      {tab === "Commercials" && isProducer && <CommercialsTab {...ctx} bookings={bookings} crewNames={crewNames} requests={requests} />}
    </Page>
  );
}
