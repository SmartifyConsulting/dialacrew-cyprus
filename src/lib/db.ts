import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Booking, Crew, Production } from "@/lib/demo-data";

export type ChangeRequest = { id: string; kind: string; production: string; who: string; detail: string; amount: number; state: string };

const toProduction = (r: any): Production => ({
  id: r.id, name: r.name, client: r.client, type: r.type, location: r.location, date: r.date ?? "",
  days: r.days, status: r.status, budget: Number(r.budget), crewBooked: r.crew_booked,
  crewNeeded: r.crew_needed, securedFunds: Number(r.secured_funds),
  address: r.address ?? "", summary: r.summary ?? "", latitude: r.latitude, longitude: r.longitude, geofenceM: r.geofence_m ?? 10,
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
  bookingDate: r.booking_date ?? null, callTime: r.call_time ?? null, wrapTime: r.wrap_time ?? null,
  pencilPriority: r.pencil_priority ?? null, pencilExpiresAt: r.pencil_expires_at ?? null,
  createdBy: r.created_by ?? null, cancelledReason: r.cancelled_reason ?? null,
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

export const useCreatePencil = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { productionId: string; crewId: string; role: string; bookingDate: string; callTime?: string; wrapTime?: string; crewRate: number; clientCharge: number; days: number }) => {
      const { error } = await supabase.from("bookings").insert({
        production_id: f.productionId, crew_id: f.crewId, role: f.role, status: "pencil",
        booking_date: f.bookingDate || null, call_time: f.callTime || null, wrap_time: f.wrapTime || null,
        crew_rate: f.crewRate, client_charge: f.clientCharge, days: f.days,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
};

export const useMarkJobCompleted = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bookings").update({ status: "awaiting_review" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
};

export const useMarkPaymentReceived = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => { const { error } = await supabase.rpc("mark_payment_received", { _booking: bookingId }); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
};

export const useApproveJob = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => { const { error } = await supabase.rpc("approve_job", { _booking: bookingId }); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
};

export const useReleasePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => { const { data, error } = await supabase.rpc("release_payment", { _booking: bookingId }); if (error) throw error; return data as string; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); qc.invalidateQueries({ queryKey: ["invoices"] }); },
  });
};

export const useCancelBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { bookingId: string; reason: string; postponedTo?: string }) => {
      const { error } = await supabase.rpc("cancel_booking", { _booking: f.bookingId, _reason: f.reason, _postponed_to: f.postponedTo || null });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
};

export type Invoice = { id: string; invoice_number: string; booking_id: string; crew_id: string; production_id: string; day_rate: number; days: number; overtime_amount: number; equipment_amount: number; subtotal: number; vat_rate: number; vat_amount: number; total: number; status: string; created_at: string };

export const useInvoices = (crewId?: string) => useQuery({
  queryKey: ["invoices", crewId ?? "all"],
  queryFn: async () => {
    const b = supabase.from("invoices").select("*").order("created_at", { ascending: false });
    const { data, error } = crewId ? await b.eq("crew_id", crewId) : await b;
    if (error) throw error;
    return (data ?? []) as Invoice[];
  },
});

export const useRespondToBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: "confirmed" | "cancelled"; reason?: string }) => {
      const { error } = await supabase.from("bookings").update({ status, ...(reason ? { cancelled_reason: reason } : {}) }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
};

export const useRequestOvertime = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { bookingId: string; production: string; who: string; hours: number; amount: number; reason: string }) => {
      const { error } = await supabase.from("change_requests").insert({
        kind: "Overtime", booking_id: f.bookingId, production: f.production, who: f.who,
        detail: `${f.hours}h overtime — ${f.reason}`, amount: f.amount,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["requests"] }),
  });
};

export type RateNegotiation ={ id: string; booking_id: string; proposed_by: string; proposed_rate: number; status: "pending" | "accepted" | "declined" | "countered"; note: string; created_at: string };

export const useNegotiations = (bookingId: string, enabled = true) => useQuery({
  queryKey: ["negotiations", bookingId],
  enabled,
  queryFn: async () => {
    const { data, error } = await supabase.from("rate_negotiations").select("*").eq("booking_id", bookingId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as RateNegotiation[];
  },
});

export const useProposeRate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { bookingId: string; proposedRate: number; note?: string }) => {
      const { error } = await supabase.from("rate_negotiations").insert({ booking_id: f.bookingId, proposed_rate: f.proposedRate, note: f.note ?? "" });
      if (error) throw error;
    },
    onSuccess: (_d, f) => { qc.invalidateQueries({ queryKey: ["negotiations", f.bookingId] }); },
  });
};

export const useRespondToNegotiation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, bookingId, status }: { id: string; bookingId: string; status: "accepted" | "declined" }) => {
      const { error } = await supabase.from("rate_negotiations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, f) => { qc.invalidateQueries({ queryKey: ["negotiations", f.bookingId] }); qc.invalidateQueries({ queryKey: ["bookings"] }); },
  });
};
