import { createFileRoute } from "@tanstack/react-router";
import { TopNav } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Book a Crew" },
      { name: "description", content: "Sign in or create your Book a Crew account as a producer or crew member." },
      { property: "og:title", content: "Sign in — Book a Crew" },
      { property: "og:description", content: "Access your productions, bookings and call sheets." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="mx-auto max-w-md px-4 py-12">
        <AuthForm />
      </main>
    </div>
  );
}
