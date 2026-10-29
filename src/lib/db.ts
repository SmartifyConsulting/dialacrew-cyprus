import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Booking, Crew, Production } from "@/lib/demo-data";

export type ChangeRequest = { id: string; kind: string; production: string; who: string; detail: string; amount: number; state: string; createdAt: string };

const toProduction = (r: any): Production => ({
  id: r.id, name: r.name, client: r.client, type: r.type, location: r.location, jobId: r.job_id ?? null, date: r.date ?? "", endDate: r.end_date ?? null, recceDate: r.recce_date ?? null,
  days: r.days, status: r.status, budget: Number(r.budget), crewBooked: r.crew_booked,
  crewNeeded: r.crew_needed, securedFunds: Number(r.secured_funds),
  address: r.address ?? "", summary: r.summary ?? "", latitude: r.latitude, longitude: r.longitude, geofenceM: r.geofence_m ?? 10, currency: r.currency ?? "ZAR", postRules: r.post_rules ?? "", postRulesHidden: !!r.post_rules_hidden, imagePath: r.image_path ?? null,
  timezone: r.timezone ?? null, recceStart: r.recce_start_time ?? null, recceEnd: r.recce_end_time ?? null,
  gearPickupDate: r.gear_pickup_date ?? null, gearPickupTime: r.gear_pickup_time ?? null, gearDropoffDate: r.gear_dropoff_date ?? null, gearDropoffTime: r.gear_dropoff_time ?? null,
});
const toCrew = (r: any): Crew & { pencilled: boolean } => ({
  id: r.id, name: r.name, role: r.role, department: r.department, location: r.location,
  rating: Number(r.rating), dayRate: Number(r.day_rate), available: r.available,
  experience: r.experience, kit: r.kit ?? undefined, skills: r.skills ?? [], pencilled: r.pencilled,
});
const toBooking = (r: any): Booking => ({
  id: r.id, productionId: r.production_id, crewId: r.crew_id, role: r.role, status: r.status,
  crewRate: Number(r.crew_rate), clientCharge: Number(r.client_charge), days: r.days,
  attendance: r.attendance ?? undefined,
  bookingDate: r.booking_date ?? null, callTime: r.call_time ?? null, wrapTime: r.wrap_time ?? null,
  pencilPriority: r.pencil_priority ?? null, pencilExpiresAt: r.pencil_expires_at ?? null,
  createdBy: r.created_by ?? null, cancelledReason: r.cancelled_reason ?? null,
  createdAt: r.created_at, ...({ escrowReleasedAt: r.escrow_released_at ?? null } as object),
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
  queryFn: () => run(supabase.from("change_requests").select("*").order("id"), (r) => ({ ...r, amount: Number(r.amount), createdAt: r.created_at }) as ChangeRequest),
});

// Crew Combos: a named, reusable group of crew members a producer has picked out as working well together.
export type CrewGroup = { id: string; name: string; memberIds: string[]; createdAt: string };

export const useCrewGroups = () => useQuery({
  queryKey: ["crew-groups"],
  queryFn: async () => {
    const [groupsRes, membersRes] = await Promise.all([
      supabase.from("crew_groups").select("id, name, created_at").order("name"),
      supabase.from("crew_group_members").select("group_id, crew_id"),
    ]);
    if (groupsRes.error) throw groupsRes.error;
    if (membersRes.error) throw membersRes.error;
    return (groupsRes.data ?? []).map((g): CrewGroup => ({
      id: g.id, name: g.name, createdAt: g.created_at,
      memberIds: (membersRes.data ?? []).filter((m) => m.group_id === g.id).map((m) => m.crew_id),
    }));
  },
});

export const useCreateCrewGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { name: string; crewIds: string[] }) => {
      const { data, error } = await supabase.from("crew_groups").insert({ name: f.name }).select("id").single();
      if (error) throw error;
      if (f.crewIds.length) {
        const { error: memErr } = await supabase.from("crew_group_members").insert(f.crewIds.map((crew_id) => ({ group_id: data.id, crew_id })));
        if (memErr) throw memErr;
      }
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-groups"] }),
  });
};

