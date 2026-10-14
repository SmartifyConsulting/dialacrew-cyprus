import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { zar, type Production } from "@/lib/demo-data";

/** Production Summary + Project Risks cards shown under Overview. Risks come from the client's MemoryBank. */
export function ProjectInsights({ p, isProducer }: { p: Production; isProducer: boolean }) {
  const mem = useQuery({
    queryKey: ["company-memory", p.client],
    queryFn: async () => { const { data } = await supabase.from("company_memory").select("profile").eq("client", p.client).maybeSingle(); return (data?.profile ?? null) as { risks?: string[]; avoid?: string[] } | null; },
    enabled: isProducer,
  });
  const risks: string[] = [];
  if (!p.address && !p.latitude) risks.push("Site location not set — check-ins can't be confirmed.");
  if (p.crewBooked < p.crewNeeded) risks.push(`${p.crewNeeded - p.crewBooked} crew position(s) still open.`);
  if (p.securedFunds < p.budget) risks.push(`Funds secured ${zar(p.securedFunds)} of ${zar(p.budget)} budget.`);
  for (const r of mem.data?.risks ?? []) risks.push(r);
  for (const a of mem.data?.avoid ?? []) risks.push(`Client flagged: ${a}`);

  return (
    <>
      <Panel title="Production Summary">
        <div className="space-y-2 p-4 text-sm">
          <p className="whitespace-pre-wrap">{p.summary || "No summary yet."}</p>
          <div className="flex items-start gap-2 text-xs"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{p.address || p.location || "Address not set"}</span></div>
          {(p.address || p.latitude) && (
            <a className="inline-flex items-center gap-1 rounded-sm border border-primary px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10" target="_blank" rel="noopener noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.latitude ? `${p.latitude},${p.longitude}` : p.address ?? "")}`}>
              <MapPin className="h-3 w-3" /> Open in Maps
            </a>
          )}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <dt>Client</dt><dd className="text-foreground">{p.client}</dd>
            <dt>Type</dt><dd className="text-foreground">{p.type}</dd>
            <dt>Shoot</dt><dd className="text-foreground">{p.date || "TBC"} · {p.days} day(s)</dd>
            <dt>Crew</dt><dd className="text-foreground">{p.crewBooked} / {p.crewNeeded}</dd>
            {isProducer && <><dt>Budget</dt><dd className="text-foreground">{zar(p.budget)}</dd></>}
          </dl>
        </div>
      </Panel>
      <Panel title="Project Risks">
        <ul className="space-y-2 p-4 text-sm">
          {risks.length === 0 && <li className="text-muted-foreground">No risks flagged.</li>}
          {risks.map((r) => <li key={r} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {r}</li>)}
        </ul>
      </Panel>
    </>
  );
}
