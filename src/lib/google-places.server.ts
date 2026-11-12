type Place = {
  id?: string; displayName?: { text?: string }; formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  addressComponents?: { longText: string; shortText?: string; types: string[] }[];
};
export async function googlePlacesSearch(q: string, country?: string) {
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key) throw new Error("Google Maps search is not configured. Ask your administrator to connect Google Places.");
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents" },
    body: JSON.stringify({ textQuery: q, pageSize: 6, ...(country ? { regionCode: country.toUpperCase() } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Google Maps search is unavailable. Check the Places API configuration and try again.");
  const body = await response.json() as { places?: Place[] };
  return { provider: "google" as const, results: (body.places ?? []).filter((p) => p.location && p.formattedAddress).map((p) => {
    const address: Record<string, string> = {};
    const fields: Record<string, string> = { street_number: "house_number", route: "road", sublocality_level_1: "suburb", locality: "city", administrative_area_level_1: "state", country: "country", postal_code: "postcode" };
    for (const component of p.addressComponents ?? []) for (const type of component.types) if (fields[type]) address[fields[type]!] = component.longText;
    return { placeId: p.id, display_name: p.formattedAddress!, name: p.displayName?.text, lat: String(p.location!.latitude), lon: String(p.location!.longitude), address };
  }) };
}
