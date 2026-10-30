import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Page } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/invoices/$id")({ component: InvoiceDetail });

function InvoiceDetail() {
 const { id } = Route.useParams();
 const q = useQuery({ queryKey: ["invoice-detail", id], queryFn: async () => {
  const { data, error } = await supabase.from("invoices").select("*, productions(name, currency, client), crew_members(name)").eq("id", id).single();
  if (error) throw error; return data;
 } });
 const i = q.data;
 const issuer = i?.issuer_snapshot && typeof i.issuer_snapshot === "object" && !Array.isArray(i.issuer_snapshot) ? i.issuer_snapshot as Record<string, unknown> : {};
 const field = (key: string) => typeof issuer[key] === "string" ? issuer[key] as string : "";
 const money = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: i?.productions?.currency || "ZAR" }).format(n);
 return <Page open title="Invoice" subtitle="Printable invoice attachment">
  <div className="mb-4 flex gap-3 print:hidden"><Link to="/invoices" className="text-sm text-primary underline">Back to invoices</Link><button onClick={() => window.print()} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Print / Save as PDF</button></div>
  {q.isLoading && <p>Loading invoice...</p>}
  {q.error && <p role="alert" className="text-destructive">{q.error.message}</p>}
  {i && <article className="mx-auto max-w-3xl rounded border border-border bg-white p-8 text-slate-900 print:border-0 print:p-0">
   <header className="mb-8 flex justify-between gap-6 border-b pb-6">
    <div>{field("logo_url") && <img src={field("logo_url")} alt="Invoice logo" className="mb-3 max-h-20 max-w-40 object-contain" />}
     <h2 className="text-2xl font-bold">{field("business_name") || i.crew_members?.name || "Service provider"}</h2>
     <p className="whitespace-pre-line text-sm">{field("business_address")}</p>
     {issuer.vat_registered === true && field("tax_number") && <p className="text-sm">VAT / tax registration: {field("tax_number")}</p>}{field("tax_country") && <p className="text-xs">Tax jurisdiction: {field("tax_country")}</p>}
    </div>
    <div className="text-right"><h1 className="text-3xl font-bold">{issuer.vat_registered === true ? "TAX INVOICE" : "INVOICE"}</h1><p>{i.invoice_number}</p><p>{new Date(i.created_at).toLocaleDateString("en-ZA")}</p><p className="font-semibold uppercase">{i.status}</p></div>
   </header>
   <p className="mb-6 text-sm"><strong>Bill to:</strong> {i.productions?.name} · {i.productions?.client}{field("customer_tax_number") && <span className="block">Customer VAT / tax number: {field("customer_tax_number")}</span>}</p>
   <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-3">Description</th><th>Qty</th><th className="text-right">Amount (excl. VAT / tax)</th></tr></thead><tbody>
    <tr className="border-b"><td className="py-3">{i.service_description || "Professional services"}</td><td>{i.days}</td><td className="text-right">{money(i.day_rate * i.days)}</td></tr>
    {i.equipment_amount > 0 && <tr className="border-b"><td className="py-3">Equipment rental</td><td>1</td><td className="text-right">{money(i.equipment_amount)}</td></tr>}
    {i.overtime_amount > 0 && <tr className="border-b"><td className="py-3">Overtime</td><td>1</td><td className="text-right">{money(i.overtime_amount)}</td></tr>}
   </tbody></table>
   <div className="mt-6 space-y-2 text-right text-sm"><p>Subtotal: {money(i.subtotal)}</p><p>{issuer.vat_registered === true ? `VAT / tax (${Number(i.vat_rate)}%)` : "VAT / tax (not charged)"}: {money(i.vat_amount)}</p><p className="text-xl font-bold">Total: {money(i.total)}</p></div>
   <footer className="mt-10 border-t pt-4 text-sm"><p className="whitespace-pre-line">{field("bank_details")}</p><p className="mt-4 whitespace-pre-line">{field("footer_text")}</p></footer>
  </article>}
 </Page>;
}
