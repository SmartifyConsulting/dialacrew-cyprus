import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// The production company's own equipment, kept like a library: each item has a stock count, and every check-out
// records who has it, which production it is for, when it left and when it is due back.
export type EquipmentItem = { id: string; name: string; category: string; total_count: number; notes: string };
export type EquipmentCheckout = {
  id: string; item_id: string; quantity: number; production_id: string | null; checked_out_to: string;
  checked_out_at: string; expected_return_at: string | null; returned_at: string | null; productions: { name: string } | null;
};

export const EQUIPMENT_CATEGORIES = ["Equipment", "Lighting", "Sound", "Camera", "Grip", "Wardrobe", "Props", "Vehicle"];

export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const ymdLabel = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });

export const isOutNow = (c: EquipmentCheckout) => !c.returned_at;
export const isOverdue = (c: EquipmentCheckout) => !c.returned_at && !!c.expected_return_at && c.expected_return_at < todayYmd();

/** "2× with Sam for Nutella Ad · out 3 Oct 2026 · back 9 Oct 2026" */
export function checkoutLine(c: EquipmentCheckout) {
  return [
    `${c.quantity}× with ${c.checked_out_to || "someone"}${c.productions?.name ? ` for ${c.productions.name}` : ""}`,
    `out ${ymdLabel(c.checked_out_at)}`,
    c.expected_return_at ? `back ${ymdLabel(c.expected_return_at)}` : "no return date set",
  ].join(" · ");
}

export const useEquipmentItems = () => useQuery({
  queryKey: ["equipment-items"],
  queryFn: async () => {
    const { data, error } = await supabase.from("inventory_items").select("*").order("name");
    if (error) throw error;
    return (data ?? []) as EquipmentItem[];
  },
});

export const useEquipmentCheckouts = () => useQuery({
  queryKey: ["equipment-checkouts"],
  queryFn: async () => {
    const { data, error } = await supabase.from("inventory_checkouts").select("*, productions(name)")
      .order("checked_out_at", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as EquipmentCheckout[];
  },
});
