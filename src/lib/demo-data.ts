export type Production = {
  id: string; name: string; client: string; type: string; location: string;
  date: string; endDate?: string | null; days: number; status: "Draft" | "Active" | "Upcoming" | "Wrapped";
  budget: number; crewBooked: number; crewNeeded: number; securedFunds: number;
  address?: string; summary?: string; latitude?: number | null; longitude?: number | null; geofenceM?: number;
};

export type Crew = {
  id: string; name: string; role: string; department: string; location: string;
  rating: number; dayRate: number; available: boolean; experience: number; kit?: string;
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
};

export const zar = (n: number) => "R" + n.toLocaleString("en-ZA");
