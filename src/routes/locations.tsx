import { createFileRoute } from "@tanstack/react-router";
import { SitePage } from "@/components/SitePage";

export const Route = createFileRoute("/locations")({
  head: () => ({
    meta: [
      { title: "LOCATION | dialacrew" },
      { name: "description", content: "Looking for something unique? We can find it." },
      { property: "og:title", content: "Locations — Dial a Crew Cyprus" },
      { property: "og:description", content: "Looking for something unique? We can find it." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SitePage title="Locations">
      <p className="mt-8 text-center text-xl font-light text-foreground">Looking for something unique? We can find it .</p>
    </SitePage>
  ),
});
