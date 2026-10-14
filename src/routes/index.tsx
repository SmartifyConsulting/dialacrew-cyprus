import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import logoUrl from "@/assets/bookacrew-sa-logo-black.png";

const HERO_BG = "https://static.wixstatic.com/media/20efcd_c74b87f40292491e9dbcf1db2483f78c~mv2.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Book a Crew | Film, TV & Commercial Production Crew" },
      { name: "description", content: "Sign in or join Book a Crew to book film, TV and commercial crew and kit, and run every production from call sheet to final invoice." },
      { property: "og:title", content: "Book a Crew | Professional Production Crew on Demand" },
      { property: "og:description", content: "Sign in or join to book directors, camera, sound, lighting and production crew for your next shoot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: HERO_BG },
      { name: "twitter:image", content: HERO_BG },
    ],
  }),
  component: Index,
});

// Home is the sign-in / sign-up screen only — marketing sections are intentionally hidden.
function Index() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <TopNav />
      <section
        className="relative flex-1 bg-background"
        style={{ backgroundImage: "radial-gradient(color-mix(in oklch, var(--foreground) 7%, transparent) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
      >
        <div className="relative mx-auto flex flex-col items-center px-4 py-10">
          <img src={logoUrl} alt="Book a Crew" className="mb-6 w-[1040px] max-w-full md:w-[1280px]" />
          <div className="w-full max-w-md"><AuthForm /></div>
        </div>
      </section>
    </div>
  );
}
