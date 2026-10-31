import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { confirmDialog } from "@/components/ConfirmDialog";

export type ChecklistAudience = "producer" | "crew";
export function useChecklistTemplates(audience: ChecklistAudience) {
  return useQuery({ queryKey: ["checklist-templates", audience], queryFn: async () => {
    const { data, error } = await supabase.from("checklist_templates").select("*").eq("audience", audience).order("title");
    if (error) throw error; return data ?? [];
  } });
}
export function ChecklistTemplateManager({ audience, targetId }: { audience: ChecklistAudience; targetId?: string }) {
  const { session } = useSession();
  const qc = useQueryClient();
  const q = useChecklistTemplates(audience);
  const [name, setName] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["checklist-templates", audience] });
  async function save() {
    const title = name.trim(), lines = items.map((x) => x.trim()).filter(Boolean);
    if (!title || !lines.length || !session?.user.id) { toast.error("Enter a checklist name and at least one item."); return; }
    setBusy(true);
    const payload = { title, items: lines, audience, owner_id: session.user.id };
    const result = editingId
      ? await supabase.from("checklist_templates").update(payload).eq("id", editingId).eq("owner_id", session.user.id)
      : await supabase.from("checklist_templates").insert(payload);
    setBusy(false);
    if (result.error) { toast.error(result.error.message); return; }
    toast.success(editingId ? "Template updated" : "Template saved for reuse");
    setEditingId(null); setName(""); setItems([""]); void refresh();
  }
  async function remove(id: string) {
    if (!(await confirmDialog("Delete this saved template? Existing checklists will remain.", { destructive: true }))) return;
    const { error } = await supabase.from("checklist_templates").delete().eq("id", id).eq("owner_id", session?.user.id ?? "");
    if (error) toast.error(error.message); else { toast.success("Template deleted"); void refresh(); }
  }
  async function apply() {
    if (!targetId || !selected) return;
    setBusy(true);
    const { error } = await supabase.rpc("apply_checklist_template", { p_template_id: selected, ...(audience === "producer" ? { p_production_id: targetId } : {}), ...(audience === "crew" ? { p_crew_id: targetId } : {}) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Checklist added from template");
    setSelected("");
    void qc.invalidateQueries({ queryKey: audience === "producer" ? ["checklists", targetId] : ["personal-crew-checklists", targetId] });
  }
  return <section className="space-y-4 rounded-lg border border-border bg-card p-4">
    <h2 className="text-lg font-bold">{audience === "producer" ? "Producer" : "Crew"} checklist templates</h2>
    <p className="text-sm text-muted-foreground">Choose a prepared checklist or create your own. Templates are reusable and do not change checklists already added.</p>
    {targetId && <div className="flex flex-wrap gap-2">
      <select aria-label="Choose checklist template" value={selected} onChange={(e) => setSelected(e.target.value)} className="min-w-52 flex-1 rounded border border-border bg-background p-2 text-sm">
        <option value="">Choose a prepared checklist…</option>
        {(q.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}{t.owner_id ? " (Mine)" : " (Default)"}</option>)}
      </select>
      <button disabled={!selected || busy} onClick={apply} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Add checklist</button>
    </div>}
    {!targetId && <>
    <div className="space-y-2">
      <h3 className="font-semibold">{editingId ? "Edit my template" : "Create a reusable template"}</h3>
      <input aria-label="Template name" placeholder="Checklist name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-border bg-background p-2 text-sm" />
      {items.map((item, i) => <div key={i} className="flex gap-2">
        <input aria-label={`Item ${i + 1}`} placeholder={`Task ${i + 1}`} value={item} onChange={(e) => setItems((prev) => prev.map((x, n) => n === i ? e.target.value : x))} className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm" />
        <button type="button" onClick={() => setItems((prev) => prev.filter((_, n) => n !== i))} disabled={items.length === 1} className="rounded border px-3 text-sm disabled:opacity-50">Remove</button>
      </div>)}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setItems((prev) => [...prev, ""])} className="rounded border border-border px-3 py-2 text-sm">+ Add item</button>
        <button disabled={busy} onClick={save} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Save template</button>
        {editingId && <button onClick={() => { setEditingId(null); setName(""); setItems([""]); }} className="rounded border px-3 py-2 text-sm">Cancel edit</button>}
      </div>
    </div>
    {q.error && <p role="alert" className="text-sm text-destructive">{q.error.message}</p>}
    <div className="space-y-1"><h3 className="font-semibold">Template library ({q.data?.length ?? 0})</h3>
      {(q.data ?? []).map((t) => <div key={t.id} className="flex items-center gap-2 border-b border-border py-2 text-sm">
        <div className="min-w-0 flex-1"><strong>{t.title}</strong><span className="ml-2 text-xs text-muted-foreground">{Array.isArray(t.items) ? t.items.length : 0} items · {t.owner_id ? "Mine" : "Prepared"}</span></div>
        {t.owner_id === session?.user.id && <><button className="text-primary underline" onClick={() => { setEditingId(t.id); setName(t.title); setItems(Array.isArray(t.items) ? t.items.map(String) : [""]); }}>Edit</button><button className="text-destructive underline" onClick={() => remove(t.id)}>Delete</button></>}
      </div>)}
    </div>
    </>}
  </section>;
}
