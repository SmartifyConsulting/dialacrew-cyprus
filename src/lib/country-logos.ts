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

export function useCountryLogo(kind: "nav" | "signup", country: string | null | undefined) {
  const logos = useCountryLogos();
  const fallback = kind === "nav" ? navFallback.url : signupFallback.url;
  return logos[countryCode(country)]?.[kind] || logos.ZA?.[kind] || fallback;
}

/** Signup visitors: ?country=CY, otherwise the browser's region, otherwise South Africa. */
export function useVisitorCountry() {
  const [code, setCode] = useState("ZA");
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("country");
    const region = navigator.language.split("-")[1];
    setCode(countryCode(param || region));
  }, []);
  return code;
}
