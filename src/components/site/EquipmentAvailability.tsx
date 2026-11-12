import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Panel } from "@/components/AppShell";
import { isReserved, useEquipmentCheckouts, useEquipmentItems, useInventoryStock } from "@/lib/equipment";

export function equipmentFree(total: number, blockedElsewhere: number, mine: number) {
  return Math.max(0, total - blockedElsewhere - mine);
}

export function EquipmentAvailability({ p }: { p: { id: string; date: string; name?: string } }) {
  const items = useEquipmentItems().data ?? [];
  const checkouts = useEquipmentCheckouts().data ?? [];
  const stock = useInventoryStock();
  const [search, setSearch] = useState("");
  return <Panel title="Our inventory" collapsible defaultCollapsed>
    <div className="space-y-2 p-3">
      <Link to="/inventory" className="text-sm font-semibold text-primary">Open inventory library — request equipment</Link>
      <input aria-label="Search inventory" placeholder="Search inventory" value={search} onChange={e => setSearch(e.target.value)} className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm" />
      {stock.isError && <p role="alert">Inventory availability could not be loaded.</p>}
      {items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).map(item => {
        const tally = stock.data?.find(s => s.item_id === item.id);
        const mine = checkouts.filter(c => c.item_id === item.id && c.production_id === p.id && isReserved(c)).reduce((n,c) => n+c.quantity,0);
        return <div key={item.id} className="flex justify-between gap-2 border-t border-border py-2 text-sm">
          <span>{item.name}{mine > 0 && <span className="block text-xs text-muted-foreground">{mine} reserved for this production</span>}</span>
          <span className="shrink-0 text-xs">{tally ? `${Math.max(0,item.total_count-tally.reserved)} available` : "Checking availability…"}</span>
        </div>;
      })}
    </div>
  </Panel>;
}
