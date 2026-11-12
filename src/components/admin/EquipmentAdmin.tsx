import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Search } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession, useRole } from "@/lib/auth";
import { useMyCrewId } from "@/lib/site";
import { useCrew, useProductions } from "@/lib/db";
import {
  EQUIPMENT_CATEGORIES, LOAN_STATES, useInventoryStock, isOutNow, checkoutLine, isOverdue, todayYmd, useEquipmentCheckouts, useEquipmentItems, ymdLabel, type EquipmentItem,
} from "@/lib/equipment";

const field = "rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring";
const addBtn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const blankItem = { name: "", category: "Equipment", total_count: "1", notes: "", serial_code: "" };

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// The production company's own equipment, run like a library: stock, who has each item, for which production, and when it is due back.
export function EquipmentAdmin() {
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const canManage = role.data === "producer" || role.data === "admin";
  const stockQuery = useInventoryStock();
  const stock = stockQuery.data ?? [];
  const { t } = useTranslation();
  const qc = useQueryClient();
  const items = useEquipmentItems().data ?? [];
  const checkouts = useEquipmentCheckouts().data ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["equipment-items"] });
    qc.invalidateQueries({ queryKey: ["inventory-stock"] });
    qc.invalidateQueries({ queryKey: ["equipment-checkouts"] });
  };
  const [newItem, setNewItem] = useState(blankItem);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(blankItem);
  const [checkoutFor, setCheckoutFor] = useState<EquipmentItem | null>(null);
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set(EQUIPMENT_CATEGORIES));
  const toggleCategory = (c: string) => setOpenCategories((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const outNow = (itemId: string) => checkouts.filter((c) => c.item_id === itemId && isOutNow(c));
  const qtyOut = (itemId: string) => stock.find((c) => c.item_id === itemId)?.collected ?? 0;
  const reserved = (itemId: string) => stock.find((c) => c.item_id === itemId)?.reserved ?? 0;
  const shown = items.filter((it) => !search.trim() || `${it.name} ${it.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const overdueCount = checkouts.filter(isOverdue).length;
  const categoriesShown = EQUIPMENT_CATEGORIES.filter((c) => shown.some((it) => it.category === c));

  async function addItem() {
    if (!newItem.name.trim()) { toast.error("Name the item first"); return; }
    const { error } = await supabase.from("inventory_items").insert({ name: newItem.name.trim(), category: newItem.category, total_count: Math.max(1, Number(newItem.total_count) || 1), notes: newItem.notes.trim(), serial_code: newItem.serial_code.trim() || null });
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Inventory item added");
    setNewItem(blankItem);
    refresh();
  }
  function startEdit(it: EquipmentItem) {
    setEditingId(it.id);
    setDraft({ name: it.name, category: it.category, total_count: String(it.total_count), notes: it.notes, serial_code: it.serial_code ?? "" });
  }
  async function saveEdit(id: string) {
    if (!draft.name.trim()) { toast.error("Name the item first"); return; }
    const { error } = await supabase.from("inventory_items").update({ name: draft.name.trim(), category: draft.category, total_count: Math.max(1, Number(draft.total_count) || 1), notes: draft.notes.trim(), serial_code: draft.serial_code.trim() || null }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Inventory item updated");
    setEditingId(null);
    refresh();
  }
  async function removeItem(it: EquipmentItem) {
    if (!(await confirmDialog(`Delete "${it.name}" and its check-out history? This can't be undone.`, { destructive: true }))) return;
    const { error } = await supabase.from("inventory_items").delete().eq("id", it.id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }
  async function changeState(id: string, state: string) {
    const { error } = await supabase.from("inventory_checkouts").update({ request_state: state }).eq("id", id).select("id").single();
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Inventory request updated");
    refresh();
  }

  return (
    <div className="space-y-5">
      {canManage && <Panel title={t("equipment.add")}>
        <div className="flex flex-wrap items-end gap-2 p-4">
          <input placeholder={t("equipment.name")} className={`${field} min-w-48 flex-1`} value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
          <select className={field} value={newItem.category} onChange={(e) => setNewItem({ ...newItem, category: e.target.value })} aria-label="Category">
            {EQUIPMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="number" min="1" className={`${field} w-24`} placeholder={t("checkout.quantity")} value={newItem.total_count} onChange={(e) => setNewItem({ ...newItem, total_count: e.target.value })} aria-label={t("equipment.owned")} />
          <input placeholder={t("checkout.serial")} className={`${field} w-32`} value={newItem.serial_code} onChange={(e) => setNewItem({ ...newItem, serial_code: e.target.value })} />
          <input placeholder={t("checkout.notes")} className={`${field} min-w-48`} value={newItem.notes} onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })} />
          <button onClick={addItem} className={addBtn}>{t("equipment.add")}</button>
        </div>
      </Panel>}

      {stockQuery.isError && <p role="alert" className="text-sm text-destructive">Inventory availability could not be loaded. Please retry before requesting equipment.</p>}
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-primary">{t("equipment.inventory", { count: items.length })}</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input className={`${field} w-44 pl-7`} placeholder={t("checkout.search")} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t("checkout.search")} />
        </div>
      </div>
      {shown.length === 0 && (
        <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">{items.length === 0 ? "No inventory yet. Add the first item above." : `Nothing matches "${search}".`}</p>
      )}
      {categoriesShown.map((category) => {
        const catItems = shown.filter((it) => it.category === category);
        const isOpen = openCategories.has(category);
        return (
          <section key={category} className="rounded-sm border border-border bg-card">
            <button type="button" onClick={() => toggleCategory(category)}
              className="flex w-full items-center gap-2 border-b border-primary bg-primary px-4 py-2.5 text-left text-primary-foreground">
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              <span className="font-display text-sm font-semibold uppercase tracking-wide">{category}</span>
              <span className="text-xs font-normal opacity-90">({catItems.length} item{catItems.length === 1 ? "" : "s"})</span>
            </button>
            {isOpen && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] text-muted-foreground">
                    <tr><th className="px-4 py-2">{t("equipment.item")}</th><th className="px-4">{t("equipment.owned")}</th><th className="px-4">{t("equipment.out")}</th><th className="px-4">{t("equipment.free")}</th><th className="px-4">{t("common.actions")}</th></tr>
                  </thead>
                  <tbody>
                    {catItems.map((it) => {
                      const out = qtyOut(it.id);
                      if (editingId === it.id) {
                        return (
                          <tr key={it.id} className="border-t border-border">
                            <td className="px-4 py-2"><input className={`${field} w-full`} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Item name" />
                              <input className={`${field} mt-1 w-full`} placeholder="Serial/Asset ID" value={draft.serial_code} onChange={(e) => setDraft({ ...draft, serial_code: e.target.value })} aria-label="Serial/Asset ID" />
                              <input className={`${field} mt-1 w-full`} placeholder="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} aria-label="Notes" />
                              <select className={`${field} mt-1`} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category">
                                {EQUIPMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                              </select></td>
                            <td className="px-4"><input type="number" min="1" className={`${field} w-20`} value={draft.total_count} onChange={(e) => setDraft({ ...draft, total_count: e.target.value })} aria-label="How many we own" /></td>
                            <td className="px-4">{out}</td>
                            <td className="px-4">{(Number(draft.total_count) || 0) - out}</td>
                            <td className="px-4"><div className="flex gap-3">
                              <button onClick={() => saveEdit(it.id)} className="text-xs font-semibold text-primary hover:underline">{t("common.save")}</button>
                              <button onClick={() => setEditingId(null)} className="text-xs text-muted-foreground hover:underline">{t("common.cancel")}</button>
                            </div></td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={it.id} className="border-t border-border align-top">
                          <td className="px-4 py-2">
                            <div className="font-medium">{it.name}</div>
                            {it.serial_code && <div className="text-xs text-muted-foreground">Serial/Asset ID: {it.serial_code}</div>}
                            {it.notes && <div className="text-xs text-muted-foreground">{it.notes}</div>}
                            {outNow(it.id).map((c) => (
                              <div key={c.id} className={`mt-0.5 text-xs ${isOverdue(c) ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                                {checkoutLine(c)}{isOverdue(c) ? " · OVERDUE" : ""}
                              </div>
                            ))}
                          </td>
                          <td className="px-4 py-2">{it.total_count}</td>
                          <td className="px-4 py-2">{out}</td>
                          <td className={`px-4 py-2 font-semibold ${it.total_count - reserved(it.id) > 0 ? "text-success" : "text-destructive"}`}>{it.total_count - reserved(it.id)}</td>
                          <td className="px-4 py-2"><div className="flex gap-3 whitespace-nowrap">
                            <button disabled={!stockQuery.isSuccess || it.total_count - reserved(it.id) <= 0} onClick={() => setCheckoutFor(it)} className="text-xs font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline">Request equipment</button>
                            {canManage && <><button onClick={() => startEdit(it)} className="text-xs text-primary hover:underline">{t("common.edit")}</button>
                            <button onClick={() => removeItem(it)} className="text-xs text-destructive hover:underline">{t("common.delete")}</button></>}
                          </div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <Panel title="Library card" right={overdueCount > 0 ? <span className="text-xs font-semibold text-destructive">{overdueCount} overdue</span> : undefined}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] text-muted-foreground">
              <tr><th className="px-4 py-2">Item</th><th className="px-4">Qty</th><th className="px-4">Who</th><th className="px-4">Production</th><th className="px-4">Collection date</th><th className="px-4">Due back</th><th className="px-4">Status</th><th className="px-4" /></tr>
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
                      : isOverdue(c) ? <span className="font-semibold text-destructive">Overdue</span> : <span className="text-primary">{LOAN_STATES[c.request_state]}</span>}
                  </td>
                  <td className="px-4">{canManage && <div className="flex gap-3 whitespace-nowrap">
                    {c.request_state === "requested" && <><button onClick={() => changeState(c.id, "approved")} className="text-xs font-semibold text-primary">Approve</button><button onClick={() => changeState(c.id, "declined")} className="text-xs text-destructive">Decline</button></>}
                    {c.request_state === "approved" && <button onClick={() => changeState(c.id, "collected")} className="text-xs font-semibold text-primary">Mark collected</button>}
                    {c.request_state === "collected" && <button onClick={() => changeState(c.id, "returned")} className="text-xs font-semibold text-primary">Mark returned</button>}
                    </div>}</td>
                </tr>
              ))}
              {checkouts.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Nothing has been checked out yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {checkoutFor && (
        <CheckoutDialog item={checkoutFor} free={Math.max(0, checkoutFor.total_count - reserved(checkoutFor.id))} onClose={() => setCheckoutFor(null)} onDone={refresh} />
      )}
    </div>
  );
}

function CheckoutDialog({ item, free, onClose, onDone }: { item: EquipmentItem; free: number; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const canManage = role.data === "producer" || role.data === "admin";
  const myCrewId = useMyCrewId(role.data === "crew").data;
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
    if (canManage && !f.who.trim()) { toast.error(t("checkout.whoRequired")); return; }
    if (!quantity || quantity < 1 || quantity > free) { toast.error(t("checkout.quantityError", { maximum: free })); return; }
    if (!f.productionId) { toast.error("Production is required"); return; }
    if (!f.outAt) { toast.error("Collection date is required"); return; }
    if (!f.dueAt) { toast.error(t("checkout.dueRequired")); return; }
    if (f.dueAt < f.outAt) { toast.error(t("checkout.dateError")); return; }
    setBusy(true);
    // Link the selected crew account so approval and collection notifications reach the recipient.
    const matchedCrew = crew.find((c) => c.id === f.who);
    const crewId = canManage ? matchedCrew?.id : myCrewId;
    if (!crewId) { setBusy(false); toast.error("Select a crew member with a linked app account"); return; }
    const { error } = await supabase.from("inventory_checkouts").insert({
      item_id: item.id, quantity, checked_out_to: matchedCrew?.name ?? session?.user.email ?? "Crew member", checked_out_crew_id: crewId, production_id: f.productionId || null,
      checked_out_at: f.outAt, expected_return_at: f.dueAt,
    });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Equipment requested. Awaiting producer approval.");
    onDone();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request equipment: {item.name}</DialogTitle>
          <DialogDescription>{t("checkout.availability", { free, total: item.total_count })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {canManage && <label className="block"><span className="text-xs text-muted-foreground">Crew member</span>
            <select required className={`${field} mt-1 w-full`} value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}>
              <option value="">Select crew member</option>{crew.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.role} ({c.id.slice(-6)})</option>)}
            </select></label>}
          <label className="block"><span className="text-xs text-muted-foreground">{t("checkout.production")}</span>
            <select required className={`${field} mt-1 w-full`} value={f.productionId} onChange={(e) => chooseProduction(e.target.value)}>
              <option value="">Select production</option>
              {[...productions].sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.id} value={p.id}>{p.name.trim() || `Unnamed production (${p.id})`}{p.date ? ` · ${p.date}` : ""}</option>)}
            </select></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className="text-xs text-muted-foreground">{t("checkout.quantity")}</span>
              <input required type="number" min="1" max={free} className={`${field} mt-1 w-full`} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></label>
            <label className="col-span-2 block"><span className="text-xs text-muted-foreground">Collection date</span>
              <input required type="date" className={`${field} mt-1 w-full`} value={f.outAt} onChange={(e) => setF({ ...f, outAt: e.target.value })} /></label>
          </div>
          <label className="block"><span className="text-xs text-muted-foreground">{t("checkout.dueDate")}</span>
            <input required type="date" min={f.outAt} className={`${field} mt-1 w-full`} value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="button" onClick={submit} disabled={busy}>{busy ? t("recovery.saving") : "Request equipment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
import { useTranslation } from "react-i18next";
