import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { confirmDialog } from "@/components/ConfirmDialog";
import { COUNTRIES_KEY, validateCountry, type Country } from "@/lib/countries";
import { useCountries } from "@/lib/use-countries";
import { COUNTRY_LOGOS_KEY, useCountryLogos, type CountryLogos } from "@/lib/country-logos";

const KINDS = [
  { key: "nav", label: "Menu logo", hint: "Shown in the dark side menu" },
  { key: "signup", label: "Sign-up page logo", hint: "Shown above the sign-in / sign-up form" },
] as const;

const field = "rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const EMPTY: Country = { code: "", name: "", currency: "" };

async function saveSetting(key: string, value: unknown) {
  const { error } = await supabase.from("platform_settings").upsert({ key, value: value as never, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export function CountriesAdmin() {
  const logos = useCountryLogos();
  const countries = useCountries();
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // country code, or "new"
  const [draft, setDraft] = useState<Country>(EMPTY);

  async function saveLogos(next: CountryLogos) {
    await saveSetting(COUNTRY_LOGOS_KEY, next);
    await qc.invalidateQueries({ queryKey: ["platform_setting", COUNTRY_LOGOS_KEY] });
  }
  async function saveCountries(next: Country[]) {
    await saveSetting(COUNTRIES_KEY, next);
    await qc.invalidateQueries({ queryKey: ["platform_setting", COUNTRIES_KEY] });
  }

  async function upload(code: string, kind: "nav" | "signup", file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error("Please choose an image file.");
    setBusy(`${code}-${kind}`);
    try {
      const path = `${code}/${kind}-${Date.now()}.${file.name.split(".").pop() || "png"}`;
      const { error } = await supabase.storage.from("brand-logos").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const url = supabase.storage.from("brand-logos").getPublicUrl(path).data.publicUrl;
      await saveLogos({ ...logos, [code]: { ...logos[code], [kind]: url } });
      toast.success("Logo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(""); }
  }

  async function clear(code: string, kind: "nav" | "signup") {
    try { await saveLogos({ ...logos, [code]: { ...logos[code], [kind]: undefined } }); toast.success("Logo removed — default will be used"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove logo"); }
  }

  function startEdit(c?: Country) { setEditing(c ? c.code : "new"); setDraft(c ? { ...c } : EMPTY); }

  async function submit() {
    const c = { code: draft.code.trim().toUpperCase(), name: draft.name.trim(), currency: draft.currency.trim().toUpperCase() };
    const err = validateCountry(c, countries, editing === "new" ? undefined : editing ?? undefined);
    if (err) return void toast.error(err);
    try {
      const next = editing === "new" ? [...countries, c] : countries.map((x) => (x.code === editing ? c : x));
      await saveCountries(next);
      if (editing !== "new" && editing !== c.code && logos[editing!]) {
        const { [editing!]: moved, ...rest } = logos;
        await saveLogos({ ...rest, [c.code]: moved! });
      }
      toast.success(editing === "new" ? "Country added" : "Country updated");
      setEditing(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save country"); }
  }

  async function remove(c: Country) {
    if (countries.length <= 1) return void toast.error("Keep at least one country");
    if (!(await confirmDialog({ title: `Remove ${c.name}?`, description: "It will no longer appear in country lists. Its logos are removed too.", confirmLabel: "Remove" }))) return;
    try {
      await saveCountries(countries.filter((x) => x.code !== c.code));
      if (logos[c.code]) { const { [c.code]: _gone, ...rest } = logos; await saveLogos(rest); }
      toast.success("Country removed");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove country"); }
  }

  const form = (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-primary/40 bg-muted/30 p-3">
      <label className="text-xs"><span className="mb-1 block text-muted-foreground">Country name</span>
        <input autoFocus className={`${field} w-44`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Kenya" /></label>
      <label className="text-xs"><span className="mb-1 block text-muted-foreground">Code</span>
        <input className={`${field} w-16 uppercase`} maxLength={2} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="KE" /></label>
      <label className="text-xs"><span className="mb-1 block text-muted-foreground">Currency</span>
        <input className={`${field} w-20 uppercase`} maxLength={3} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} placeholder="KES" /></label>
      <button onClick={() => void submit()} className={btn}>{editing === "new" ? "Add country" : "Save"}</button>
      <button onClick={() => setEditing(null)} className="rounded-sm px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
    </div>
  );

  return (
    <Panel title={`Countries (${countries.length})`} right={editing === null &&
      <button onClick={() => startEdit()} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add country</button>}>
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">Each country can have its own menu logo and sign-up page logo. Members see the logo for the country on their profile; visitors see the logo for their region. Countries without a logo use the South Africa one.</p>
        {editing === "new" && form}
        <div className="grid gap-3 md:grid-cols-2">
          {countries.map((c) => (
            <div key={c.code} className="space-y-3 rounded-lg border border-border p-4">
              {editing === c.code ? form : (
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">{c.name} <span className="text-xs font-normal text-muted-foreground">{c.code} · {c.currency}</span></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(c)} aria-label={`Edit ${c.name}`} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => void remove(c)} aria-label={`Remove ${c.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {KINDS.map((k) => {
                  const url = logos[c.code]?.[k.key];
                  return (
                    <div key={k.key} className="space-y-1.5">
                      <div className="text-xs font-semibold">{k.label}</div>
                      <div className={`grid h-28 place-items-center rounded-md border border-border ${k.key === "nav" ? "bg-nav" : "bg-background"}`}>
                        {url ? <img src={url} alt={`${c.name} ${k.label}`} className="max-h-24 max-w-full object-contain" /> : <span className="text-[11px] text-muted-foreground">Default</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{k.hint}</p>
                      <div className="flex gap-1.5">
                        <label className="cursor-pointer rounded-sm bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
                          {busy === `${c.code}-${k.key}` ? "Uploading…" : url ? "Replace" : "Upload"}
                          <input type="file" accept="image/*" className="sr-only" disabled={!!busy} onChange={(e) => { void upload(c.code, k.key, e.target.files?.[0]); e.target.value = ""; }} />
                        </label>
                        {url && <button type="button" onClick={() => void clear(c.code, k.key)} className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground">Remove</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
