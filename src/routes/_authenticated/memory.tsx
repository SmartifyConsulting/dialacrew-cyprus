import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Brain, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Page, Panel } from "@/components/AppShell";
import { matchBrief, refreshMemory, type MatchResult } from "@/lib/memory.functions";

export const Route = createFileRoute("/_authenticated/memory")({
  head: () => ({
    meta: [
      { title: "AI MemoryBank & Crew Matcher — Book a Crew" },
      { name: "description", content: "Describe a brief and get crew and kit matched to each client's learned preferences." },
      { property: "og:title", content: "AI MemoryBank — Book a Crew" },
      { property: "og:description", content: "Crew and kit recommendations that learn from every shoot." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MemoryPage,
});

type Memory = { client: string; summary: string; sources: number; updated_at: string; profile: { style_preferences?: string[]; trusted_crew?: { name: string; reason: string }[]; avoid?: string[]; risks?: string[]; budget_tendencies?: string } };
const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> };
const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";

function MemoryPage() {
  const qc = useQueryClient();
  const clients = useQuery({
    queryKey: ["clients"],
    queryFn: async () => { const { data, error } = await supabase.from("clients").select("id, name, company").order("company"); if (error) throw error; return data ?? []; },
  }).data ?? [];
  const memories = useQuery({
    queryKey: ["company_memory"],
    queryFn: async () => { const { data, error } = await db.from("company_memory").select("*").order("updated_at", { ascending: false }); if (error) throw error; return (data ?? []) as unknown as Memory[]; },
  });
  const match = useServerFn(matchBrief);
  const refresh = useServerFn(refreshMemory);
  const [f, setF] = useState({ client: "", brief: "", days: 1, location: "" });
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<MatchResult | null>(null);
  const [refreshing, setRefreshing] = useState("");

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.brief.trim().length < 10) { toast.error("Describe the brief in a sentence or two."); return; }
    setBusy(true); setRes(null);
    try { setRes(await match({ data: f })); } catch (err) { toast.error(err instanceof Error ? err.message : "Matching failed."); } finally { setBusy(false); }
  };
  const relearn = async (client: string) => {
    setRefreshing(client);
    try { await refresh({ data: { client } }); await qc.invalidateQueries({ queryKey: ["company_memory"] }); toast.success(`${client} memory updated`); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Could not update."); } finally { setRefreshing(""); }
  };
  const mem = memories.data?.find((m) => m.client === f.client);

  return (
    <Page title="AI MemoryBank" subtitle="Describe a brief — the AI matches crew and kit, using what it has learned about each client.">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Brief matcher">
          <form onSubmit={run} className="grid gap-3 p-4">
            <select className={field} value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}>
              <option value="">Client (optional — enables MemoryBank)</option>
              {clients.map((c) => <option key={c.id} value={c.company}>{c.company}</option>)}
            </select>
            {mem && <p className="rounded-sm border border-primary/40 bg-primary/10 p-2 text-xs"><Brain className="mr-1 inline h-3.5 w-3.5 text-primary" />Using memory: {mem.summary}</p>}
            <textarea className={`${field} min-h-32`} maxLength={4000} placeholder="e.g. 30-second gin commercial, golden-hour exteriors in the Karoo, drone shots, small agile crew, moody cinematic look…" value={f.brief} onChange={(e) => setF({ ...f, brief: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <input className={field} type="number" min={1} value={f.days} onChange={(e) => setF({ ...f, days: Math.max(1, +e.target.value) })} aria-label="Shoot days" />
              <input className={field} placeholder="Location" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
            </div>
            <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold uppercase tracking-widest text-primary-foreground disabled:opacity-60">
              <Sparkles className="h-4 w-4" />{busy ? "Matching…" : "Match crew & kit"}
            </button>
          </form>
          {res && (
            <div className="space-y-4 border-t border-border p-4 text-sm">
              <p>{res.analysis}</p>
              {res.memory_insights.length > 0 && <List title="From the MemoryBank" items={res.memory_insights} />}
              {res.warnings.length > 0 && <List title="Watch out" items={res.warnings} tone="text-destructive" />}
              <div>
                <h4 className="mb-2 font-display text-xs uppercase tracking-widest text-primary">Recommended crew</h4>
                <ul className="space-y-2">{res.crew.map((c) => (
                  <li key={c.crew_id} className="rounded-sm border border-border p-2"><Link to="/crew/$id" params={{ id: c.crew_id }} className="font-semibold hover:text-primary">{c.name}</Link> <span className="text-muted-foreground">· {c.suggested_role}</span><div className="text-xs text-muted-foreground">{c.why}</div></li>
                ))}</ul>
              </div>
              <div>
                <h4 className="mb-2 font-display text-xs uppercase tracking-widest text-primary">Recommended kit</h4>
                <ul className="space-y-2">{res.kit.map((k) => (
                  <li key={k.asset_id} className="rounded-sm border border-border p-2"><span className="font-semibold">{k.name}</span> <span className="text-muted-foreground">· {k.owner}</span><div className="text-xs text-muted-foreground">{k.why}</div></li>
                ))}</ul>
              </div>
            </div>
          )}
        </Panel>
        <Panel title="What the AI has learned">
          <div className="space-y-3 p-4 text-sm">
            {memories.isLoading && <p className="text-muted-foreground">Loading…</p>}
            {!memories.isLoading && !memories.data?.length && <p className="text-muted-foreground">Nothing yet. Memory builds from post-shoot reviews (Review tab on a production) and crew ratings. You can also learn now from a client's history:</p>}
            {memories.data?.map((m) => (
              <div key={m.client} className="rounded-sm border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.client}</span>
                  <button onClick={() => relearn(m.client)} disabled={!!refreshing} className="text-muted-foreground hover:text-primary" aria-label={`Relearn ${m.client}`}><RefreshCw className={`h-4 w-4 ${refreshing === m.client ? "animate-spin" : ""}`} /></button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{m.summary}</p>
                {m.profile.style_preferences?.length ? <List title="Style & preferences" items={m.profile.style_preferences} /> : null}
                {m.profile.trusted_crew?.length ? <List title="Trusted crew" items={m.profile.trusted_crew.map((t) => `${t.name} — ${t.reason}`)} /> : null}
                {m.profile.avoid?.length ? <List title="Avoid" items={m.profile.avoid} tone="text-destructive" /> : null}
                {m.profile.risks?.length ? <List title="Known risks" items={m.profile.risks} /> : null}
                <p className="mt-2 text-[11px] text-muted-foreground">Learned from {m.sources} review(s) and ratings · {new Date(m.updated_at).toLocaleDateString()}</p>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-2">
              {clients.filter((c) => !memories.data?.some((m) => m.client === c.company)).map((c) => (
                <button key={c.id} onClick={() => relearn(c.company)} disabled={!!refreshing} className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary disabled:opacity-50">
                  {refreshing === c.company ? "Learning…" : `Learn ${c.company}`}
                </button>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </Page>
  );
}

function List({ title, items, tone = "" }: { title: string; items: string[]; tone?: string }) {
  return (
    <div className="mt-2">
      <h5 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h5>
      <ul className={`mt-1 list-disc space-y-0.5 pl-5 text-xs ${tone}`}>{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
