import { format, isValid, parse } from "date-fns";
import { el, enUS } from "date-fns/locale";

export function parseDateEntry(text: string): string | null {
  if (!text.trim()) return "";
  if (
    !/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}-\p{L}{3,6}-\d{2}(?:\d{2})?|\d{1,2}\/\d{1,2}\/\d{2}(?:\d{2})?)$/u.test(
      text.trim(),
    )
  )
    return null;
  for (const locale of [enUS, el])
    for (const pattern of ["yyyy-MM-dd", "d-MMM-yy", "d-MMM-yyyy", "d/M/yyyy", "d/M/yy"]) {
      const date = parse(text.trim(), pattern, new Date(2026, 0, 1), { locale });
      if (isValid(date) && date.getFullYear() >= 1900 && date.getFullYear() <= 2199)
        return format(date, "yyyy-MM-dd");
    }
  return null;
}
export function displayDate(value: string, language = "en"): string {
  const date = value ? new Date(value + "T00:00:00") : undefined;
  return date && isValid(date)
    ? format(date, "dd-MMM-yy", { locale: language.startsWith("el") ? el : enUS })
    : value;
}
export function parseTimeEntry(text: string): string | null {
  if (!text.trim()) return "";
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const period = match[3]?.toLowerCase();
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return null;
  if (period) hour = (hour % 12) + (period === "pm" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
export function displayTime(value: string): string {
  const normalized = parseTimeEntry(value.slice(0, 5));
  if (!normalized) return value;
  const [hour, minute] = normalized.split(":").map(Number);
  return `${hour! % 12 || 12}:${String(minute).padStart(2, "0")} ${hour! >= 12 ? "PM" : "AM"}`;
}
