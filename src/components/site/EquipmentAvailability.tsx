import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { checkoutLine, isOverdue, todayYmd, useEquipmentCheckouts, useEquipmentItems, ymdLabel } from "@/lib/equipment";

// Pure availability maths so it can be tested: units owned minus units out on other jobs that overlap the shoot,
// minus units already booked for this shoot.
export function equipmentFree(total: number, blockedElsewhere: number, mine: number) {
  return Math.max(0, total - blockedElsewhere - mine);
}

// Shown in the production side panel: what the company owns, who has it, and how many are free for this shoot.
// Producers can book units for this shoot (one at a time) and release them again.
export function EquipmentAvailability({ p }: { p: { id: string; date: string; name?: string } }) {
  const qc = useQueryClient();
  const items = useEquipmentItems().data ?? [];
  const checkouts = useEquipmentCheckouts().data ?? [];
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const start = p.date || null;
  const refresh = () => qc.invalidateQueries({ queryKey: ["equipment-checkouts"] });

  const rows = items.map((item) => {
    const active = checkouts.filter((c) => c.item_id === item.id && !c.returned_at);
    const mineRows = active.filter((c) => c.production_id === p.id);
    const mine = mineRows.reduce((sum, c) => sum + c.quantity, 0);
    const blockedBy = active.filter((c) => c.production_id !== p.id && (!start || !c.expected_return_at || c.expected_return_at >= start));
    const blocked = blockedBy.reduce((sum, c) => sum + c.quantity, 0);
    return { item, active, mine, mineRows, blockedBy, free: equipmentFree(item.total_count, blocked, mine) };
  });
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.item.name} ${r.item.category} ${r.item.serial_code ?? ""}`.toLowerCase().includes(needle)) : rows;
  const toHire = rows.filter((r) => r.free === 0 && r.mine === 0).map((r) => r.item.name);

  async function book(itemId: string) {
    setBusy(itemId);
    const { error } = await supabase.from("inventory_checkouts").insert({
      item_id: itemId, quantity: 1, production_id: p.id, checked_out_to: p.name ?? "This shoot",
      checked_out_at: start ?? todayYmd(), expected_return_at: start ?? todayYmd(),
    });
    setBusy(null);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Booked 1 for this shoot");
    refresh();
  }
  async function release(checkoutId: string) {
    setBusy(checkoutId);
    const { error } = await supabase.from("inventory_checkouts").delete().eq("id", checkoutId);
    setBusy(null);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Released 1");
    refresh();
  }

  return (
    <Panel title="Our inventory" collapsible defaultCollapsed right={items.length > 0 ? <span className="text-xs text-muted-foreground">{rows.filter((r) => r.free > 0 || r.mine > 0).length} of {items.length} usable</span> : undefined}>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No company inventory has been listed yet. An admin can add it under Admin, Inventory.</p>
      ) : (
        <>
          <div className="border-b border-border px-4 py-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search inventory" aria-label="Search inventory"
                className="w-full rounded-sm border border-input bg-background py-1.5 pl-7 pr-2 text-sm outline-none focus:border-ring" />
            </div>
          </div>
          <div className={`border-b border-border px-4 py-2.5 text-xs ${toHire.length ? "text-destructive" : "text-success"}`}>
            {toHire.length
              ? <>Not free for this shoot{start ? ` (from ${ymdLabel(start)})` : ""}, so plan to hire: <span className="font-semibold">{toHire.join(", ")}</span></>
              : "Everything we own is free for this shoot."}
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {shown.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No inventory matches “{q}”.</li>}
            {shown.map(({ item, active, mine, mineRows, blockedBy, free }) => (
              <li key={item.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.category} · {item.total_count} owned</div>
                  </div>
                  <span className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${free > 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {free > 0 ? `${free}/${item.total_count} free` : "Unavailable"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs">
                  {mine > 0 && <span className="rounded-sm bg-primary/15 px-2 py-0.5 font-semibold text-primary">{mine} booked for this shoot</span>}
                  <div className="ml-auto flex items-center gap-1">
                    {mineRows[0] && (
                      <button type="button" disabled={busy === mineRows[0].id} onClick={() => release(mineRows[0]!.id)} aria-label={`Release one ${item.name}`}
                        className="grid h-7 w-7 place-items-center rounded-sm border border-border hover:border-primary disabled:opacity-50"><Minus className="h-3.5 w-3.5" /></button>
                    )}
                    <button type="button" disabled={free === 0 || busy === item.id} onClick={() => book(item.id)}
                      className="inline-flex h-7 items-center gap-1 rounded-sm bg-primary px-2 font-semibold text-primary-foreground disabled:opacity-40">
                      <Plus className="h-3.5 w-3.5" /> Book 1
                    </button>
                  </div>
                </div>
                {active.filter((c) => c.production_id !== p.id).map((c) => (
                  <div key={c.id} className={`mt-1 text-xs ${isOverdue(c) || blockedBy.includes(c) ? "text-destructive" : "text-muted-foreground"}`}>
                    {checkoutLine(c)}{isOverdue(c) ? " · overdue" : blockedBy.includes(c) ? " · not back in time" : " · back before the shoot"}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}
