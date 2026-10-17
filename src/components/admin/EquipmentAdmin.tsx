import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCrew, useProductions } from "@/lib/db";
import {
  EQUIPMENT_CATEGORIES, checkoutLine, isOverdue, todayYmd, useEquipmentCheckouts, useEquipmentItems, ymdLabel, type EquipmentItem,
} from "@/lib/equipment";

const field = "rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring";
const addBtn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const blankItem = { name: "", category: "Equipment", total_count: "1", notes: "" };

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The production company's own equipment, run like a library: stock, who has each item, for which production, and when it is due back.
export function EquipmentAdmin() {
  const qc = useQueryClient();
  const items = useEquipmentItems().data ?? [];
  const checkouts = useEquipmentCheckouts().data ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["equipment-items"] });
    qc.invalidateQueries({ queryKey: ["equipment-checkouts"] });
  };
  const [newItem, setNewItem] = useState(blankItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(blankItem);
  const [checkoutFor, setCheckoutFor] = useState<EquipmentItem | null>(null);
  const [search, setSearch] = useState("");

  const outNow = (itemId: string) => checkouts.filter((c) => c.item_id === itemId && !c.returned_at);
  const qtyOut = (itemId: string) => outNow(itemId).reduce((sum, c) => sum + c.quantity, 0);
  const shown = items.filter((it) => !search.trim() || `${it.name} ${it.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const overdueCount = checkouts.filter(isOverdue).length;

  async function addItem() {
    if (!newItem.name.trim()) { toast.error("Name the item first"); return; }
    const { error } = await supabase.from("inventory_items").insert({ name: newItem.name.trim(), category: newItem.category, total_count: Math.max(1, Number(newItem.total_count) || 1), notes: newItem.notes.trim() });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Equipment added");
    setNewItem(blankItem);
    refresh();
  }
  function startEdit(it: EquipmentItem) {
    setEditingId(it.id);
    setDraft({ name: it.name, category: it.category, total_count: String(it.total_count), notes: it.notes });
  }
  async function saveEdit(id: string) {
    if (!draft.name.trim()) { toast.error("Name the item first"); return; }
    const { error } = await supabase.from("inventory_items").update({ name: draft.name.trim(), category: draft.category, total_count: Math.max(1, Number(draft.total_count) || 1), notes: draft.notes.trim() }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Equipment updated");
    setEditingId(null);
    refresh();
  }
  async function removeItem(it: EquipmentItem) {
    if (!window.confirm(`Delete "${it.name}" and its check-out history? This can't be undone.`)) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", it.id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }
  async function markReturned(id: string) {
    const { error } = await supabase.from("inventory_checkouts").update({ returned_at: todayYmd() }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Marked as returned");
    refresh();
  }

  return (
    <div className="space-y-5">
      <Panel title="Add equipment">
        <div className="flex flex-wrap items-end gap-2 p-4">
          <input placeholder="Item name" className={`${field} min-w-48 flex-1`} value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
          <select className={field} value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} aria-label="Category">
            {EQUIPMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="number" min="1" className={`${field} w-24`} placeholder="How many" value={newItem.total_count} onChange={(e) => setNewItem({ ...newItem, total_count: e.target.value })} aria-label="How many we own" />
          <input placeholder="Notes (serial number, condition…)" className={`${field} min-w-48`} value={newItem.notes} onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })} />
          <button onClick={addItem} className={addBtn}>Add equipment</button>
        </div>
      </Panel>

      <Panel title={`Our equipment (${items.length} item${items.length === 1 ? "" : "s"})`}
        right={
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input className={`${field} w-44 pl-7`} placeholder="Search equipment" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search equipment" />
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-muted-foreground">
              <tr><th className="px-4 py-2">Item</th><th className="px-4">Category</th><th className="px-4">Owned</th><th className="px-4">Out</th><th className="px-4">Free</th><th className="px-4">Action</th></tr>
            </thead>
            <tbody>
              {shown.map((it) => {
                const out = qtyOut(it.id);
                if (editingId === it.id) {
                  return (
                    <tr key={it.id} className="border-t border-border">
                      <td className="px-4 py-2"><input className={`${field} w-full`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Item name" />
                        <input className={`${field} mt-1 w-full`} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} aria-label="Notes" /></td>
                      <td className="px-4">
                        <select className={field} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category">
                          {EQUIPMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className="px-4"><input type="number" min="1" className={`${field} w-20`} value={draft.total_count} onChange={(e) => setDraft({ ...draft, total_count: e.target.value })} aria-label="How many we own" /></td>
                      <td className="px-4">{out}</td>
                      <td className="px-4">{(Number(draft.total_count) || 0) - out}</td>
                      <td className="px-4"><div className="flex gap-3">
                        <button onClick={() => saveEdit(it.id)} className="text-xs font-semibold text-primary hover:underline">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:underline">Cancel</button>
                      </div></td>
                    </tr>
                  );
                }
                return (
                  <tr key={it.id} className="border-t border-border align-top">
                    <td className="px-4 py-2">
                      <div className="font-medium">{it.name}</div>
                      {it.notes && <div className="text-xs text-muted-foreground">{it.notes}</div>}
                      {outNow(it.id).map((c) => (
                        <div key={c.id} className={`mt-0.5 text-xs ${isOverdue(c) ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                          {checkoutLine(c)}{isOverdue(c) ? " · OVERDUE" : ""}
                        </div>
                      ))}
                    </td>
                    <td className="px-4 py-2">{it.category}</td>
                    <td className="px-4 py-2">{it.total_count}</td>
                    <td className="px-4 py-2">{out}</td>
                    <td className={`px-4 py-2 font-semibold ${it.total_count - out > 0 ? "text-success" : "text-destructive"}`}>{it.total_count - out}</td>
                    <td className="px-4 py-2"><div className="flex gap-3 whitespace-nowrap">
                      <button disabled={it.total_count - out <= 0} onClick={() => setCheckoutFor(it)} className="text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline">Check out</button>
                      <button onClick={() => startEdit(it)} className="text-xs text-primary hover:underline">Edit</button>
                      <button onClick={() => removeItem(it)} className="text-xs text-destructive hover:underline">Delete</button>
                    </div></td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">{items.length === 0 ? "No equipment yet. Add the first item above." : `Nothing matches "${search}".`}</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Library card" right={overdueCount > 0 ? <span className="text-xs font-semibold text-destructive">{overdueCount} overdue</span> : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-muted-foreground">
              <tr><th className="px-4 py-2">Item</th><th className="px-4">Qty</th><th className="px-4">Who</th><th className="px-4">Production</th><th className="px-4">Out</th><th className="px-4">Due back</th><th className="px-4">Status</th><th className="px-4" /></tr>
            </thead>
            <tbody>
              {checkouts.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{items.find((i) => i.id === c.item_id)?.name ?? "—"}</td>
                  <td className="px-4">{c.quantity}</td>
                  <td className="px-4">{c.checked_out_to || "—"}</td>
                  <td className="px-4">{c.productions?.name ?? "—"}</td>
                  <td className="whitespace-nowrap px-4">{ymdLabel(c.checked_out_at)}</td>
                  <td className="whitespace-nowrap px-4">{c.expected_return_at ? ymdLabel(c.expected_return_at) : "—"}</td>
                  <td className="whitespace-nowrap px-4">
                    {c.returned_at
                      ? <span className="text-success">Returned {ymdLabel(c.returned_at)}</span>
                      : isOverdue(c) ? <span className="font-semibold text-destructive">Overdue</span> : <span className="text-primary">Out</span>}
                  </td>
                  <td className="px-4">{!c.returned_at && <button onClick={() => markReturned(c.id)} className="whitespace-nowrap text-xs font-semibold text-primary hover:underline">Mark returned</button>}</td>
                </tr>
              ))}
              {checkouts.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Nothing has been checked out yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {checkoutFor && (
        <CheckoutDialog item={checkoutFor} free={checkoutFor.total_count - qtyOut(checkoutFor.id)} onClose={() => setCheckoutFor(null)} onDone={refresh} />
      )}
    </div>
  );
}

function CheckoutDialog({ item, free, onClose, onDone }: { item: EquipmentItem; free: number; onClose: () => void; onDone: () => void }) {
  const productions = useProductions().data ?? [];
  const crew = useCrew().data ?? [];
  const [f, setF] = useState({ quantity: "1", who: "", productionId: "", outAt: todayYmd(), dueAt: "" });
  const [busy, setBusy] = useState(false);

  // Picking a production suggests its last shoot day as the return date, which can still be changed.
  function chooseProduction(id: string) {
    const p = productions.find((x) => x.id === id);
    const lastDay = p ? (p.endDate || (p.date ? addDays(p.date, Math.max(1, p.days || 1) - 1) : "")) : "";
    setF({ ...f, productionId: id, dueAt: f.dueAt || lastDay });
  }

  async function submit() {
    const quantity = Math.floor(Number(f.quantity));
    if (!f.who.trim()) { toast.error("Say who is taking it"); return; }
    if (!quantity || quantity < 1 || quantity > free) { toast.error(`Choose between 1 and ${free}`); return; }
    if (!f.dueAt) { toast.error("Set the date it is due back"); return; }
    if (f.dueAt < f.outAt) { toast.error("The return date can't be before the day it goes out"); return; }
    setBusy(true);
    const { error } = await supabase.from("inventory_checkouts").insert({
      item_id: item.id, quantity, checked_out_to: f.who.trim(), production_id: f.productionId || null,
      checked_out_at: f.outAt, expected_return_at: f.dueAt,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`${item.name} checked out to ${f.who.trim()}`);
    onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Check out {item.name}</DialogTitle>
          <DialogDescription>{free} of {item.total_count} free to check out.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="block"><span className="text-xs text-muted-foreground">Who is taking it</span>
            <input list="equipment-who" className={`${field} mt-1 w-full`} placeholder="Name of the person" value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} />
            <datalist id="equipment-who">{crew.map((c) => <option key={c.id} value={c.name} />)}</datalist></label>
          <label className="block"><span className="text-xs text-muted-foreground">Which production it is for</span>
            <select className={`${field} mt-1 w-full`} value={f.productionId} onChange={(e) => chooseProduction(e.target.value)}>
              <option value="">No production</option>
              {productions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.date ? ` · ${p.date}` : ""}</option>)}
            </select></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-xs text-muted-foreground">How many</span>
              <input type="number" min="1" max={free} className={`${field} mt-1 w-full`} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
            <label className="col-span-2 block"><span className="text-xs text-muted-foreground">Goes out on</span>
              <input type="date" className={`${field} mt-1 w-full`} value={f.outAt} onChange={(e) => setF({ ...f, outAt: e.target.value })} /></label>
          </div>
          <label className="block"><span className="text-xs text-muted-foreground">Due back on</span>
            <input type="date" min={f.outAt} className={`${field} mt-1 w-full`} value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Check out"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
