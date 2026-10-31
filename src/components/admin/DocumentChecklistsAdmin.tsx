import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Star, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { confirmDialog } from "@/components/ConfirmDialog";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const KINDS = [
  { value: "documents", label: "Documents checklist" },
  { value: "cashflow", label: "Cashflow checklist" },
] as const;

type Template = { id: string; name: string; kind: string; is_default: boolean };
type TItem = { id: string; label: string; amount: number | null; sort_order: number };

export function DocumentChecklistsAdmin() {
  const qc = useQueryClient();
  const templates = (useQuery({
    queryKey: ["admin-doc-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_checklist_templates").select("id, name, kind, is_default").order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  }).data) ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = templates.find((t) => t.id === selectedId) ?? null;
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<string>("documents");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-doc-templates"] });

  async function createTemplate() {
    const name = newName.trim();
    if (!name) { toast.error("Name the checklist"); return; }
    setBusy(true);
    const { data, error } = await supabase.from("document_checklist_templates").insert({ name, kind: newKind, is_default: false }).select("id").single();
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    setNewName("");
    setSelectedId(data.id);
    refresh();
  }

  async function setDefault(t: Template) {
    setBusy(true);
    // one default per kind: clear the current one first, then set this one
    const { error: clearErr } = await supabase.from("document_checklist_templates").update({ is_default: false }).eq("kind", t.kind).eq("is_default", true);
    const { error } = clearErr ? { error: clearErr } : await supabase.from("document_checklist_templates").update({ is_default: true }).eq("id", t.id);
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`“${t.name}” is now the default for new productions`);
    refresh();
  }

  async function rename(t: Template, name: string) {
    if (!name.trim() || name.trim() === t.name) return;
    const { error } = await supabase.from("document_checklist_templates").update({ name: name.trim() }).eq("id", t.id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function remove(t: Template) {
    if (t.is_default) { toast.error("Set another default before deleting this one"); return; }
    if (!(await confirmDialog(`Delete "${t.name}"? This can't be undone.`, { destructive: true }))) return;
    const { error } = await supabase.from("document_checklist_templates").delete().eq("id", t.id);
    if (error) { toast.error(friendlyError(error)); return; }
    setSelectedId(null);
    refresh();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Panel title="Checklists">
          <ul className="divide-y divide-border text-sm">
            {templates.length === 0 && <li className="p-4 text-muted-foreground">No checklists yet.</li>}
            {templates.map((t) => (
              <li key={t.id}>
                <button onClick={() => setSelectedId(t.id)} className={`flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted ${selectedId === t.id ? "bg-muted" : ""}`}>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t.kind === "cashflow" ? "Cashflow" : "Documents"}</span>
                  {t.is_default && <Star className="h-3.5 w-3.5 shrink-0 fill-primary text-primary" aria-label="Default" />}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="New checklist">
          <div className="space-y-2 p-4">
            <input className={`${input} w-full`} placeholder="Checklist name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <select className={`${input} w-full`} value={newKind} onChange={(e) => setNewKind(e.target.value)} aria-label="Checklist type">
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <button disabled={busy} onClick={createTemplate} className={btn}>Create checklist</button>
          </div>
        </Panel>
      </div>

      {selected ? (
        <TemplateEditor key={selected.id} template={selected} busy={busy} onSetDefault={() => setDefault(selected)}
          onRename={(name) => rename(selected, name)} onDelete={() => remove(selected)} />
      ) : (
        <Panel title="Select a checklist"><p className="p-4 text-sm text-muted-foreground">Choose a checklist to edit its items, or create a new one.</p></Panel>
      )}
    </div>
  );
}

function TemplateEditor({ template, busy, onSetDefault, onRename, onDelete }: {
  template: Template; busy: boolean; onSetDefault: () => void; onRename: (name: string) => void; onDelete: () => void;
}) {
  const items = (useQuery({
    queryKey: ["admin-doc-template-items", template.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_checklist_template_items").select("id, label, amount, sort_order").eq("template_id", template.id).order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TItem[];
    },
  }).data) ?? [];
  const [name, setName] = useState(template.name);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const isCashflow = template.kind === "cashflow";
  const qc2 = useQueryClient();

  async function addItem() {
    const l = label.trim();
    if (!l) return;
    const { error } = await supabase.from("document_checklist_template_items").insert({
      template_id: template.id, label: l, amount: isCashflow && amount ? Number(amount) : null, sort_order: items.length + 1,
    });
    if (error) { toast.error(friendlyError(error)); return; }
    setLabel(""); setAmount("");
    qc2.invalidateQueries({ queryKey: ["admin-doc-template-items", template.id] });
  }

  async function removeItem(id: string) {
    const { error } = await supabase.from("document_checklist_template_items").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc2.invalidateQueries({ queryKey: ["admin-doc-template-items", template.id] });
  }

  const total = items.reduce((a, i) => a + Number(i.amount ?? 0), 0);

  return (
    <Panel title={`${template.name} · ${isCashflow ? "Cashflow" : "Documents"}`} right={
      <div className="flex items-center gap-3 text-xs">
        {template.is_default
          ? <span className="font-semibold text-primary">Default</span>
          : <button disabled={busy} onClick={onSetDefault} className="font-semibold text-primary hover:underline">Set as default</button>}
        {!template.is_default && <button onClick={onDelete} aria-label="Delete checklist" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>}>
      <div className="space-y-4 p-4">
        <div className="flex gap-2">
          <input className={`${input} flex-1`} value={name} onChange={(e) => setName(e.target.value)} aria-label="Checklist name" />
          <button onClick={() => onRename(name)} className={btn}>Rename</button>
        </div>
        <ul className="divide-y divide-border rounded-sm border border-border text-sm">
          {items.length === 0 && <li className="p-3 text-muted-foreground">No items yet.</li>}
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">{i.label}</span>
              {isCashflow && <span className="font-mono text-xs">{i.amount != null ? `R${Number(i.amount).toLocaleString("en-ZA")}` : "—"}</span>}
              <button aria-label={`Remove ${i.label}`} onClick={() => removeItem(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
          {isCashflow && items.length > 0 && <li className="flex justify-between px-3 py-2 text-xs font-semibold"><span>Total budgeted</span><span className="font-mono">R{total.toLocaleString("en-ZA")}</span></li>}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); addItem(); }} className="flex flex-wrap gap-2">
          <input className={`${input} min-w-48 flex-1`} placeholder={isCashflow ? "Cost line, e.g. Permit (JMPD)" : "Document, e.g. Call sheet"} value={label} onChange={(e) => setLabel(e.target.value)} />
          {isCashflow && <input className={`${input} w-32`} type="number" min={0} placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />}
          <button type="submit" className={btn}>Add item</button>
        </form>
      </div>
    </Panel>
  );
}
