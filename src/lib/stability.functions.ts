import { createServerFn } from "@tanstack/react-start";

// Verifies the Stability AI connection using the saved key. Returns only status, never credentials.
export const checkStabilityConnection = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["STABILITY_API_KEY"];
  const base = (process.env["STABILITY_BASE_URL"] || "https://api.stability.ai").replace(/\/+$/, "");
  if (!key) return { ok: false, error: "Stability API key not configured" };
  try {
    const res = await fetch(`${base}/v1/user/account`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    });
    if (!res.ok) {
      console.error("Stability check failed", res.status, await res.text());
      return { ok: false, error: `Stability responded ${res.status}` };
    }
    return { ok: true, error: null };
  } catch (e) {
    console.error("Stability check error", e);
    return { ok: false, error: "Could not reach Stability AI" };
  }
});
