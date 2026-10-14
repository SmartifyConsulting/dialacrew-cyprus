import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { zar, type Production } from "@/lib/demo-data";

/** Project Risks card shown under Overview. Risks come from the client's MemoryBank. The production summary itself lives in the Overview panel. */
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
    <Panel title="Project Risks">
      <ul className="space-y-2 p-4 text-sm">
        {risks.length === 0 && <li className="text-muted-foreground">No risks flagged.</li>}
        {risks.map((r) => <li key={r} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {r}</li>)}
      </ul>
    </Panel>
  );
}
