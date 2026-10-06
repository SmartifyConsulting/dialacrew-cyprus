import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Booking, Crew, Production } from "@/lib/demo-data";

export type ChangeRequest = { id: string; kind: string; production: string; who: string; detail: string; amount: number; state: string };

const toProduction = (r: any): Production => ({
  id: r.id, name: r.name, client: r.client, type: r.type, location: r.location, date: r.date ?? "",
  days: r.days, status: r.status, budget: Number(r.budget), crewBooked: r.crew_booked,
  crewNeeded: r.crew_needed, securedFunds: Number(r.secured_funds),
});
const toCrew = (r: any): Crew & { pencilled: boolean } => ({
  id: r.id, name: r.name, role: r.role, department: r.department, location: r.location,
  rating: Number(r.rating), dayRate: Number(r.day_rate), available: r.available,
  experience: r.experience, kit: r.kit ?? undefined, pencilled: r.pencilled,
});
const toBooking = (r: any): Booking => ({
  id: r.id, productionId: r.production_id, crewId: r.crew_id, role: r.role, status: r.status,
  crewRate: Number(r.crew_rate), clientCharge: Number(r.client_charge), days: r.days,
  attendance: r.attendance ?? undefined,
});

const run = async <T,>(p: PromiseLike<{ data: any; error: any }>, map: (r: any) => T): Promise<T[]> => {
  const { data, error } = await p;
  if (error) throw error;
  return (data ?? []).map(map);
};

export const useProductions = () => useQuery({
  queryKey: ["productions"],
  queryFn: () => run(supabase.from("productions").select("*").order("date", { ascending: true }), toProduction),
});
export const useCrew = () => useQuery({
  queryKey: ["crew"],
  queryFn: () => run(supabase.from("crew_members").select("*").order("name"), toCrew),
});
export const useBookings = () => useQuery({
  queryKey: ["bookings"],
  queryFn: () => run(supabase.from("bookings").select("*").order("id"), toBooking),
});
export const useRequests = () => useQuery({
  queryKey: ["requests"],
  queryFn: () => run(supabase.from("change_requests").select("*").order("id"), (r) => ({ ...r, amount: Number(r.amount) }) as ChangeRequest),
});

export const useCreateProduction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { name: string; client: string; type: string; location: string; date: string; days: number; budget: number }) => {
      const { error } = await supabase.from("productions").insert({ ...f, date: f.date || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["productions"] }),
  });
};
export const useTogglePencil = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pencilled }: { id: string; pencilled: boolean }) => {
      const { error } = await supabase.from("crew_members").update({ pencilled }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew"] }),
  });
};
export const useSetRequestState = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, state }: { id: string; state: string }) => {
      const { error } = await supabase.from("change_requests").update({ state }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
};
