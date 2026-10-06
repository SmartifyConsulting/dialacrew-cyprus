import { supabase } from "@/integrations/supabase/client";

export type QueuedCheckin = {
  localId: string;
  production_id: string;
  crew_id: string;
  user_id: string;
  person_name: string;
  kind: "in" | "out";
  source: string;
  latitude: number | null;
  longitude: number | null;
  distance_m: number | null;
  on_site: boolean | null;
  captured_at: string;
};

const KEY = "bac_checkin_queue";

function read(): QueuedCheckin[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function write(q: QueuedCheckin[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* storage unavailable */ }
}

export function queueCheckin(entry: Omit<QueuedCheckin, "localId" | "captured_at">) {
  const q = read();
  q.push({ ...entry, localId: crypto.randomUUID(), captured_at: new Date().toISOString() });
  write(q);
}

export function pendingCount() {
  return read().length;
}

/** Flush the queue to the server, preserving the originally captured timestamp. Never overwritten by sync time. */
export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const q = read();
  if (q.length === 0) return { synced: 0, failed: 0 };
  const remaining: QueuedCheckin[] = [];
  let synced = 0;
  for (const entry of q) {
    const { localId, captured_at, ...row } = entry;
    const { error } = await supabase.from("site_attendance").insert({ ...row, created_at: captured_at, source: `${row.source} (offline)` });
    if (error) remaining.push(entry); else synced++;
  }
  write(remaining);
  return { synced, failed: remaining.length };
}

export function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}
