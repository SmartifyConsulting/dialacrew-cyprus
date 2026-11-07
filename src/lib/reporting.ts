import type { Booking, Production } from "@/lib/demo-data";

// One place that turns raw productions/bookings/invoices/disputes into the five producer questions.
export const BOOKED: Booking["status"][] = ["confirmed", "in_progress", "awaiting_review", "payment_released", "completed"];
export const PENCIL: Booking["status"][] = ["draft", "pencil", "awaiting_crew_confirmation", "open"];

export type InvoiceLite = { production_id: string; booking_id: string; status: string; total: number };
export type DisputeLite = { booking_id: string; status: string; amount_disputed: number };

export type ProductionReport = {
  production: Production;
  committed: number; paid: number; budget: number; budgetUsedPct: number;
  booked: number; pencilled: number; needed: number; unfilled: number;
  daysToShoot: number | null;
  openDisputes: number; disputedAmount: number; unpaidInvoices: number; expiringPencils: number;
  attention: string[];
  health: number;
};

const bookingCost = (b: Booking) =>
  b.crewRate * Math.max(1, b.days) + (b.travelFlightCost ?? 0) + (b.travelVisaCost ?? 0) + (b.travelAccommodationCost ?? 0) + (b.travelFoodCost ?? 0);

export function buildReport(p: Production, bookings: Booking[], invoices: InvoiceLite[], disputes: DisputeLite[], now = new Date()): ProductionReport {
  const mine = bookings.filter((b) => b.productionId === p.id && b.status !== "cancelled");
  const ids = new Set(mine.map((b) => b.id));
  const booked = mine.filter((b) => BOOKED.includes(b.status));
  const pencilled = mine.filter((b) => PENCIL.includes(b.status));
  const committed = booked.reduce((s, b) => s + bookingCost(b), 0);
  const inv = invoices.filter((i) => i.production_id === p.id);
  const paid = inv.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.total || 0), 0);
  const unpaidInvoices = inv.filter((i) => i.status !== "paid" && i.status !== "cancelled").length;
  const disp = disputes.filter((d) => ids.has(d.booking_id) && d.status !== "resolved" && d.status !== "closed");
  const needed = Math.max(p.crewNeeded ?? 0, booked.length);
  const unfilled = Math.max(0, needed - booked.length);
  const start = p.date ? new Date(p.date + "T00:00:00") : null;
  const daysToShoot = start ? Math.ceil((start.getTime() - now.getTime()) / 86400000) : null;
  const soon = now.getTime() + 2 * 86400000;
  const expiringPencils = pencilled.filter((b) => b.pencilExpiresAt && new Date(b.pencilExpiresAt).getTime() <= soon).length;
  const budget = Number(p.budget || 0);
  const budgetUsedPct = budget > 0 ? Math.round((committed / budget) * 100) : 0;

  const attention: string[] = [];
  if (budget > 0 && committed > budget) attention.push(`Over budget by ${Math.round(committed - budget).toLocaleString("en-ZA")}`);
  if (unfilled > 0 && daysToShoot !== null && daysToShoot >= 0 && daysToShoot <= 14) attention.push(`${unfilled} role${unfilled === 1 ? "" : "s"} unfilled, shoot in ${daysToShoot} day${daysToShoot === 1 ? "" : "s"}`);
  if (pencilled.length) attention.push(`${pencilled.length} pencil${pencilled.length === 1 ? "" : "s"} awaiting confirmation`);
  if (expiringPencils) attention.push(`${expiringPencils} pencil${expiringPencils === 1 ? "" : "s"} expiring within 48 hours`);
  if (unpaidInvoices) attention.push(`${unpaidInvoices} invoice${unpaidInvoices === 1 ? "" : "s"} unpaid`);
  if (disp.length) attention.push(`${disp.length} open dispute${disp.length === 1 ? "" : "s"}`);

  // Health: budget (40) + roster (40) + no disputes (20).
  const budgetScore = budget > 0 ? Math.max(0, 40 - Math.max(0, budgetUsedPct - 100) * 2) : 40;
  const rosterScore = needed > 0 ? (booked.length / needed) * 40 : 40;
  const disputeScore = disp.length ? 0 : 20;
  const health = Math.round(Math.min(100, budgetScore + rosterScore + disputeScore));

  return {
    production: p, committed, paid, budget, budgetUsedPct,
    booked: booked.length, pencilled: pencilled.length, needed, unfilled, daysToShoot,
    openDisputes: disp.length, disputedAmount: disp.reduce((s, d) => s + Number(d.amount_disputed || 0), 0),
    unpaidInvoices, expiringPencils, attention, health,
  };
}
