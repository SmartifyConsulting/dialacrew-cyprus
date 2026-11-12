import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCrewTravelStatus(ids: string[], date?: string) {
  const key = [...new Set(ids)].sort();
  return useQuery({ queryKey: ["crew-travel-status", key, date ?? "today"], enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("crew_travel_status", { p_ids: key, ...(date ? { p_on: date } : {}) });
      if (error) throw error;
      return data ?? [];
    }, staleTime: 60_000,
  });
}

export function PassportBadge({ status }: { status: string | undefined }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${status === "valid" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
    {status === "valid" ? "Valid passport" : status === "expired" ? "Passport expired" : status === "missing" ? "No passport" : "Passport status unavailable"}
  </span>;
}

export function CrewPassportBadge({ crewId, date }: { crewId: string; date?: string }) {
  const status = useCrewTravelStatus([crewId], date);
  return <PassportBadge status={status.data?.[0]?.passport_status} />;
}
