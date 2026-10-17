export const WEATHER_CODES: Record<number, string> = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm",
};

export type DayForecast = { code: number; max: number | null; min: number | null; rain: number | null };

// Open-Meteo forecast for the next 16 days, keyed by YYYY-MM-DD. No API key needed.
export async function fetchDailyForecast(lat: number, lon: number): Promise<Record<string, DayForecast>> {
  const qs = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), timezone: "auto", forecast_days: "16",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${qs}`);
  if (!res.ok) throw new Error("forecast unavailable");
  const j = (await res.json()) as { daily?: { time?: string[]; weather_code?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: number[] } };
  const out: Record<string, DayForecast> = {};
  (j.daily?.time ?? []).forEach((day, i) => {
    out[day] = {
      code: j.daily?.weather_code?.[i] ?? 0,
      max: j.daily?.temperature_2m_max?.[i] ?? null,
      min: j.daily?.temperature_2m_min?.[i] ?? null,
      rain: j.daily?.precipitation_probability_max?.[i] ?? null,
    };
  });
  return out;
}

export const WEATHER_ICONS: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️", 56: "🌧️", 57: "🌧️", 61: "🌧️", 63: "🌧️", 65: "🌧️", 66: "🌧️", 67: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 77: "🌨️", 80: "🌦️", 81: "🌧️", 82: "⛈️", 85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};
