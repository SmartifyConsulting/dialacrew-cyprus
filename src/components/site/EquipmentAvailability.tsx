import { Panel } from "@/components/AppShell";
import { checkoutLine, isOverdue, useEquipmentCheckouts, useEquipmentItems, ymdLabel } from "@/lib/equipment";

// Shown under Locations while crew are being chosen: what the company already owns, who has it right now,
// and which items won't be free for this shoot (those are the ones to hire).
export function EquipmentAvailability({ p }: { p: { id: string; date: string } }) {
  const items = useEquipmentItems().data ?? [];
  const checkouts = useEquipmentCheckouts().data ?? [];
  const start = p.date || null;

  const rows = items.map((item) => {
    const active = checkouts.filter((c) => c.item_id === item.id && !c.returned_at);
    const mine = active.filter((c) => c.production_id === p.id).reduce((sum, c) => sum + c.quantity, 0);
    // Out for another job and not due back before this shoot starts.
    const blockedBy = active.filter((c) => c.production_id !== p.id && (!start || !c.expected_return_at || c.expected_return_at >= start));
    const blocked = blockedBy.reduce((sum, c) => sum + c.quantity, 0);
    return { item, active, mine, blockedBy, free: Math.max(0, item.total_count - blocked - mine) };
  });
  const toHire = rows.filter((r) => r.free === 0 && r.mine === 0).map((r) => r.item.name);

  return (
    <Panel title="Our equipment" right={items.length > 0 ? <span className="text-xs text-muted-foreground">{rows.filter((r) => r.free > 0 || r.mine > 0).length} of {items.length} usable</span> : undefined}>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No company equipment has been listed yet. An admin can add it under Admin, Operations, Equipment.</p>
      ) : (
        <>
          <div className={`border-b border-border px-4 py-2.5 text-xs ${toHire.length ? "text-destructive" : "text-success"}`}>
            {toHire.length
              ? <>Not free for this shoot{start ? ` (from ${ymdLabel(start)})` : ""}, so plan to hire: <span className="font-semibold">{toHire.join(", ")}</span></>
              : "Everything we own is free for this shoot."}
          </div>
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {rows.map(({ item, active, mine, blockedBy, free }) => (
              <li key={item.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.category} · {item.total_count} owned</div>
                  </div>
                  <span className={`shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold ${mine > 0 ? "bg-primary/15 text-primary" : free > 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {mine > 0 ? `${mine} booked for this shoot` : free > 0 ? `${free} free` : "Hire"}
                  </span>
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
