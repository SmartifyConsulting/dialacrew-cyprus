// Recce scheduling per production location: combine same-production, same-date recces into one interval.
export type RecceLocation = {
  id: string; production_id: string; label: string | null; address?: string | null;
  recce_date: string | null; recce_start_time?: string | null; recce_end_time?: string | null;
  latitude: number | null; longitude: number | null;
};
export type RecceGroup = {
  date: string; start: string | null; end: string | null;
  locations: { index: number; loc: RecceLocation; start: string | null; end: string | null }[];
};

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

export function recceRange(start: string | null | undefined, end: string | null | undefined) {
  const s = hhmm(start), e = hhmm(end);
  if (s && e) return `${s}–${e}`;
  if (s) return `From ${s}`;
  if (e) return `Until ${e}`;
  return "Time TBC";
}

export function validRecceTimes(start: string | null | undefined, end: string | null | undefined) {
  const s = hhmm(start), e = hhmm(end);
  return !(s && e && e <= s);
}

/** Groups one production's located recces by date: earliest start, latest end. `ordered` gives Location N numbering. */
export function groupRecces(ordered: RecceLocation[]): RecceGroup[] {
  const map = new Map<string, RecceGroup>();
  ordered.forEach((loc, i) => {
    if (!loc.recce_date) return;
    const g = map.get(loc.recce_date) ?? { date: loc.recce_date, start: null, end: null, locations: [] };
    const s = hhmm(loc.recce_start_time), e = hhmm(loc.recce_end_time);
    if (s && (!g.start || s < g.start)) g.start = s;
    if (e && (!g.end || e > g.end)) g.end = e;
    g.locations.push({ index: i + 1, loc, start: s, end: e });
    map.set(loc.recce_date, g);
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const recceTooltip = (g: RecceGroup, name: (l: RecceLocation) => string) =>
  g.locations.map((x) => `Location ${x.index}: ${name(x.loc)} · ${recceRange(x.start, x.end)}`).join("\n");

/** True when two recce intervals on the same date overlap; unset times count as the whole day. */
export function recceOverlaps(a: { date: string; start: string | null; end: string | null }, b: { date: string; start: string | null; end: string | null }) {
  if (a.date !== b.date) return false;
  const as = a.start ?? "00:00", ae = a.end ?? "24:00", bs = b.start ?? "00:00", be = b.end ?? "24:00";
  return as < be && bs < ae;
}
