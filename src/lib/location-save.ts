import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type LocationInsert = Database["public"]["Tables"]["production_locations"]["Insert"];
export async function persistLocation(productionId: string, id: string | null, payload: Omit<LocationInsert, "production_id">) {
  const query = id
    ? supabase.from("production_locations").update(payload).eq("id", id).eq("production_id", productionId)
    : supabase.from("production_locations").insert({ ...payload, production_id: productionId });
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  if (!data) throw new Error("The location was not saved. Check your access and try again.");
  return data;
}
