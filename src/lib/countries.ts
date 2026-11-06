export const COUNTRIES = [
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "CY", name: "Cyprus", currency: "EUR" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "NA", name: "Namibia", currency: "NAD" },
  { code: "BW", name: "Botswana", currency: "BWP" },
  { code: "ZW", name: "Zimbabwe", currency: "USD" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
];

export const currencyForCountry = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === code)?.currency ?? "ZAR";

export type Country = { code: string; name: string; currency: string };
export const COUNTRIES_KEY = "countries";

/** Validates an admin-edited country. Returns an error message, or null when valid. */
export function validateCountry(c: Country, list: Country[], editingCode?: string): string | null {
  if (!c.name.trim()) return "Enter the country name";
  if (!/^[A-Z]{2}$/.test(c.code)) return "The code must be 2 letters, e.g. KE";
  if (!/^[A-Z]{3}$/.test(c.currency)) return "The currency must be 3 letters, e.g. KES";
  if (c.code !== editingCode && list.some((x) => x.code === c.code)) return "That country code already exists";
  return null;
}
