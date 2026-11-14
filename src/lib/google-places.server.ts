type Place = {
  id?: string; displayName?: { text?: string }; formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: { longText: string; shortText?: string; types: string[] }[];
};
export async function googlePlacesSearch(q: string, country?: string) {
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key) return { provider: "google" as const, results: [], error: "Google Maps is not configured on this server. Ask your administrator to add GOOGLE_MAPS_API_KEY." };
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents" },
    body: JSON.stringify({ textQuery: q, pageSize: 6, ...(country ? { regionCode: country.toUpperCase() } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as {error?: {status?: string; details?: {reason?: string}[]}};
    const reason = detail.error?.details?.find(item => item.reason)?.reason ?? detail.error?.status ?? "UNKNOWN";
    const messages: Record<string,string> = {
      SERVICE_DISABLED: "Google Places API (New) is disabled for the key's Google Cloud project. Ask your administrator to enable it.",
      API_KEY_SERVICE_BLOCKED: "This Google Maps key is not permitted to use Places API (New). Ask your administrator to update its API restrictions.",
      API_KEY_HTTP_REFERRER_BLOCKED: "This Google Maps key has browser-only restrictions. Server-side Places search needs a server-compatible key.",
      API_KEY_IP_ADDRESS_BLOCKED: "This Google Maps key's IP restrictions do not allow the app server.",
      API_KEY_INVALID: "The configured Google Maps API key is invalid. Ask your administrator to replace it.",
      BILLING_DISABLED: "Google Maps billing is not enabled for the key's Google Cloud project.",
      RESOURCE_EXHAUSTED: "Google Maps search quota has been reached. Try again later or ask your administrator to review the quota.",
    };
    return {provider: "google" as const, results: [], error: messages[reason] ?? "Google Places rejected the search. Ask your administrator to check Places API (New), billing and key restrictions."};
  }
  const body = await response.json() as { places?: Place[] };
  return { error: null, provider: "google" as const, results: (body.places ?? []).filter((p) => p.location && p.formattedAddress).map((p) => {
    const address: Record<string, string> = {};
    const fields: Record<string, string> = { street_number: "house_number", route: "road", sublocality_level_1: "suburb", locality: "city", administrative_area_level_1: "state", country: "country", postal_code: "postcode" };
    for (const component of p.addressComponents ?? []) for (const type of component.types) if (fields[type]) address[fields[type]!] = component.longText;
    return { placeId: p.id, display_name: p.formattedAddress!, name: p.displayName?.text, lat: String(p.location!.latitude), lon: String(p.location!.longitude), address };
  }) };
}
