import { useSyncExternalStore } from "react";

// Crew picker country filter. "local" = the production's own country (default); "ALL" = everywhere.
export const CREW_COUNTRIES = [
  { code: "ZA", label: "South Africa" },
  { code: "CY", label: "Cyprus" },
  { code: "NG", label: "Nigeria" },
  { code: "IN", label: "India" },
] as const;

const CURRENCY_COUNTRY: Record<string, string> = { ZAR: "ZA", EUR: "CY", NGN: "NG", INR: "IN" };

/** The production's local country, from its currency; falls back to South Africa. */
export function productionCountry(currency: string | null | undefined): string {
  return CURRENCY_COUNTRY[(currency ?? "").toUpperCase()] ?? "ZA";
}

/** Does this crew member pass the filter? */
export function matchesCountry(crewCountry: string | null | undefined, filter: string, localCountry: string): boolean {
  if (filter === "ALL") return true;
  const want = filter === "local" ? localCountry : filter;
  return (crewCountry ?? "ZA").toUpperCase() === want;
}

let value = "local";
const listeners = new Set<() => void>();
export function setCrewCountryFilter(v: string) { value = v; listeners.forEach((l) => l()); }
export function useCrewCountryFilter() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => value, () => "local");
}
