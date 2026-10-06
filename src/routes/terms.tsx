import { createFileRoute } from "@tanstack/react-router";
import { SitePage } from "@/components/SitePage";
import terms from "@/content/terms.txt?raw";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "T & C | dialacrew" },
      { name: "description", content: "Dial a Crew terms of service and crew working guidelines." },
      { property: "og:title", content: "Terms & Conditions — Dial a Crew" },
      { property: "og:description", content: "Terms of service and crew working guidelines." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <SitePage>
      <div className="whitespace-pre-line leading-relaxed text-foreground">{terms}</div>
    </SitePage>
  ),
});
