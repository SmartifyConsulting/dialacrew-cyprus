import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { overtimeAmount, shiftLabel, type OvertimeShift } from "@/lib/costing";
import { fmtMoney } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-2 py-1.5 text-xs outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50";

export type OvertimeRequest = {
  id: string; crew_id: string; shift: string; status: string; decline_reason: string | null;
  requested_at: string; accepted_at: string | null; ended_at: string | null;
};

export function useOvertimeRequests(productionId: string): OvertimeRequest[] {
  return useQuery({
    queryKey: ["overtime", productionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("overtime_requests").select("id, crew_id, shift, status, decline_reason, requested_at, accepted_at, ended_at")
        .eq("production_id", productionId).order("requested_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OvertimeRequest[];
    },
  }).data ?? [];
}

// Each crew member's day rate on this production, from their booking.
export function useBookingRates(productionId: string): Record<string, number> {
  const rows = useQuery({
    queryKey: ["booking-rates", productionId],
    queryFn: async () => {
      const { data, error } = await supabase.from("bookings").select("crew_id, crew_rate").eq("production_id", productionId).neq("status", "cancelled");
      if (error) throw error;
      return data ?? [];
    },
  }).data ?? [];
  return Object.fromEntries(rows.filter((r) => r.crew_id).map((r) => [r.crew_id as string, Number(r.crew_rate ?? 0)]));
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
export const hoursSince = (from: string, to: number) => Math.max(0, (to - new Date(from).getTime()) / 3600000);
export function durationLabel(hours: number) {
  const mins = Math.round(hours * 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}

// The request that is live for a crew member: pending, or accepted and not yet ended.
export function liveRequest(requests: OvertimeRequest[], crewId: string) {
  return requests.find((r) => r.crew_id === crewId && (r.status === "pending" || (r.status === "accepted" && !r.ended_at)));
}

export function OvertimeStatus({ request, rate, date, now }: { request: OvertimeRequest; rate: number; date: string | null; now: number }) {
  if (request.status === "pending") return <span className="text-[11px] text-muted-foreground">Overtime requested · waiting for response</span>;
  if (request.status === "declined") return <span className="text-[11px] text-destructive">Overtime declined{request.decline_reason ? `: ${request.decline_reason}` : ""}</span>;
  if (!request.accepted_at) return null;
  const end = request.ended_at ? new Date(request.ended_at).getTime() : now;
  const hours = hoursSince(request.accepted_at, end);
  const amount = overtimeAmount(rate, hours, date, request.shift as OvertimeShift);
  return (
    <span className="text-[11px] text-muted-foreground">
      Overtime {request.ended_at ? "ended" : "running"} since {clock(request.accepted_at)} · {durationLabel(hours)} · {fmtMoney(amount)} ({shiftLabel(date, request.shift as OvertimeShift)})
    </span>
  );
}

export function RequestOvertimeButton({ productionId, crewId, live }: { productionId: string; crewId: string; live: OvertimeRequest | undefined }) {
  const qc = useQueryClient();
  const [shift, setShift] = useState<OvertimeShift>("day");
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    const { error } = await supabase.from("overtime_requests").insert({ production_id: productionId, crew_id: crewId, shift });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Overtime requested — the crew member has been asked to accept");
    qc.invalidateQueries({ queryKey: ["overtime", productionId] });
  }

  return (
    <div className="flex items-center gap-1">
      <select aria-label="Overtime shift" value={shift} disabled={!!live} onChange={(e) => setShift(e.target.value as OvertimeShift)} className={`${input} py-1`}>
        <option value="day">Day (1.5×)</option>
        <option value="night">Night (2×)</option>
      </select>
      <button onClick={request} disabled={busy || !!live} className={btn}>Overtime</button>
    </div>
  );
}

export function CrewOvertimePanel({ productionId, crewId, rate, date }: { productionId: string; crewId: string; rate: number; date: string | null }) {
  const qc = useQueryClient();
  const requests = useOvertimeRequests(productionId);
  const now = useNow();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const live = liveRequest(requests, crewId);
  if (!live) return null;

  async function respond(status: "accepted" | "declined") {
    setBusy(true);
    const { error } = await supabase.from("overtime_requests")
      .update({ status, decline_reason: status === "declined" ? (reason.trim() || null) : null }).eq("id", live!.id);
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(status === "accepted" ? "Overtime accepted — the clock has started" : "Overtime declined");
    qc.invalidateQueries({ queryKey: ["overtime", productionId] });
  }

  return (
    <div className="rounded-sm border border-primary/40 bg-primary/5 p-4 text-sm">
      <div className="font-semibold">Overtime request</div>
      {live.status === "pending" ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Your producer has asked you to work overtime ({shiftLabel(date, live.shift as OvertimeShift)}, {fmtMoney(overtimeAmount(rate, 1, date, live.shift as OvertimeShift))} per hour). The clock starts when you accept.
          </p>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for declining (optional)" className={`${input} mt-2 w-full`} />
          <div className="mt-2 flex gap-2">
            <button disabled={busy} onClick={() => respond("accepted")} className={btn}>Accept</button>
            <button disabled={busy} onClick={() => respond("declined")} className="rounded-sm bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50">Decline</button>
          </div>
        </>
      ) : (
        <div className="mt-1"><OvertimeStatus request={live} rate={rate} date={date} now={now} /></div>
      )}
    </div>
  );
}
