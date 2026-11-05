import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { COUNTRIES } from "@/lib/countries";
import { COUNTRY_LOGOS_KEY, useCountryLogos, type CountryLogos } from "@/lib/country-logos";

const KINDS = [
  { key: "nav", label: "Menu logo", hint: "Shown in the dark side menu" },
  { key: "signup", label: "Sign-up page logo", hint: "Shown above the sign-in / sign-up form" },
] as const;

export function CountriesAdmin() {
  const logos = useCountryLogos();
  const qc = useQueryClient();
  const [busy, setBusy] = useState("");

  async function save(next: CountryLogos) {
    const { error } = await supabase.from("platform_settings").upsert({ key: COUNTRY_LOGOS_KEY, value: next, updated_at: new Date().toISOString() });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["platform_setting", COUNTRY_LOGOS_KEY] });
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
      await save({ ...logos, [code]: { ...logos[code], [kind]: url } });
      toast.success("Logo updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally { setBusy(""); }
  }

  async function clear(code: string, kind: "nav" | "signup") {
    try { await save({ ...logos, [code]: { ...logos[code], [kind]: undefined } }); toast.success("Logo removed — default will be used"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove logo"); }
  }

  return (
    <Panel title="Countries">
      <p className="mb-4 text-sm text-muted-foreground">Each country can have its own menu logo and sign-up page logo. Members see the logo for the country on their profile; visitors see the logo for their region. Countries without a logo use the South Africa one.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {COUNTRIES.map((c) => (
          <div key={c.code} className="rounded-lg border border-border p-3">
            <div className="mb-2 font-semibold">{c.name} <span className="text-xs text-muted-foreground">{c.code}</span></div>
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
    </Panel>
  );
}
