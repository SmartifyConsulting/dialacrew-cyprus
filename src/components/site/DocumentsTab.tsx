import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Download, FileText, Folder, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, uploadFile, useDocs, useInvalidate } from "@/lib/site";
import { confirmDialog } from "@/components/ConfirmDialog";

const when = (s: string) => new Date(s).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Doc = { id: string; name: string; path: string; category: string; uploader_name: string; created_at: string };

// Folders every job starts with; any other category a document was filed under shows as its own folder.
const DEFAULT_FOLDERS = ["Call Sheets", "Contracts", "Invoices", "Permits", "Releases", "General"];

function FolderTile({ name, count, onOpen }: { name: string; count: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex flex-col items-center gap-1 rounded-sm p-3 text-center hover:bg-muted">
      <Folder className="h-14 w-14 fill-amber-400 text-amber-600" />
      <span className="line-clamp-2 w-full text-xs font-semibold text-foreground">{name}</span>
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </button>
  );
}

// Documents frame: Explorer-style folder tiles, same layout as Albums.
export function DocumentsTab({ p, userId, myName }: { p: { id: string; name: string }; userId: string; myName: string; isProducer: boolean }) {
  const { t } = useTranslation();
  const inv = useInvalidate();
  const docs = (useDocs(p.id).data ?? []) as Doc[];
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => inv(["documents", p.id]);

  const folderOf = (d: Doc) => d.category || "General";
  const folders = Array.from(new Set([...DEFAULT_FOLDERS, ...extra, ...docs.map(folderOf)]));

  async function upload(list: FileList | null) {
    if (!list?.length || !open) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        const path = await uploadFile(`${p.id}/docs`, file, file.name);
        const { error } = await supabase.from("site_documents").insert({
          production_id: p.id, name: file.name, category: open, path, size: file.size,
          uploaded_by: userId, uploader_name: myName, checklist_item_id: null,
        });
        if (error) throw error;
      }
      toast.success("Uploaded");
      refresh();
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  async function removeDoc(id: string) {
    if (!(await confirmDialog("Delete this document?", { destructive: true }))) return;
    const { error } = await supabase.from("site_documents").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  function addFolder() {
    const n = name.trim();
    if (!n) return;
    setExtra((x) => [...x, n]);
    setName(""); setAdding(false);
  }

  if (open) {
    const items = docs.filter((d) => folderOf(d) === open);
    return (
      <div className="rounded-sm border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border p-3">
          <button onClick={() => setOpen(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary">
            <ChevronLeft className="h-4 w-4" /> Documents
          </button>
          <h3 className="min-w-0 flex-1 truncate text-center font-display text-sm font-semibold">{open} ({items.length})</h3>
          <label className={`${btn} cursor-pointer ${busy ? "opacity-60" : ""}`}>
            {busy ? t("files.uploading") : t("files.upload")}
            <input type="file" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
        <ul className="divide-y divide-border">
          {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">{t("files.empty")}</li>}
          {items.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{d.name}</div>
                <div className="text-xs text-muted-foreground">{d.uploader_name || "—"} · {when(d.created_at)}</div>
              </div>
              <button aria-label="Download" onClick={async () => window.open(await signedUrl(d.path), "_blank", "noopener")} className="text-muted-foreground hover:text-primary"><Download className="h-4 w-4" /></button>
              <button aria-label="Delete document" onClick={() => removeDoc(d.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <h3 className="font-display text-sm font-semibold">Documents</h3>
        {adding ? (
          <div className="flex flex-wrap items-center gap-2">
            <input autoFocus className={`${input} min-w-48`} placeholder="Folder name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addFolder()} />
            <button onClick={addFolder} className={btn}>Create folder</button>
            <button onClick={() => setAdding(false)} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className={btn}>+ New folder</button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 md:grid-cols-6">
        {folders.map((f) => <FolderTile key={f} name={f} count={docs.filter((d) => folderOf(d) === f).length} onOpen={() => setOpen(f)} />)}
      </div>
    </div>
  );
}
