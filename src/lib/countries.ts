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
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
];

export const currencyForCountry = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === code)?.currency ?? "ZAR";
