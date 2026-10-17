import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { zar, type Production } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Risk = { id: string; text: string; location_id: string | null };

/* Producer-only. Risks are scoped to one location, or to the whole project when location_id is null. */
function useRisks(p: Production) {
  return useQuery({
    queryKey: ["production-risks", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_risks").select("id, text, location_id").eq("production_id", p.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Risk[];
    },
  });
}

function RiskForm({ productionId, locationId, onDone }: { productionId: string; locationId: string | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("production_risks").insert({ production_id: productionId, location_id: locationId, text: text.trim() });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setText("");
    onDone();
    qc.invalidateQueries({ queryKey: ["production-risks", productionId] });
  }

  return (
    <div className="flex gap-2">
      <input className={`${input} flex-1`} placeholder="Describe the risk" value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }} autoFocus />
      <button disabled={busy} onClick={add} className={btn}>{busy ? "Adding…" : "Add"}</button>
      <button onClick={onDone} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
    </div>
  );
}

function ManualRisk({ risk, productionId }: { risk: Risk; productionId: string }) {
  const qc = useQueryClient();
  async function remove() {
    const { error } = await supabase.from("production_risks").delete().eq("id", risk.id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["production-risks", productionId] });
  }
  return (
    <li className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span className="flex-1">{risk.text}</span>
      <button onClick={remove} className="text-muted-foreground hover:text-destructive" aria-label="Remove risk"><Trash2 className="h-3.5 w-3.5" /></button>
    </li>
  );
}

/* Project-wide: funding, crew gaps, and client/company memory flags that don't belong to one location. */
export function ProjectWideRisks({ p }: { p: Production }) {
  const [adding, setAdding] = useState(false);
  const risks = useRisks(p);
  const mem = useQuery({
    queryKey: ["company-memory", p.client],
    queryFn: async () => { const { data } = await supabase.from("company_memory").select("profile").eq("client", p.client).maybeSingle(); return (data?.profile ?? null) as { risks?: string[]; avoid?: string[] } | null; },
  });

  const auto: string[] = [];
  if (p.crewBooked < p.crewNeeded) auto.push(`${p.crewNeeded - p.crewBooked} crew position(s) still open.`);
  if (p.securedFunds < p.budget) auto.push(`Funds secured ${zar(p.securedFunds)} of ${zar(p.budget)} budget.`);
  for (const r of mem.data?.risks ?? []) auto.push(r);
  for (const a of mem.data?.avoid ?? []) auto.push(`Client flagged: ${a}`);
  const manual = (risks.data ?? []).filter((r) => r.location_id === null);

  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project-wide risks</div>
        {!adding && <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add risk</button>}
      </div>
      {adding && <div className="mt-3"><RiskForm productionId={p.id} locationId={null} onDone={() => setAdding(false)} /></div>}
      <ul className="mt-3 space-y-2 text-sm">
        {auto.length === 0 && manual.length === 0 && <li className="text-muted-foreground">No project-wide risks flagged.</li>}
        {auto.map((r) => <li key={r} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {r}</li>)}
        {manual.map((r) => <ManualRisk key={r.id} risk={r} productionId={p.id} />)}
      </ul>
    </div>
  );
}

/* Risks for one location: flags its own gaps (e.g. no map point, so check-ins can't be confirmed) plus anything the team adds. */
export function LocationRisks({ p, locationId, hasCoords }: { p: Production; locationId: string; hasCoords: boolean }) {
  const [adding, setAdding] = useState(false);
  const risks = useRisks(p);
  const manual = (risks.data ?? []).filter((r) => r.location_id === locationId);

  return (
    <div className="mt-2 space-y-2 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risks</div>
        {!adding && <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add risk</button>}
      </div>
      {adding && <RiskForm productionId={p.id} locationId={locationId} onDone={() => setAdding(false)} />}
      <ul className="space-y-2 text-sm">
        {!hasCoords && <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> No map location set — check-ins can't be confirmed here.</li>}
        {manual.map((r) => <ManualRisk key={r.id} risk={r} productionId={p.id} />)}
        {hasCoords && manual.length === 0 && <li className="text-muted-foreground">No risks flagged.</li>}
      </ul>
    </div>
  );
}
