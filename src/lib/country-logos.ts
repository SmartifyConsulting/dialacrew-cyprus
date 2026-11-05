import { useEffect, useState } from "react";
import { usePlatformSetting } from "@/lib/auth";
import { COUNTRIES } from "@/lib/countries";
import navFallback from "@/assets/bookacrew-sa-logo.png.asset.json";
import signupFallback from "@/assets/bookacrew-za-signup.png.asset.json";

export type CountryLogos = Record<string, { nav?: string; signup?: string }>;
export const COUNTRY_LOGOS_KEY = "country_logos";

/** Accepts a country code ("CY") or name ("Cyprus") and returns the code. */
export function countryCode(value: string | null | undefined): string {
  if (!value) return "ZA";
  const v = value.trim().toLowerCase();
  return COUNTRIES.find((c) => c.code.toLowerCase() === v || c.name.toLowerCase() === v)?.code ?? "ZA";
}

export function useCountryLogos() {
  const q = usePlatformSetting(COUNTRY_LOGOS_KEY);
  return (q.data ?? {}) as CountryLogos;
}

/** Country implied by the site address, e.g. cyprus.bookacrew.film → CY. */
export function countryFromHost(host: string | null | undefined): string | null {
  const h = (host ?? "").toLowerCase();
  if (h.startsWith("cyprus.") || h.startsWith("dialacrew-cyprus.")) return "CY";
  if (h.startsWith("nigeria.")) return "NG";
  if (h.startsWith("india.")) return "IN";
  return null;
}

function useHostCountry() {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => setCode(countryFromHost(window.location.hostname)), []);
  return code;
}

export function useCountryLogo(kind: "nav" | "signup", country: string | null | undefined) {
  const logos = useCountryLogos();
  const hostCountry = useHostCountry();
  const fallback = kind === "nav" ? navFallback.url : signupFallback.url;
  const code = hostCountry ?? countryCode(country);
  return logos[code]?.[kind] || logos["ZA"]?.[kind] || fallback;
}

/** Signup visitors: site address, then ?country=CY, then the browser's region, otherwise South Africa. */
export function useVisitorCountry() {
  const [code, setCode] = useState("ZA");
  useEffect(() => {
    const host = countryFromHost(window.location.hostname);
    const param = new URLSearchParams(window.location.search).get("country");
    const region = navigator.language.split("-")[1];
    setCode(host ?? countryCode(param || region));
  }, []);
  return code;
}
