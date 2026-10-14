import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/AppShell";
import { matchBrief, type MatchResult } from "@/lib/memory.functions";
import type { Production } from "@/lib/demo-data";

const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

/** AI MemoryBank crew & kit matcher, pre-filled from the production. */
export function BriefMatcher({ p }: { p: Production }) {
  const match = useServerFn(matchBrief);
  const [brief, setBrief] = useState(p.summary ?? "");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<MatchResult | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (brief.trim().length < 10) { toast.error("Describe the brief in a sentence or two."); return; }
    setBusy(true); setRes(null);
    try { setRes(await match({ data: { client: p.client, brief, days: p.days || 1, location: p.address || p.location } })); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Matching failed."); }
    finally { setBusy(false); }
  };

  return (
    <Panel title="Find crew · AI MemoryBank">
      <form onSubmit={run} className="grid gap-3 p-4">
        <p className="text-xs text-muted-foreground">Uses what the AI has learned about {p.client}.</p>
        <textarea className={`${field} min-h-28`} maxLength={4000} placeholder="Describe the brief: look, shots, crew size…" value={brief} onChange={(e) => setBrief(e.target.value)} />
        <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground disabled:opacity-60">
          <Sparkles className="h-4 w-4" />{busy ? "Matching…" : "Match crew & kit"}
        </button>
      </form>
      {res && (
        <div className="space-y-4 border-t border-border p-4 text-sm">
          <p>{res.analysis}</p>
          {res.warnings.length > 0 && <ul className="list-disc pl-5 text-destructive">{res.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          <div>
            <h4 className="mb-2 font-display text-xs text-primary">Recommended crew</h4>
            <ul className="space-y-2">{res.crew.map((c) => (
              <li key={c.crew_id} className="rounded-sm border border-border p-2"><Link to="/crew/$id" params={{ id: c.crew_id }} className="font-semibold hover:text-primary">{c.name}</Link> <span className="text-muted-foreground">· {c.suggested_role}</span><div className="text-xs text-muted-foreground">{c.why}</div></li>
            ))}</ul>
          </div>
          <div>
            <h4 className="mb-2 font-display text-xs text-primary">Recommended kit</h4>
            <ul className="space-y-2">{res.kit.map((k) => (
              <li key={k.asset_id} className="rounded-sm border border-border p-2"><span className="font-semibold">{k.name}</span> <span className="text-muted-foreground">· {k.owner}</span><div className="text-xs text-muted-foreground">{k.why}</div></li>
            ))}</ul>
          </div>
        </div>
      )}
    </Panel>
  );
}
