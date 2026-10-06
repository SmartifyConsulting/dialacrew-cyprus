import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Page } from "@/components/AppShell";
import { useRole, useSession } from "@/lib/auth";
import { useMyCrewId } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Book a Crew" },
      { name: "description", content: "Your crew profile, skills, certifications and kit." },
      { property: "og:title", content: "My profile — Book a Crew" },
      { property: "og:description", content: "Manage your service provider profile." },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyProfile,
});

function MyProfile() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const crewId = useMyCrewId(role.data === "crew");
  if (role.data === "crew" && crewId.data) return <Navigate to="/crew/$id" params={{ id: crewId.data }} replace />;
  return (
    <Page open title="My profile">
      <p className="text-muted-foreground">
        {role.isLoading || crewId.isLoading ? "Loading…" : role.data === "producer"
          ? "Service provider profiles live under Crew — open anyone in the directory to view or edit their profile."
          : "Profiles are for crew and service providers."}
      </p>
    </Page>
  );
}
