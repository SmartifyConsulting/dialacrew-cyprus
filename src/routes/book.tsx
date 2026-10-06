import { createFileRoute, Link } from "@tanstack/react-router";
import { SitePage } from "@/components/SitePage";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "BOOK | dialacrew" },
      { name: "description", content: "Book film and commercial crew with Book a Crew." },
      { property: "og:title", content: "Book a Crew — Book a Crew" },
      { property: "og:description", content: "Book film and commercial crew." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Book,
});

function Book() {
  return (
    <SitePage title="Book a Crew">
      <div className="mt-10 text-center">
        <Link
          to="/productions"
          className="inline-block bg-primary px-10 py-4 font-script text-2xl text-primary-foreground hover:opacity-90"
        >
          Start a booking
        </Link>
        <p className="mt-4 text-sm text-muted-foreground">Sign in to set up a production and pencil crew.</p>
      </div>
    </SitePage>
  );
}
