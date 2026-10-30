import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Page, Badge } from "@/components/AppShell";
import { CrewInvoiceSettings } from "@/components/CrewInvoiceSettings";
import { useMyCrewId } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/invoices")({ component: InvoicesPage });

function InvoicesPage() {
  const crewId = useMyCrewId(true).data;
  const q = useQuery({ queryKey: ["my-invoices", crewId], enabled: !!crewId, queryFn: async () => {
    const { data, error } = await supabase.from("invoices").select("id, invoice_number, production_id, service_description, total, status, created_at, productions(name, currency)").eq("crew_id", crewId!).order("created_at", { ascending: false });
    if (error) throw error; return data ?? [];
  } });
  return <Page open title="My Invoices" subtitle="Draft invoices are prepared on booking confirmation; you issue the final invoice after wrap-up">
    <div className="space-y-5">
      <CrewInvoiceSettings />
      <section className="rounded-md border border-border bg-card">
        <h2 className="border-b border-border p-4 text-lg font-bold">Draft and issued invoices</h2>
        {q.isLoading && <p className="p-4 text-sm">Loading invoices...</p>}
        {q.error && <p role="alert" className="p-4 text-sm text-destructive">{q.error.message}</p>}
        {!q.isLoading && !q.data?.length && <p className="p-4 text-sm text-muted-foreground">No invoices yet. Your first invoice will appear when a booking is confirmed.</p>}
        <ul className="divide-y divide-border">{(q.data ?? []).map((i) => <li key={i.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <div className="min-w-0 flex-1"><div className="font-semibold">{i.invoice_number} · {i.productions?.name ?? "Production"}</div><div className="text-xs text-muted-foreground">{i.service_description} · {new Date(i.created_at).toLocaleDateString("en-ZA")}</div></div>
          <strong>{new Intl.NumberFormat("en-ZA", { style: "currency", currency: i.productions?.currency || "ZAR" }).format(i.total)}</strong>
          <Badge>{i.status || "unpaid"}</Badge>
          <Link to="/invoices/$id" params={{ id: i.id }} className="text-xs font-semibold text-primary underline">{i.status==="draft"?"Review draft / Invoice":"View / Print"}</Link>
        </li>)}</ul>
      </section>
    </div>
  </Page>;
}
