export type PlannerDayKind = "shoot" | "recce";

/** Preserve existing shoot keys; recce workspaces never share their rows. */
export const plannerScenarioKey = (productionId: string, date: string, kind: PlannerDayKind = "shoot") =>
  kind === "shoot" ? `scenario:${productionId}:${date}` : `scenario:${productionId}:recce:${date}`;

/** One paid recce day regardless of how many locations share that date. */
export function reccePlannerDates(productionDate: string | null | undefined, locations: { recce_date: string | null }[]) {
  const dates = locations.map((l) => l.recce_date).filter((d): d is string => !!d);
  return [...new Set(dates.length ? dates : productionDate ? [productionDate] : [])].sort();
}

/** A single saved pointer chooses an expense; alternatives are never added together. */
export function selectedRecceCost<T extends { id: string }>(scenarios: T[], selectedId: string | null, cost: (s: T) => number) {
  const selected = scenarios.find((s) => s.id === selectedId);
  return selected ? cost(selected) : 0;
}
