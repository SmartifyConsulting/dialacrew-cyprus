import { createFileRoute } from "@tanstack/react-router";
import { SitePage } from "@/components/SitePage";

export const Route = createFileRoute("/casting")({
  head: () => ({
    meta: [
      { title: "CASTING | dialacrew" },
      { name: "description", content: "Casting for film, commercial and video productions." },
      { property: "og:title", content: "Casting — Book a Crew" },
      { property: "og:description", content: "Casting for productions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <SitePage title="Casting" />,
});
