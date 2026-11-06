import { createServerFn } from "@tanstack/react-start";

// US dollar → rand for showing the Token Ledger in rand. Cached for 6 hours; null if unavailable.
let cache: { rate: number; asOf: string; at: number } | null = null;

export const getUsdZarRate = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return { rate: cache.rate, asOf: cache.asOf };
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { rates?: Record<string, number>; time_last_update_utc?: string };
    const rate = Number(json.rates?.ZAR);
    if (!Number.isFinite(rate) || rate < 5 || rate > 100) throw new Error("implausible rate");
    const asOf = json.time_last_update_utc ? new Date(json.time_last_update_utc).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    cache = { rate, asOf, at: Date.now() };
    return { rate, asOf };
  } catch {
    return cache ? { rate: cache.rate, asOf: cache.asOf } : null;
  }
});
