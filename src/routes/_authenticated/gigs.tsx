import { createFileRoute } from "@tanstack/react-router";
import { Page, Panel } from "@/components/AppShell";
import { FindGigsTab } from "@/components/FindGigs";
import { useMyCrewId } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/gigs")({
  head: () => ({
    meta: [
      { title: "Find Gigs — Book a Crew" },
      { name: "description", content: "Search open crew gigs by role, city and country, then grab one." },
      { property: "og:title", content: "Find Gigs — Book a Crew" },
      { property: "og:description", content: "Open crew gigs, first to grab gets it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GigsPage,
});

function GigsPage() {
  const crewId = useMyCrewId(true).data;
  return (
    <Page open title="Find Gigs" subtitle="Search open gigs and grab the ones you want">
      <Panel title="Open gigs"><div className="p-4"><FindGigsTab canClaim={!!crewId} /></div></Panel>
    </Page>
  );
}
