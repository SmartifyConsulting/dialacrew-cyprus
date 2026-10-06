export type Production = {
  id: string; name: string; client: string; type: string; location: string;
  date: string; days: number; status: "Active" | "Upcoming" | "Wrapped";
  budget: number; crewBooked: number; crewNeeded: number; securedFunds: number;
};

export type Crew = {
  id: string; name: string; role: string; department: string; location: string;
  rating: number; dayRate: number; available: boolean; experience: number; kit?: string;
};

export type Booking = {
  id: string; productionId: string; crewId: string; role: string;
  status: "Pencil" | "Confirmed" | "Pending" | "Declined";
  crewRate: number; clientCharge: number; days: number;
  attendance?: "On set" | "Late" | "Not arrived" | "Wrapped";
};

export const productions: Production[] = [
  { id: "p1", name: "Savanna Gin — Summer TVC", client: "Savanna Drinks Co.", type: "Commercial", location: "Cape Town, Camps Bay", date: "2026-10-12", days: 3, status: "Active", budget: 1_250_000, crewBooked: 22, crewNeeded: 26, securedFunds: 480_000 },
  { id: "p2", name: "Northbound — Feature Film", client: "Atlas Pictures", type: "Film", location: "Johannesburg", date: "2026-11-02", days: 28, status: "Upcoming", budget: 8_900_000, crewBooked: 31, crewNeeded: 54, securedFunds: 2_100_000 },
  { id: "p3", name: "Velvet Lookbook AW26", client: "Velvet Studio", type: "Photography", location: "Stellenbosch", date: "2026-10-18", days: 1, status: "Upcoming", budget: 145_000, crewBooked: 6, crewNeeded: 8, securedFunds: 60_000 },
  { id: "p4", name: "Kinetic Bank — Brand Film", client: "Kinetic Bank", type: "Commercial", location: "Durban", date: "2026-09-20", days: 2, status: "Wrapped", budget: 720_000, crewBooked: 18, crewNeeded: 18, securedFunds: 0 },
];

export const crew: Crew[] = [
  { id: "c1", name: "Thandi Mokoena", role: "Director of Photography", department: "Camera", location: "Cape Town", rating: 4.9, dayRate: 8500, available: true, experience: 12, kit: "ARRI Alexa Mini LF" },
  { id: "c2", name: "Pieter van Wyk", role: "Gaffer", department: "Lighting", location: "Cape Town", rating: 4.8, dayRate: 5200, available: false, experience: 15, kit: "3-ton lighting truck" },
  { id: "c3", name: "Lerato Dlamini", role: "1st AC", department: "Camera", location: "Johannesburg", rating: 4.7, dayRate: 3800, available: true, experience: 7 },
  { id: "c4", name: "Sam Naidoo", role: "Sound Recordist", department: "Sound", location: "Durban", rating: 4.6, dayRate: 4200, available: true, experience: 9, kit: "Sound Devices 888" },
  { id: "c5", name: "Ayesha Patel", role: "Make Up Artist", department: "Hair & Makeup", location: "Cape Town", rating: 5.0, dayRate: 3500, available: true, experience: 11 },
  { id: "c6", name: "Johan Botha", role: "Key Grip", department: "Grip", location: "Cape Town", rating: 4.5, dayRate: 4000, available: false, experience: 18 },
  { id: "c7", name: "Nomsa Khumalo", role: "Art Director", department: "Art Department", location: "Johannesburg", rating: 4.8, dayRate: 6500, available: true, experience: 10 },
  { id: "c8", name: "Daniel Fourie", role: "DIT", department: "Camera", location: "Cape Town", rating: 4.7, dayRate: 4500, available: true, experience: 6, kit: "DaVinci Resolve cart" },
  { id: "c9", name: "Zanele Mthembu", role: "Wardrobe Stylist", department: "Wardrobe", location: "Stellenbosch", rating: 4.9, dayRate: 3900, available: true, experience: 8 },
  { id: "c10", name: "Marco Rossi", role: "1st Assistant Director", department: "Production", location: "Cape Town", rating: 4.8, dayRate: 6000, available: false, experience: 14 },
];

export const bookings: Booking[] = [
  { id: "b1", productionId: "p1", crewId: "c1", role: "DOP", status: "Confirmed", crewRate: 8500, clientCharge: 10000, days: 3, attendance: "On set" },
  { id: "b2", productionId: "p1", crewId: "c2", role: "Gaffer", status: "Confirmed", crewRate: 5200, clientCharge: 6200, days: 3, attendance: "On set" },
  { id: "b3", productionId: "p1", crewId: "c5", role: "Make Up", status: "Confirmed", crewRate: 3500, clientCharge: 4200, days: 3, attendance: "Late" },
  { id: "b4", productionId: "p1", crewId: "c8", role: "DIT", status: "Pending", crewRate: 4500, clientCharge: 5400, days: 3, attendance: "Not arrived" },
  { id: "b5", productionId: "p2", crewId: "c7", role: "Art Director", status: "Pencil", crewRate: 6500, clientCharge: 7800, days: 28 },
  { id: "b6", productionId: "p2", crewId: "c3", role: "1st AC", status: "Pencil", crewRate: 3800, clientCharge: 4500, days: 28 },
  { id: "b7", productionId: "p3", crewId: "c9", role: "Wardrobe", status: "Pending", crewRate: 3900, clientCharge: 4600, days: 1 },
  { id: "b8", productionId: "p2", crewId: "c10", role: "1st AD", status: "Declined", crewRate: 6000, clientCharge: 7200, days: 28 },
];

export const requests = [
  { id: "r1", kind: "Overtime", production: "Savanna Gin — Summer TVC", who: "Pieter van Wyk", detail: "2h OT, Day 1 — sunset reshoot", amount: 1300 },
  { id: "r2", kind: "Additional resource", production: "Savanna Gin — Summer TVC", who: "Thandi Mokoena", detail: "Extra camera assistant, 1 day", amount: 2800 },
  { id: "r3", kind: "Equipment", production: "Northbound — Feature Film", who: "Nomsa Khumalo", detail: "Prop truck hire, 5 days", amount: 18000 },
];

export const zar = (n: number) => "R" + n.toLocaleString("en-ZA");