export const useDeleteCrewGroup = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crew_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crew-groups"] }),
  });
};

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

export type OpenGig = {
  id: string; role: string; days: number; crew_rate: number; booking_date: string | null; call_time: string | null;
  production_id: string; production_name: string; location: string; address: string; latitude: number | null; longitude: number | null;
};

export const useOpenGigs = () => useQuery({
  queryKey: ["open-gigs"],
  queryFn: async () => { const { data, error } = await supabase.rpc("open_gigs"); if (error) throw error; return (data ?? []) as OpenGig[]; },
});

export const useClaimGig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bookingId: string) => { const { error } = await supabase.rpc("claim_gig", { _booking: bookingId }); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["open-gigs"] }); qc.invalidateQueries({ queryKey: ["bookings"] }); },
  });
};

export const useCreateOpenGig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { productionId: string; role: string; bookingDate: string; callTime?: string; wrapTime?: string; crewRate: number; clientCharge: number; days: number }) => {
      const { error } = await supabase.from("bookings").insert({
        production_id: f.productionId, crew_id: null, role: f.role, status: "open",
        booking_date: f.bookingDate || null, call_time: f.callTime || null, wrap_time: f.wrapTime || null,
        crew_rate: f.crewRate, client_charge: f.clientCharge, days: f.days,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); qc.invalidateQueries({ queryKey: ["open-gigs"] }); },
  });
};

export const useCreatePencil = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (f: { productionId: string; crewId: string; role: string; bookingDate: string; callTime?: string; wrapTime?: string; crewRate: number; clientCharge: number; days: number; priority?: 1 | 2 }) => {
      const { error } = await supabase.from("bookings").insert({
        pencil_priority: f.priority ?? 1,
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
      const { error } = await supabase.rpc("cancel_booking", { _booking: f.bookingId, _reason: f.reason, ...(f.postponedTo ? { _postponed_to: f.postponedTo } : {}) });
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

const PAGE_SIZE = 24;

export const useCrewSearch = (f: { q: string; department: string; availableOnly: boolean; favouriteIds?: string[] | undefined; favouritesOnly: boolean; page: number }) => useQuery({
  queryKey: ["crew-search", f],
  queryFn: async () => {
    let query = supabase.from("crew_members").select("*", { count: "exact" }).order("name");
    if (f.q) query = query.or(`name.ilike.%${f.q}%,role.ilike.%${f.q}%,location.ilike.%${f.q}%`);
    if (f.department !== "All") query = query.eq("department", f.department);
    if (f.availableOnly) query = query.eq("available", true);
    if (f.favouritesOnly) query = query.in("id", f.favouriteIds?.length ? f.favouriteIds : ["__none__"]);
    const from = f.page * PAGE_SIZE, to = from + PAGE_SIZE - 1;
    const { data, error, count } = await query.range(from, to);
    if (error) throw error;
    return { rows: (data ?? []).map(toCrew), total: count ?? 0 };
  },
});

export const useDepartments = () => useQuery({
  queryKey: ["departments"],
  queryFn: async () => {
    const { data, error } = await supabase.from("crew_members").select("department");
    if (error) throw error;
    return ["All", ...Array.from(new Set((data ?? []).map((r) => r.department)))];
  },
});

export const useFavourites =(userId: string | undefined) => useQuery({
  queryKey: ["favourites", userId], enabled: !!userId,
  queryFn: async () => { const { data, error } = await supabase.from("favourites").select("crew_id").eq("user_id", userId!); if (error) throw error; return (data ?? []).map((r) => r.crew_id); },
});

export const useToggleFavourite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ crewId, on }: { crewId: string; on: boolean }) => {
      if (on) { const { error } = await supabase.from("favourites").insert({ crew_id: crewId }); if (error) throw error; }
      else { const { error } = await supabase.from("favourites").delete().eq("crew_id", crewId); if (error) throw error; }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favourites"] }),
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
