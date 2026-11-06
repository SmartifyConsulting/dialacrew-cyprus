import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Page, Badge } from "@/components/AppShell";
import { CrewInvoiceSettings } from "@/components/CrewInvoiceSettings";
import { useMyCrewId } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({ meta: [
    { title: "My invoices — Book a Crew" }, { name: "description", content: "Review and issue your Book a Crew booking invoices." },
    { property: "og:title", content: "My invoices — Book a Crew" }, { property: "og:description", content: "Crew draft and issued invoices." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }), component: InvoicesPage,
});

function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const crewId = useMyCrewId(true).data;
  const q = useQuery({ queryKey: ["my-invoices", crewId], enabled: !!crewId, queryFn: async () => {
    const { data, error } = await supabase.from("invoices").select("id, invoice_number, production_id, service_description, total, status, created_at, productions(name, currency)").eq("crew_id", crewId!).order("created_at", { ascending: false });
    if (error) throw error; return data ?? [];
  } });
  return <Page open title={t("invoiceList.title")} subtitle={t("invoiceList.subtitle")}>
    <div className="space-y-5">
      <CrewInvoiceSettings />
      <section className="rounded-md border border-border bg-card">
        <h2 className="border-b border-border p-4 text-lg font-bold">{t("invoiceList.heading")}</h2>
        {q.isLoading && <p className="p-4 text-sm">{t("invoiceList.loading")}</p>}
        {q.error && <p role="alert" className="p-4 text-sm text-destructive">{q.error.message}</p>}
        {!q.isLoading && !q.data?.length && <p className="p-4 text-sm text-muted-foreground">{t("invoiceList.empty")}</p>}
        <ul className="divide-y divide-border">{(q.data ?? []).map((i) => <li key={i.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <div className="min-w-0 flex-1"><div className="font-semibold">{i.invoice_number} · {i.productions?.name ?? t("productionList.columns.Production")}</div><div className="text-xs text-muted-foreground">{i.service_description} · {new Date(i.created_at).toLocaleDateString(i18n.language)}</div></div>
          <strong>{new Intl.NumberFormat(i18n.language, { style: "currency", currency: i.productions?.currency || "ZAR" }).format(i.total)}</strong>
          <Badge>{i.status || "unpaid"}</Badge>
          <Link to="/invoices/$id" params={{ id: i.id }} className="text-xs font-semibold text-primary underline">{t(i.status==="draft"?"invoiceList.review":"invoiceList.view")}</Link>
        </li>)}</ul>
      </section>
    </div>
  </Page>;
}
