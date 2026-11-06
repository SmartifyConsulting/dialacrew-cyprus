import { usePlatformSetting } from "@/lib/auth";
import { COUNTRIES, COUNTRIES_KEY, type Country } from "@/lib/countries";

/** Admin-managed country list (Admin › Countries); falls back to the built-in list. */
export function useCountries(): Country[] {
  const q = usePlatformSetting(COUNTRIES_KEY);
  const v = q.data as Country[] | null | undefined;
  return Array.isArray(v) && v.length ? v : COUNTRIES;
}
