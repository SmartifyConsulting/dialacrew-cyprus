import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCrew } from "@/lib/db";
import { fmtMoney, type Production } from "@/lib/demo-data";
import { friendlyError } from "@/lib/errors";
import type { Json } from "@/integrations/supabase/types";

export type RecceSelection = Record<string, number>;
export const recceCost = (selection: RecceSelection) => Object.values(selection).reduce((total, rate) => total + Math.max(0, Number(rate) || 0), 0);
export function useReccePlans(productionId: string) {
  return useQuery({ queryKey: ["recce-plans", productionId], queryFn: async () => {
    const { data, error } = await supabase.from("production_recce_plans").select("*").eq("production_id", productionId);
    if (error) throw error;
    return data;
  } });
}
export function RecceSandbox({ p, date }: { p: Production; date: string }) {
  const crew = useCrew().data ?? [];
  const plans = useReccePlans(p.id);
  const qc = useQueryClient();
  const saved = plans.data?.find((plan) => plan.recce_date === date);
  const [selection, setSelection] = useState<RecceSelection>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => { if (!dirty) setSelection((saved?.selection ?? {}) as RecceSelection); }, [saved, dirty]);
  const change = (value: RecceSelection) => { setSelection(value); setDirty(true); };
  async function save() {
    setBusy(true);
    try {
      const { data, error } = await supabase.from("production_recce_plans").upsert({ production_id: p.id, recce_date: date, selection: selection as Json, total: recceCost(selection) }, { onConflict: "production_id,recce_date" }).select("recce_date").single();
      if (error || !data) throw error ?? new Error("Recce plan was not saved");
      await qc.invalidateQueries({ queryKey: ["recce-plans", p.id] });
      setDirty(false); toast.success("Recce crew and expense saved");
    } catch (error) { toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }
  return <section className="rounded border border-border bg-card">
    <h3 className="bg-primary px-4 py-3 font-semibold text-primary-foreground">Recce sandbox · {date} · {fmtMoney(recceCost(selection), p.currency)}</h3>
    <div className="space-y-3 p-4">
      <p className="text-xs text-muted-foreground">Select the crew needed for this recce and their recce-day rates. This is a planned expense, separate from shoot bookings. Save to include it in the crew budget.</p>
      {plans.isError && <p role="alert">Could not load saved recce crew. <button className="underline" onClick={() => void plans.refetch()}>Try again</button></p>}
      <input aria-label="Search recce crew" placeholder="Search crew or role" className="w-full rounded border border-input bg-background p-2 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul className="max-h-72 divide-y divide-border overflow-y-auto">
        {crew.filter((c) => [c.name, c.role].some((v) => v.toLowerCase().includes(search.toLowerCase()))).map((c) => <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
          <label className="flex flex-1 items-center gap-2"><input type="checkbox" checked={c.id in selection} onChange={(e) => { const next = { ...selection }; if (e.target.checked) next[c.id] = c.dayRate; else delete next[c.id]; change(next); }} />{c.name} · {c.role}</label>
          {c.id in selection && <input type="number" min="0" step="0.01" aria-label={`Recce rate for ${c.name}`} className="w-28 rounded border border-input bg-background p-2" value={selection[c.id]} onChange={(e) => change({ ...selection, [c.id]: Math.max(0, Number(e.target.value)) })} />}
        </li>)}
      </ul>
      <button disabled={!dirty || busy || plans.isError || plans.isLoading} onClick={save} className="rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save recce crew"}</button>
    </div>
  </section>;
}
