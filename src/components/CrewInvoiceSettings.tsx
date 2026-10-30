import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyCrewId } from "@/lib/site";

type Settings = { business_name: string; business_address: string; tax_number: string; bank_details: string; logo_url: string; accent_color: string; footer_text: string; invoice_prefix: string; vat_registered: boolean; vat_rate: number; tax_country: string; customer_tax_number: string };
const defaults: Settings = { business_name: "", business_address: "", tax_number: "", bank_details: "", logo_url: "", accent_color: "#1f5cad", footer_text: "", invoice_prefix: "INV", vat_registered: false, vat_rate: 0, tax_country: "ZA", customer_tax_number: "" };
export function CrewInvoiceSettings() {
  const crewId = useMyCrewId(true).data;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["crew-invoice-settings", crewId], enabled: !!crewId, queryFn: async () => {
    const { data, error } = await supabase.from("crew_invoice_settings").select("*").eq("crew_id", crewId!).maybeSingle();
    if (error) throw error; return data;
  } });
  const [draft, setDraft] = useState<Partial<Settings>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const value = { ...defaults, ...q.data, ...draft };
  const fields: { key: keyof Settings; label: string; type?: string }[] = [
    { key: "business_name", label: "Invoice business name" }, { key: "business_address", label: "Business address" },
    { key: "customer_tax_number", label: "Customer VAT / tax number (if required)" }, { key: "bank_details", label: "Payment and bank details" },
    { key: "logo_url", label: "Logo image URL" }, { key: "invoice_prefix", label: "Invoice number prefix" },
    { key: "accent_color", label: "Invoice accent colour", type: "color" }, { key: "footer_text", label: "Invoice footer / payment terms" },
  ];
  async function save() {
    if (!crewId) return;
    if (value.vat_registered && (!value.tax_number.trim() || value.vat_rate <= 0 || !value.tax_country.trim())) { setMessage("VAT-registered suppliers must enter a VAT registration number, country and applicable VAT rate."); return; }
    setSaving(true); setMessage("");
    const { error } = await supabase.from("crew_invoice_settings").upsert({ crew_id: crewId, ...value, updated_at: new Date().toISOString() }, { onConflict: "crew_id" });
    setMessage(error ? error.message : "Invoice format saved. New booking invoices will use these details.");
    if (!error) { setDraft({}); await qc.invalidateQueries({ queryKey: ["crew-invoice-settings", crewId] }); }
    setSaving(false);
  }
  return <section className="rounded-md border border-border bg-card p-4">
    <h2 className="mb-2 text-lg font-bold">My invoice design</h2>
    <p className="mb-4 text-xs text-muted-foreground">Set your branding and payment details once. New invoices use your agreed booking rates and equipment charges.</p>
    <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!value.vat_registered} onChange={e=>setDraft(prev=>({...prev,vat_registered:e.target.checked,vat_rate:e.target.checked?(Number(value.vat_rate)||15):0}))} />I am VAT / sales-tax registered and charge tax on invoices</label><p className="text-xs text-muted-foreground">Your advertised day rate is always exclusive of VAT / tax. Unregistered suppliers do not add VAT.</p><label className="block text-xs font-semibold">Tax country / jurisdiction<input className="mt-1 w-full rounded border border-input bg-background p-2" value={value.tax_country} onChange={e=>setDraft(prev=>({...prev,tax_country:e.target.value}))} placeholder="e.g. ZA, CY, GB" /></label>{value.vat_registered&&<div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold">VAT registration number *<input required className="mt-1 w-full rounded border border-input bg-background p-2" value={value.tax_number} onChange={e=>setDraft(prev=>({...prev,tax_number:e.target.value}))} /></label><label className="text-xs font-semibold">Applicable VAT / tax rate % *<input type="number" min="0.01" max="100" step="0.01" className="mt-1 w-full rounded border border-input bg-background p-2" value={value.vat_rate} onChange={e=>setDraft(prev=>({...prev,vat_rate:Number(e.target.value)}))} /></label></div>}<p className="text-xs">Example on a R1,000 day rate: excl. tax R1,000 · tax {new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(value.vat_registered?1000*Number(value.vat_rate)/100:0)} · incl. tax {new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(1000*(1+(value.vat_registered?Number(value.vat_rate):0)/100))}.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map((f) => <label key={f.key} className="text-xs font-semibold">{f.label}
      <input type={f.type ?? "text"} className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" value={value[f.key]} onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))} />
    </label>)}</div>
    {value.logo_url && <img src={value.logo_url} alt="Invoice logo preview" className="mt-3 max-h-20 max-w-40 object-contain" />}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <button disabled={!crewId || saving} onClick={save} className="mt-4 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving..." : "Save invoice format"}</button>
  </section>;
}
