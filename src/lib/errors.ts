/** Turns a raw Supabase/Postgres error into a short, user-friendly sentence for a toast. */
export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.toLowerCase();

  if (m.includes("could not find the table") || m.includes("schema cache")) {
    return "This feature isn't set up yet — ask your admin to run the latest database update.";
  }
  if (m.includes("permission denied") || m.includes("row-level security") || m.includes("rls")) {
    return "You don't have permission to do that.";
  }
  if (m.includes("duplicate key") || m.includes("already exists")) {
    return "That already exists — try a different name or value.";
  }
  if (m.includes("violates foreign key")) {
    return "That record is linked elsewhere and can't be changed right now.";
  }
  if (m.includes("violates not-null constraint")) {
    return "Please fill in all the required fields.";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request failed")) {
    return "Couldn't connect — check your internet connection and try again.";
  }
  if (m.includes("jwt") || m.includes("session") && m.includes("expired")) {
    return "Your session has expired — please sign in again.";
  }
  return raw;
}
