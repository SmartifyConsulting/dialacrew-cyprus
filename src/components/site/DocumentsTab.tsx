import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileText, Folder } from "lucide-react";
import { useTranslation } from "react-i18next";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { signedUrl, uploadFile, useDocs } from "@/lib/site";
import { confirmDialog, promptDialog } from "@/components/ConfirmDialog";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm min-w-0";
const btn = "rounded-sm border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50";
type Doc = { id: string; name: string; path: string; category: string; uploader_name: string; created_at: string };
const parent = (path: string) => path.split("/").slice(0, -1).join("/");
const leaf = (path: string) => path.split("/").at(-1) ?? path;
export function DocumentsTab({ p, userId, myName, isProducer }: { p: { id: string; name: string }; userId: string; myName: string; isProducer: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const query = useDocs(p.id);
  const docs = (query.data ?? []) as Doc[];
  const folderQuery = useQuery({
    queryKey: ["document-folders", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_document_folders").select("path").eq("production_id", p.id).order("path");
      if (error) throw error;
      return data.map((row) => row.path);
    },
  });
  const [open, setOpen] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const folders = [...new Set([...(folderQuery.data ?? []), ...docs.map((d) => d.category || "General")])].sort();
  const visibleFolders = folders.filter((path) => parent(path) === open);
  const visibleDocs = docs.filter((d) => (d.category || "General") === open);
  const visibleKeys = [...visibleFolders.map((path) => "folder:" + path), ...visibleDocs.map((d) => "file:" + d.id)];
  const chosenFolders = [...selected].filter((key) => key.startsWith("folder:")).map((key) => key.slice(7));
  const chosenFiles = [...selected].filter((key) => key.startsWith("file:")).map((key) => key.slice(5));
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["docs", p.id] }), qc.invalidateQueries({ queryKey: ["document-folders", p.id] })]); };
  const toggle = (key: string) => setSelected((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const navigate = (path: string) => { setOpen(path); setSelected(new Set()); setMoving(false); };
  async function run(action: "rename" | "move" | "delete") {
    if (!selected.size) return;
    const name = action === "rename" ? await promptDialog(t("library.rename"), chosenFolders[0] ? leaf(chosenFolders[0]) : docs.find((d) => d.id === chosenFiles[0])?.name ?? "") : undefined;
    if (action === "rename" && !name?.trim()) return;
    if (action === "delete" && !(await confirmDialog(t("library.deleteConfirm"), { destructive: true }))) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("manage_document_library", {
        p_production: p.id, p_action: action, p_files: chosenFiles, p_folders: chosenFolders,
        p_destination: action === "rename" ? open : destination, ...(name ? { p_name: name.trim() } : {}),
      });
      if (error) throw error;
      setSelected(new Set()); setMoving(false);
      await refresh();
      toast.success(t("common.saved"));
    } catch (error) { toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }
  async function createFolder() {
    const name = (await promptDialog(t("library.folderName")))?.trim();
    if (!name) return;
    if (name.includes("/")) { toast.error(t("library.invalidName")); return; }
    setBusy(true);
    try {
      const path = [open, name].filter(Boolean).join("/");
      const { data, error } = await supabase.from("site_document_folders").insert({ production_id: p.id, path }).select("path").single();
      if (error || !data) throw error ?? new Error("Folder was not saved");
      await refresh();
    } catch (error) { toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const category = open || "General";
      const { error: folderError } = await supabase.from("site_document_folders").upsert({ production_id: p.id, path: category }, { onConflict: "production_id,path", ignoreDuplicates: true });
      if (folderError) throw folderError;
      for (const file of Array.from(list)) {
        const path = await uploadFile(`${p.id}/docs`, file, file.name);
        const { data, error } = await supabase.from("site_documents").insert({ production_id: p.id, name: file.name, category, path, size: file.size, uploaded_by: userId, uploader_name: myName, checklist_item_id: null }).select("id").single();
        if (error || !data) throw error ?? new Error("File was not saved");
      }
      await refresh();
      toast.success(t("common.saved"));
    } catch (error) { toast.error(friendlyError(error)); }
    finally { setBusy(false); }
  }
  return <section className="rounded-sm border border-border bg-card">
    <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <button className={btn} onClick={() => navigate("")}>{t("library.documents")}</button>
      {open && <button className={btn} onClick={() => navigate(parent(open))}>↑ {t("library.up")}</button>}
      <h3 className="min-w-0 flex-1 break-words font-semibold">{open || t("library.documents")}</h3>
      {isProducer && <><button disabled={busy || folderQuery.isError} className={btn} onClick={createFolder}>{t("library.newFolder")}</button><label className={btn}>{busy ? t("files.uploading") : t("files.upload")}<input aria-label={t("files.upload")} type="file" multiple hidden disabled={busy || folderQuery.isError} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label></>}
    </header>
    {(query.isError || folderQuery.isError) && <div role="alert" className="p-4 text-sm text-destructive">{t("library.loadError")} <button className="underline" onClick={() => void refresh()}>{t("library.retry")}</button></div>}
    {(query.isLoading || folderQuery.isLoading) && <p role="status" className="p-4">{t("library.loading")}</p>}
    {isProducer && <div className="flex flex-wrap items-center gap-3 border-b border-border p-3 text-xs">
      <label className="flex items-center gap-2"><input type="checkbox" aria-label={t("library.selectAll")} checked={visibleKeys.length > 0 && visibleKeys.every((key) => selected.has(key))} onChange={(e) => setSelected(e.target.checked ? new Set(visibleKeys) : new Set())} />{t("library.selectAll")}</label>
      <span>{selected.size} {t("library.selected")}</span>
      <button className={btn} disabled={busy || selected.size !== 1} onClick={() => void run("rename")}>{t("library.rename")}</button>
      <button className={btn} disabled={busy || !selected.size} onClick={() => { setDestination(open); setMoving(true); }}>{t("library.move")}</button>
      <button className={btn} disabled={busy || !selected.size} onClick={() => void run("delete")}>{t("library.delete")}</button>
    </div>}
    {moving && <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
      <select aria-label={t("library.destination")} className={input} value={destination} onChange={(e) => setDestination(e.target.value)}>
        <option value="">{t("library.root")}</option>
        {folders.filter((folder) => !chosenFolders.some((chosen) => folder === chosen || folder.startsWith(chosen + "/"))).map((folder) => <option key={folder} value={folder}>{folder}</option>)}
      </select>
      <button className={btn} disabled={busy} onClick={() => void run("move")}>{t("library.move")}</button>
      <button className={btn} onClick={() => setMoving(false)}>{t("common.cancel")}</button>
    </div>}
    <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
      {visibleFolders.map((folder) => <div key={folder} className="flex items-start gap-2 rounded border border-border p-3">
        {isProducer && <input type="checkbox" aria-label={t("library.selectItem", { name: leaf(folder) })} checked={selected.has("folder:" + folder)} onChange={() => toggle("folder:" + folder)} />}
        <button className="min-w-0 flex-1 text-center" onClick={() => navigate(folder)}><Folder className="mx-auto h-12 w-12 fill-amber-400 text-amber-600" /><span className="break-words text-xs">{leaf(folder)}</span></button>
      </div>)}
    </div>
    <ul className="divide-y divide-border">
      {visibleDocs.map((doc) => <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
        {isProducer && <input type="checkbox" aria-label={t("library.selectItem", { name: doc.name })} checked={selected.has("file:" + doc.id)} onChange={() => toggle("file:" + doc.id)} />}
        <FileText className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0 flex-1"><div className="break-words text-sm">{doc.name}</div><div className="text-xs text-muted-foreground">{doc.uploader_name || "—"} · {new Date(doc.created_at).toLocaleString(i18n.language)}</div></div>
        <button aria-label={t("library.download")} onClick={async () => { try { window.open(await signedUrl(doc.path, doc.name), "_blank", "noopener"); } catch (error) { toast.error(friendlyError(error)); } }}><Download className="h-4 w-4" /></button>
      </li>)}
      {!query.isLoading && !folderQuery.isLoading && !query.isError && !folderQuery.isError && !visibleDocs.length && !visibleFolders.length && <li className="p-4 text-sm text-muted-foreground">{t("files.empty")}</li>}
    </ul>
  </section>;
}
