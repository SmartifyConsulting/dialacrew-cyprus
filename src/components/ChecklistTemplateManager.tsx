import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t: translate } = useTranslation();
  const { session } = useSession();
  const qc = useQueryClient();
  const q = useChecklistTemplates(audience);
  const docTemplates = useQuery({ queryKey: ["document-templates"], enabled: audience === "producer" && !!targetId, queryFn: async () => {
    const { data, error } = await supabase.from("document_checklist_templates").select("id, name").eq("kind", "documents").order("name");
    if (error) throw error; return data ?? [];
  } }).data ?? [];
  const [name, setName] = useState("");
  const [items, setItems] = useState<string[]>([""]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["checklist-templates", audience] });
  async function save() {
    const title = name.trim(), lines = items.map((x) => x.trim()).filter(Boolean);
    if (!title || !lines.length || !session?.user.id) { toast.error(translate("templates.required")); return; }
    setBusy(true);
    const payload = { title, items: lines, audience, owner_id: session.user.id };
    const result = editingId
      ? await supabase.from("checklist_templates").update(payload).eq("id", editingId).eq("owner_id", session.user.id)
      : await supabase.from("checklist_templates").insert(payload);
    setBusy(false);
    if (result.error) { toast.error(result.error.message); return; }
    toast.success(translate(editingId ? "templates.updated" : "templates.saved"));
    setEditingId(null); setName(""); setItems([""]); void refresh();
  }
  async function remove(id: string) {
    if (!(await confirmDialog(translate("templates.deleteConfirm"), { destructive: true }))) return;
    const { error } = await supabase.from("checklist_templates").delete().eq("id", id).eq("owner_id", session?.user.id ?? "");
    if (error) toast.error(error.message); else { toast.success(translate("templates.deleted")); void refresh(); }
  }
  async function apply() {
    if (!targetId || !selected) return;
    setBusy(true);
    if (selected.startsWith("doc:")) {
      // Document checklists live in their own template table; copy them in as a normal production checklist.
      const id = selected.slice(4);
      const tpl = docTemplates.find((d) => d.id === id);
      const { data: rows, error: e1 } = await supabase.from("document_checklist_template_items").select("label, sort_order").eq("template_id", id).order("sort_order");
      const { data: list, error: e2 } = e1 ? { data: null, error: e1 } : await supabase.from("production_checklists").insert({ production_id: targetId, title: tpl?.name ?? "Documents", sort_order: 999 }).select("id").single();
      const e3 = e2 || !list ? e2 : (await supabase.from("production_checklist_items").insert((rows ?? []).map((r, i) => ({ checklist_id: list.id, label: r.label, sort_order: i })))).error;
      setBusy(false);
      if (e1 || e2 || e3) { toast.error((e1 || e2 || e3)!.message); return; }
      toast.success(translate("templates.applied")); setSelected("");
      void qc.invalidateQueries({ queryKey: ["checklists", targetId] });
      return;
    }
    const { error } = await supabase.rpc("apply_checklist_template", { p_template_id: selected, ...(audience === "producer" ? { p_production_id: targetId } : {}), ...(audience === "crew" ? { p_crew_id: targetId } : {}) });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(translate("templates.applied"));
    setSelected("");
    void qc.invalidateQueries({ queryKey: audience === "producer" ? ["checklists", targetId] : ["personal-crew-checklists", targetId] });
  }
  return <section className="space-y-4 rounded-lg border border-border bg-card p-4">
    <h2 className="text-lg font-bold">{translate(audience === "producer" ? "templates.producer" : "templates.crew")}</h2>
    <p className="text-sm text-muted-foreground">{translate("templates.help")}</p>
    {targetId && <div className="flex flex-wrap gap-2">
      <select aria-label={translate("templates.choose")} value={selected} onChange={(e) => setSelected(e.target.value)} className="min-w-52 flex-1 rounded border border-border bg-background p-2 text-sm">
        <option value="">{translate("templates.choose")}</option>
        <optgroup label="Checklists">{(q.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}{t.owner_id ? ` (${translate("templates.mine")})` : ""}</option>)}</optgroup>
        {docTemplates.length > 0 && <optgroup label="Documents">{docTemplates.map((d) => <option key={d.id} value={`doc:${d.id}`}>{d.name}</option>)}</optgroup>}
      </select>
      <button disabled={!selected || busy} onClick={apply} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{translate("templates.addChecklist")}</button>
    </div>}
    {!targetId && <>
    <div className="space-y-2">
      <h3 className="font-semibold">{translate(editingId ? "templates.edit" : "templates.create")}</h3>
      <input aria-label={translate("templates.name")} placeholder={translate("templates.name")} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-border bg-background p-2 text-sm" />
      {items.map((item, i) => <div key={i} className="flex gap-2">
        <input aria-label={translate("templates.item", { number: i + 1 })} placeholder={translate("templates.item", { number: i + 1 })} value={item} onChange={(e) => setItems((prev) => prev.map((x, n) => n === i ? e.target.value : x))} className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm" />
        <button type="button" onClick={() => setItems((prev) => prev.filter((_, n) => n !== i))} disabled={items.length === 1} className="rounded border px-3 text-sm disabled:opacity-50">{translate("templates.remove")}</button>
      </div>)}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setItems((prev) => [...prev, ""])} className="rounded border border-border px-3 py-2 text-sm">+ {translate("templates.addItem")}</button>
        <button disabled={busy} onClick={save} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{translate("templates.save")}</button>
        {editingId && <button onClick={() => { setEditingId(null); setName(""); setItems([""]); }} className="rounded border px-3 py-2 text-sm">{translate("common.cancel")}</button>}
      </div>
    </div>
    {q.error && <p role="alert" className="text-sm text-destructive">{q.error.message}</p>}
    <div className="space-y-1"><h3 className="font-semibold">{translate("templates.library", { count: q.data?.length ?? 0 })}</h3>
      {(q.data ?? []).map((t) => <div key={t.id} className="flex items-center gap-2 border-b border-border py-2 text-sm">
        <div className="min-w-0 flex-1"><strong>{t.title}</strong><span className="ml-2 text-xs text-muted-foreground">{Array.isArray(t.items) ? t.items.length : 0} items · {t.owner_id ? "Mine" : "Prepared"}</span></div>
        {t.owner_id === session?.user.id && <><button className="text-primary underline" onClick={() => { setEditingId(t.id); setName(t.title); setItems(Array.isArray(t.items) ? t.items.map(String) : [""]); }}>{translate("common.edit")}</button><button className="text-destructive underline" onClick={() => remove(t.id)}>{translate("common.delete")}</button></>}
      </div>)}
    </div>
    </>}
  </section>;
}
