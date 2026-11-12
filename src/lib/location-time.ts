import { zonedToUtc } from "./calendar-events";
export function locationLocalInput(iso: string | null, timeZone = "Africa/Johannesburg") {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
export const locationUtc = (value: string, timeZone = "Africa/Johannesburg") => value ? zonedToUtc(value.slice(0, 10), value.slice(11, 16), timeZone) : null;
