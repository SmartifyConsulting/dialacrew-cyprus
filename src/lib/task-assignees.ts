/** Keep every active production member, once, regardless of checklist department. */
export function taskAssignees<T extends { crew_id: string; name: string; booking_status: string }>(members: T[]): T[] {
  return [...new Map(members.filter(m => m.booking_status !== "cancelled").map(m => [m.crew_id, m])).values()]
    .sort((a,b) => a.name.localeCompare(b.name));
}
