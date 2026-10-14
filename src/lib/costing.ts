export type AssetLine = { dailyFee: number; days: number };

/** Total a service provider earns on a job: day rate × days plus every selected asset fee × its days. */
export function providerTotal(crewRate: number, days: number, assets: AssetLine[]) {
  return crewRate * days + assets.reduce((a, x) => a + x.dailyFee * x.days, 0);
}

export function assetsTotal(assets: AssetLine[]) {
  return assets.reduce((a, x) => a + x.dailyFee * x.days, 0);
}

export type OvertimeShift = "day" | "night";

/** Weekend = 1.5×, night shift (4pm until morning) = 2×; the highest applicable rate wins, never stacked. Weekday day overtime = 1.5×. */
export function overtimeMultiplier(date: string | null | undefined, shift: OvertimeShift) {
  if (shift === "night") return 2;
  return 1.5;
}

export function isWeekend(date: string | null | undefined) {
  if (!date) return false;
  const d = new Date(`${date}T12:00:00`).getDay();
  return d === 0 || d === 6;
}

/** Hourly rate is the day rate ÷ 10 (a 10-hour day). */
export function overtimeAmount(dayRate: number, hours: number, date: string | null | undefined, shift: OvertimeShift) {
  return Math.round((dayRate / 10) * overtimeMultiplier(date, shift) * hours);
}

export function shiftLabel(date: string | null | undefined, shift: OvertimeShift) {
  if (shift === "night") return "Night shift (2×)";
  return isWeekend(date) ? "Weekend (1.5×)" : "Overtime (1.5×)";
}
