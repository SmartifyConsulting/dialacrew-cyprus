import { createFileRoute, Link } from "@tanstack/react-router";
import { Page } from "@/components/AppShell";
import { ChecklistTemplateManager } from "@/components/ChecklistTemplateManager";
import { useRole, useSession } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/checklist-templates")({ component: ProducerChecklistTemplates });

function ProducerChecklistTemplates() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  if (role.isLoading) return <Page open title="Checklist templates">Loading…</Page>;
  if (role.data !== "producer" && role.data !== "admin") return <Page open title="Checklist templates"><p>Producer access required.</p></Page>;
  return <Page open title="Checklist templates" subtitle="Prepared checklists and your reusable production templates">
    <div className="mb-4 text-sm"><Link to="/productions" className="text-primary underline">Back to productions</Link></div>
    <ChecklistTemplateManager audience="producer" />
  </Page>;
}
