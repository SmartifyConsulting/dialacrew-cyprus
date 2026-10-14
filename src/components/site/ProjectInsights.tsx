import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { zar, type Production } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

/**
 * Project Risks: production-team-only (never shown to crew or clients — the caller must gate this
 * component on isProducer). Combines auto-flagged risks (computed, read-only) with manually added
 * risks the team can create, edit away, and delete.
 */
export function ProjectInsights({ p, isProducer }: { p: Production; isProducer: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const mem = useQuery({
    queryKey: ["company-memory", p.client],
    queryFn: async () => { const { data } = await supabase.from("company_memory").select("profile").eq("client", p.client).maybeSingle(); return (data?.profile ?? null) as { risks?: string[]; avoid?: string[] } | null; },
    enabled: isProducer,
  });

  const customRisks = useQuery({
    queryKey: ["production-risks", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_risks").select("*").eq("production_id", p.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: isProducer,
  });

  const autoRisks: string[] = [];
  if (!p.address && !p.latitude) autoRisks.push("Site location not set — check-ins can't be confirmed.");
  if (p.crewBooked < p.crewNeeded) autoRisks.push(`${p.crewNeeded - p.crewBooked} crew position(s) still open.`);
  if (p.securedFunds < p.budget) autoRisks.push(`Funds secured ${zar(p.securedFunds)} of ${zar(p.budget)} budget.`);
  for (const r of mem.data?.risks ?? []) autoRisks.push(r);
  for (const a of mem.data?.avoid ?? []) autoRisks.push(`Client flagged: ${a}`);

  async function addRisk() {
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("production_risks").insert({ production_id: p.id, text: text.trim() });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setText("");
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["production-risks", p.id] });
  }

  async function removeRisk(id: string) {
    const { error } = await supabase.from("production_risks").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["production-risks", p.id] });
  }

  if (!isProducer) return null;

  return (
    <Panel title="Project Risks" right={!adding ? (
      <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Add risk</button>
    ) : undefined}>
      {adding && (
        <div className="flex gap-2 border-b border-border p-4">
          <input className={`${input} flex-1`} placeholder="Describe the risk" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addRisk(); }} autoFocus />
          <button disabled={busy} onClick={addRisk} className={btn}>{busy ? "Adding…" : "Add"}</button>
          <button onClick={() => { setAdding(false); setText(""); }} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
        </div>
      )}
      <ul className="space-y-2 p-4 text-sm">
        {autoRisks.length === 0 && (customRisks.data ?? []).length === 0 && <li className="text-muted-foreground">No risks flagged.</li>}
        {autoRisks.map((r) => <li key={r} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {r}</li>)}
        {(customRisks.data ?? []).map((r) => (
          <li key={r.id} className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1">{r.text}</span>
            <button onClick={() => removeRisk(r.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove risk"><Trash2 className="h-3.5 w-3.5" /></button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
