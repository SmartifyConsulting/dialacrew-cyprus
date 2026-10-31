import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Download, FileText, Plus, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { signedUrl, uploadFile, useDocs, useInvalidate } from "@/lib/site";
import { confirmDialog } from "@/components/ConfirmDialog";
const when = (s: string) => new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Item = { id: string; label: string; sort_order: number };
type Doc = { id: string; name: string; path: string; category: string; checklist_item_id: string | null; uploader_name: string; created_at: string };

export function DocumentsTab({ p, userId, myName, isProducer }: { p: { id: string; name: string }; userId: string; myName: string; isProducer: boolean }) {
  const qc = useQueryClient();
  const inv = useInvalidate();
  const docs = (useDocs(p.id).data ?? []) as Doc[];
  const items = (useQuery({
    queryKey: ["document-items", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_document_items").select("id, label, sort_order").eq("production_id", p.id).order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  }).data) ?? [];
  const templates = (useQuery({
    queryKey: ["document-templates"], enabled: isProducer,
    queryFn: async () => {
      const { data, error } = await supabase.from("document_checklist_templates").select("id, name, is_default").eq("kind", "documents").order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  }).data) ?? [];

  const [newItem, setNewItem] = useState("");
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [general, setGeneral] = useState(false);
  const refresh = () => { inv(["documents", p.id], ["document-items", p.id]); };

  async function addItem() {
    const label = newItem.trim();
    if (!label) return;
    const { error } = await supabase.from("production_document_items").insert({ production_id: p.id, label, sort_order: items.length + 1 });
    if (error) { toast.error(friendlyError(error)); return; }
    setNewItem("");
    refresh();
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("production_document_items").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function uploadTo(item: Item | null, list: FileList | null) {
    if (!list?.length) return;
    setUploadingFor(item?.id ?? "general");
    try {
      for (const file of Array.from(list)) {
        const path = await uploadFile(`${p.id}/docs`, file, file.name);
        const { error } = await supabase.from("site_documents").insert({
          production_id: p.id, name: file.name, category: item?.label ?? "General", path, size: file.size,
          uploaded_by: userId, uploader_name: myName, checklist_item_id: item?.id ?? null,
        });
        if (error) throw error;
      }
      toast.success("Uploaded");
      refresh();
    } catch (e) { toast.error(friendlyError(e)); }
    setUploadingFor(null);
  }

  async function removeDoc(id: string) {
    const { error } = await supabase.from("site_documents").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function saveAsNamed() {
    const name = saveName.trim();
    if (!name) { toast.error("Name this checklist"); return; }
    if (items.length === 0) { toast.error("Add at least one item first"); return; }
    setBusy(true);
    try {
      const { data: t, error: tErr } = await supabase.from("document_checklist_templates").insert({ name, is_default: false }).select("id").single();
      if (tErr) throw tErr;
      const { error } = await supabase.from("document_checklist_template_items").insert(items.map((i) => ({ template_id: t.id, label: i.label, sort_order: i.sort_order })));
      if (error) throw error;
      toast.success(`Saved “${name}”`);
      setSaveName("");
      qc.invalidateQueries({ queryKey: ["document-templates"] });
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  async function loadTemplate(templateId: string) {
    const { data, error } = await supabase.from("document_checklist_template_items").select("label, sort_order").eq("template_id", templateId).order("sort_order", { ascending: true });
    if (error) { toast.error(friendlyError(error)); return; }
    if (!(await confirmDialog("Replace this job's checklist with the saved one? Uploaded documents stay put."))) return;
    setBusy(true);
    await supabase.from("production_document_items").delete().eq("production_id", p.id);
    const { error: insErr } = await supabase.from("production_document_items").insert((data ?? []).map((r) => ({ production_id: p.id, label: r.label, sort_order: r.sort_order })));
    setBusy(false);
    if (insErr) { toast.error(friendlyError(insErr)); return; }
    toast.success("Checklist loaded");
    refresh();
  }

  const generalDocs = docs.filter((d) => !d.checklist_item_id);

  function DocRow({ d }: { d: Doc }) {
    return (
      <li className="flex items-center gap-3 px-4 py-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">{d.name}</div>
          <div className="text-xs text-muted-foreground">{d.uploader_name || "—"} · {when(d.created_at)}</div>
        </div>
        <button aria-label="Download" onClick={async () => window.open(await signedUrl(d.path), "_blank", "noopener")} className="text-muted-foreground hover:text-primary"><Download className="h-4 w-4" /></button>
        <button aria-label="Delete document" onClick={() => removeDoc(d.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <Panel title={`Document checklist (${items.filter((i) => docs.some((d) => d.checklist_item_id === i.id)).length}/${items.length} on file)`}
        collapsible defaultCollapsed
        badge={(() => {
          const outstanding = items.filter((i) => !docs.some((d) => d.checklist_item_id === i.id)).length;
          return outstanding > 0 ? <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-bold text-white">{outstanding}</span> : undefined;
        })()}
        right={isProducer && templates.length > 0 ? (
          <select className={`${input} py-1 text-xs`} value="" aria-label="Load a saved checklist" disabled={busy}
            onChange={(e) => { if (e.target.value) loadTemplate(e.target.value); }}>
            <option value="">Load a saved checklist…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : undefined}>
        <ul className="divide-y divide-border">
          {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">No checklist items yet.</li>}
          {items.map((item) => {
            const itemDocs = docs.filter((d) => d.checklist_item_id === item.id);
            const done = itemDocs.length > 0;
            return (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{itemDocs.length} file{itemDocs.length === 1 ? "" : "s"}</span>
                  <label className={`${btn} cursor-pointer ${uploadingFor === item.id ? "opacity-60" : ""}`}>
                    {uploadingFor === item.id ? "Uploading…" : "Upload"}
                    <input type="file" multiple hidden disabled={uploadingFor !== null} onChange={(e) => { uploadTo(item, e.target.files); e.target.value = ""; }} />
                  </label>
                  {isProducer && <button aria-label={`Remove ${item.label}`} onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
                </div>
                {itemDocs.length > 0 && <ul className="ml-7 mt-2 divide-y divide-border rounded-sm border border-border">{itemDocs.map((d) => <DocRow key={d.id} d={d} />)}</ul>}
              </li>
            );
          })}
        </ul>
        {isProducer && (
          <div className="space-y-3 border-t border-border p-4">
            <form onSubmit={(e) => { e.preventDefault(); addItem(); }} className="flex gap-2">
              <input className={`${input} flex-1`} placeholder="Add a document to the checklist…" value={newItem} onChange={(e) => setNewItem(e.target.value)} />
              <button type="submit" className={btn}><Plus className="mr-1 inline h-3.5 w-3.5" />Add</button>
            </form>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input className={`${input} min-w-48 flex-1`} placeholder="Name this checklist to save it" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
              <button disabled={busy} onClick={saveAsNamed} className={btn}>Save checklist</button>
            </div>
          </div>
        )}
      </Panel>

      <Panel title={`General documents (${generalDocs.length})`} right={
        <label className={`${btn} cursor-pointer ${general ? "opacity-60" : ""}`}>
          {general ? "Uploading…" : "Upload"}
          <input type="file" multiple hidden disabled={general} onChange={async (e) => { setGeneral(true); await uploadTo(null, e.target.files); setGeneral(false); e.target.value = ""; }} />
        </label>}>
        <ul className="divide-y divide-border">
          {generalDocs.length === 0 && <li className="p-4 text-sm text-muted-foreground">No other documents yet.</li>}
          {generalDocs.map((d) => <DocRow key={d.id} d={d} />)}
        </ul>
      </Panel>
    </div>
  );
}
