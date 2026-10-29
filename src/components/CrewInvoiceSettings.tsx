import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyCrewId } from "@/lib/site";

type Settings = { business_name: string; business_address: string; tax_number: string; bank_details: string; logo_url: string; accent_color: string; footer_text: string; invoice_prefix: string };
const defaults: Settings = { business_name: "", business_address: "", tax_number: "", bank_details: "", logo_url: "", accent_color: "#1f5cad", footer_text: "", invoice_prefix: "INV" };
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
    { key: "tax_number", label: "VAT / tax number (optional)" }, { key: "bank_details", label: "Payment and bank details" },
    { key: "logo_url", label: "Logo image URL" }, { key: "invoice_prefix", label: "Invoice number prefix" },
    { key: "accent_color", label: "Invoice accent colour", type: "color" }, { key: "footer_text", label: "Invoice footer / payment terms" },
  ];
  async function save() {
    if (!crewId) return;
    setSaving(true); setMessage("");
    const { error } = await supabase.from("crew_invoice_settings").upsert({ crew_id: crewId, ...value, updated_at: new Date().toISOString() }, { onConflict: "crew_id" });
    setMessage(error ? error.message : "Invoice format saved. New booking invoices will use these details.");
    if (!error) { setDraft({}); await qc.invalidateQueries({ queryKey: ["crew-invoice-settings", crewId] }); }
    setSaving(false);
  }
  return <section className="rounded-md border border-border bg-card p-4">
    <h2 className="mb-2 text-lg font-bold">My invoice design</h2>
    <p className="mb-4 text-xs text-muted-foreground">Set your branding and payment details once. New invoices use your agreed booking rates and equipment charges.</p>
    <div className="grid gap-3 sm:grid-cols-2">{fields.map((f) => <label key={f.key} className="text-xs font-semibold">{f.label}
      <input type={f.type ?? "text"} className="mt-1 w-full rounded border border-border bg-background p-2 text-sm" value={value[f.key]} onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))} />
    </label>)}</div>
    {value.logo_url && <img src={value.logo_url} alt="Invoice logo preview" className="mt-3 max-h-20 max-w-40 object-contain" />}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <button disabled={!crewId || saving} onClick={save} className="mt-4 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving..." : "Save invoice format"}</button>
  </section>;
}
