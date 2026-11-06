export type Production = {
  id: string; name: string; client: string; type: string; location: string; jobId?: string | null; externalRef?: string | null;
  date: string; endDate?: string | null; recceDate?: string | null; days: number; status: "Draft" | "Active" | "Upcoming" | "Wrapped" | "Completed";
  budget: number; crewBooked: number; crewNeeded: number; securedFunds: number;
  address?: string; summary?: string; latitude?: number | null; longitude?: number | null; geofenceM?: number; currency?: string; postRules?: string; postRulesHidden?: boolean; imagePath?: string | null;
  timezone?: string | null; recceStart?: string | null; recceEnd?: string | null;
  gearPickupDate?: string | null; gearPickupTime?: string | null; gearDropoffDate?: string | null; gearDropoffTime?: string | null;
  travelRequired?: boolean;
  createdAt?: string;
};

export type Crew = {
  id: string; name: string; role: string; department: string; location: string;
  rating: number; dayRate: number; available: boolean; experience: number; kit?: string; skills?: string[]; country?: string;
};

export type BookingStatus =
  | "draft" | "pencil" | "awaiting_crew_confirmation" | "confirmed"
  | "in_progress" | "awaiting_review" | "payment_released" | "completed" | "cancelled" | "disputed" | "open";

export type Booking = {
  id: string; productionId: string; crewId: string | null; role: string;
  status: BookingStatus;
  crewRate: number; clientCharge: number; days: number;
  attendance?: "On set" | "Late" | "Not arrived" | "Wrapped";
  bookingDate?: string | null; callTime?: string | null; wrapTime?: string | null;
  pencilPriority?: number | null; pencilExpiresAt?: string | null;
  createdBy?: string | null; cancelledReason?: string | null;
  createdAt?: string;
  // Extra production-paid costs when the production requires international travel.
  travelFlightCost?: number; travelVisaCost?: number; travelAccommodationCost?: number; travelFoodCost?: number; travelPerDiemRate?: number;
};

export const zar = (n: number) => "R" + n.toLocaleString("en-ZA");
const CURRENCY_SYMBOLS: Record<string, string> = { ZAR: "R", EUR: "€", GBP: "£", USD: "$", AUD: "A$", NGN: "₦" };
export const fmtMoney = (n: number, currency = "ZAR") => (CURRENCY_SYMBOLS[currency] ?? currency + " ") + n.toLocaleString("en-ZA");
