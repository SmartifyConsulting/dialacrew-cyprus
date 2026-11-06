import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { useEffect, useRef, useState } from "react";
import { Copy, Pencil, Search, Trash2, Upload } from "lucide-react";
import { Badge, ClientBadge, Page, Panel } from "@/components/AppShell";
import { fmtMoney } from "@/lib/demo-data";
import { useProductions, useProductionTypes, useCreateProductionType } from "@/lib/db";
import { useQueryClient } from "@tanstack/react-query";
import { useRole, useSession } from "@/lib/auth";
import { PolishDescription } from "@/components/site/PolishDescription";
import { uploadFile, useSignedUrl } from "@/lib/site";
import { ProductionAvatar } from "@/components/site/ProductionCover";
import { ImageCropDialog } from "@/components/site/ImageCropDialog";
import { AmPmTimePicker } from "@/components/site/SiteTabs";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/productions/")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => (s["new"] ? { new: true } : {}),
  head: () => ({
    meta: [
      { title: "Productions — Book a Crew" },
      { name: "description", content: "Create productions from a client brief and manage every shoot." },
      { property: "og:title", content: "Productions — Book a Crew" },
      { property: "og:description", content: "Create and manage productions." },
      { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Productions,
});

const field = "w-full rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring";
const labelCls = "block text-xs font-medium text-muted-foreground";

type ClientRow = { id: string; name: string; company: string };

// Dropdown to pick an existing client, add a new one inline, or bulk-import a CSV of clients.
function ClientPicker({ clients, value, onChange, onClientsChanged }: { clients: ClientRow[]; value: string; onChange: (company: string) => void; onClientsChanged: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newClient, setNewClient] = useState({ company: "", name: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const filtered = clients.filter((c) => c.company.toLowerCase().includes(query.toLowerCase()) || c.name.toLowerCase().includes(query.toLowerCase()));

  async function addClient() {
    if (!newClient.company.trim()) { toast.error("Company name is required"); return; }
    setBusy(true);
    const { error } = await supabase.from("clients").insert({ company: newClient.company.trim(), name: newClient.name.trim() || newClient.company.trim() });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`${newClient.company} added`);
    onClientsChanged();
    onChange(newClient.company.trim());
    setNewClient({ company: "", name: "" });
    setAdding(false);
    setOpen(false);
  }

  // Expects a simple CSV with a header row: company,name,email,phone (name/email/phone optional).
  function parseCsv(text: string) {
    const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
    if (rows.length < 2) { toast.error("File has no data rows"); return null; }
    const header = rows[0]!.split(",").map((h) => h.trim().toLowerCase());
    const companyIdx = header.indexOf("company");
    if (companyIdx === -1) { toast.error("File must have a 'company' column"); return null; }
    const nameIdx = header.indexOf("name");
    const emailIdx = header.indexOf("email");
    const phoneIdx = header.indexOf("phone");
    return rows.slice(1).map((r) => {
      const cols = r.split(",").map((c) => c.trim());
      const company = cols[companyIdx] ?? "";
      return { company, name: (nameIdx > -1 ? cols[nameIdx] : "") || company, email: emailIdx > -1 ? cols[emailIdx] ?? "" : "", phone: phoneIdx > -1 ? cols[phoneIdx] ?? "" : "" };
    }).filter((r) => r.company);
  }

  async function uploadClientsFile(file: File) {
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (ext !== "csv" && ext !== "xls" && ext !== "xlsx") {
      toast.error("Only .csv or .xls files are supported — please upload one of those formats.");
      return;
    }
    if (ext === "xls" || ext === "xlsx") {
      toast.error(".xls isn't readable as plain text yet — please export/save your spreadsheet as .csv and upload that instead.");
      return;
    }
    const records = parseCsv(await file.text());
    if (!records || records.length === 0) { if (records) toast.error("No valid rows found"); return; }
    setBusy(true);
    const { error } = await supabase.from("clients").insert(records);
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`Imported ${records.length} client(s)`);
    onClientsChanged();
  }

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className={`${field} flex items-center justify-between text-left`}>
        <span className={value ? "" : "text-muted-foreground"}>{value || t("clientPicker.select")}</span>
        <span className="text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-sm border border-border bg-card shadow-md">
          <div className="p-2">
            <input autoFocus className={field} placeholder={t("clientPicker.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { onChange(c.company); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                  {c.company} — {c.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{t("clientPicker.empty")}</li>}
          </ul>
          <div className="border-t border-border p-2">
            {adding ? (
              <div className="space-y-2">
                <input className={field} placeholder={t("clientPicker.company")} value={newClient.company} onChange={(e) => setNewClient({ ...newClient, company: e.target.value })} />
                <input className={field} placeholder={t("clientPicker.contact")} value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                <div className="flex gap-2">
                  <button type="button" disabled={busy} onClick={addClient} className="rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60">{busy ? t("recovery.saving") : t("clientPicker.save")}</button>
                  <button type="button" onClick={() => setAdding(false)} className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold">{t("common.cancel")}</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-primary hover:underline">+ {t("clientPicker.add")}</button>
                <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Upload className="h-3.5 w-3.5" /> Upload clients (csv or xls)
                </button>
                <input ref={fileRef} type="file" accept=".csv,text/csv,.xls,.xlsx" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadClientsFile(file); e.target.value = ""; }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Productions() {
  const { t } = useTranslation();
  const list = useProductions().data ?? [];
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { new: openOnLoad } = Route.useSearch();
  const { session } = useSession();
  const role = useRole(session?.user.id);
  const isProducer = role.data === "producer" || (role.data as string) === "admin";
  const clientsQuery = useQuery({
    queryKey: ["clients"],
    queryFn: async () => { const { data, error } = await supabase.from("clients").select("id, name, company").order("company"); if (error) throw error; return data ?? []; },
  });
  const clients = clientsQuery.data ?? [];
  const productionTypes = useProductionTypes().data ?? ["Commercial", "Film", "Television", "Photography", "Other"];
  const createProductionType = useCreateProductionType();
  const [open, setOpen] = useState(!!openOnLoad);
  const [duplicating, setDuplicating] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [newType, setNewType] = useState("");
  const blankForm = { name: "", client: "", jobId: "", externalRef: "", type: "Commercial", location: "", recceDate: "", recceTime: "", startDate: "", endDate: "", budget: 0, description: "" };
  const [f, setF] = useState(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null); // editing an existing production
  const [draftId, setDraftId] = useState<string | null>(null); // autosaved draft while creating a new one
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null); // picture waiting to be cropped
  const [search, setSearch] = useState("");

  const filteredList = list.filter((p) => !search.trim() || (p.jobId ?? "").toLowerCase().includes(search.trim().toLowerCase()) || (p.externalRef ?? "").toLowerCase().includes(search.trim().toLowerCase()) || p.name.toLowerCase().includes(search.trim().toLowerCase()));

  // Shoot days is inclusive of both the start and end date.
  const days = f.startDate && f.endDate ? Math.max(1, Math.round((+new Date(f.endDate) - +new Date(f.startDate)) / 86400000) + 1) : 1;
  const addDays = (ymd: string, n: number) => { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  // Ignore the production being edited and the draft this form autosaved itself.

  const resetForm = () => { setF(blankForm); setEditingId(null); setDraftId(null); setDuplicating(false); setCoverFile(null); setCoverPreview(null); setCropSource(null); };
  // A chosen picture is cropped first; the cropped square is what gets saved as the cover.
  const pickCover = (file: File | undefined) => { if (file) setCropSource(file); };
  const applyCrop = (cropped: File) => {
    setCropSource(null);
    setCoverFile(cropped);
    setCoverPreview(URL.createObjectURL(cropped));
  };
  const editingCoverUrl = useSignedUrl(list.find((x) => x.id === editingId)?.imagePath).data;
  const closeModal = () => { setOpen(false); resetForm(); if (openOnLoad) navigate({ to: "/productions", search: {}, replace: true }); };
  async function addType() {
    const name = newType.trim();
    if (!name) { toast.error("Enter a type name"); return; }
    try {
      await createProductionType.mutateAsync(name);
      setF((f) => ({ ...f, type: name, name: f.name === `${f.type} - ${f.client}` || !f.name ? `${name} - ${f.client}` : f.name }));
      setNewType("");
      setAddingType(false);
    } catch (e) { toast.error(friendlyError(e)); }
  }
  // A Production ID is immutable and database-generated on insert, so start a Draft the moment the
  // form opens — the ID exists right away instead of only appearing once other fields are filled in.
  const openNew = async () => {
    resetForm();
    setOpen(true);
    const { data, error } = await supabase.from("productions").insert({ name: "", client: "", status: "Draft" } as never).select("id, job_id").single();
    if (error) { toast.error(friendlyError(error)); return; }
    setDraftId(data.id);
    setF((prev) => ({ ...prev, jobId: data.job_id }));
  };
  const openEdit = (p: (typeof list)[number]) => {
    setF({ name: p.name, client: p.client, jobId: p.jobId ?? "", externalRef: p.externalRef ?? "", type: p.type, location: p.location, recceDate: p.recceDate ?? "", recceTime: p.recceStart ?? "", startDate: p.date ?? "", endDate: p.endDate ?? "", budget: p.budget, description: p.summary ?? "" });
    setEditingId(p.id);
    setDraftId(null);
    setDuplicating(false);
    setOpen(true);
  };
  const openDuplicate = async (p: (typeof list)[number]) => {
    setF({ name: `${p.name} (copy)`, client: p.client, jobId: "", externalRef: "", type: p.type, location: p.location, recceDate: p.recceDate ?? "", recceTime: p.recceStart ?? "", startDate: p.date ?? "", endDate: p.endDate ?? "", budget: p.budget, description: p.summary ?? "" });
    setEditingId(null);
    setDraftId(null);
    setDuplicating(true);
    setOpen(true);
    const { data, error } = await supabase.from("productions").insert({ name: `${p.name} (copy)`, client: p.client, status: "Draft" } as never).select("id, job_id").single();
    if (error) { toast.error(friendlyError(error)); return; }
    setDraftId(data.id);
    setF((prev) => ({ ...prev, jobId: data.job_id }));
  };

  async function deleteProduction(p: (typeof list)[number]) {
    if (!(await confirmDialog(`Delete "${p.name}"? This can't be undone.`, { destructive: true }))) return;
    const { error } = await supabase.from("productions").delete().eq("id", p.id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`${p.name} deleted`);
    qc.invalidateQueries({ queryKey: ["productions"] });
  }

  // New productions start as a Draft so the team can sandbox crew groups against the budget before committing;
  // editing an existing one keeps its current status. Client, Production ID, name, start/end date and budget
  // are all compulsory, and a Production ID can never repeat one already in use.
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.client.trim()) { toast.error("Client is required"); return; }
    if (!f.name.trim()) { toast.error("Production name is required"); return; }
    if (!f.startDate || !f.endDate) { toast.error("Start and end date are required"); return; }
    if (f.endDate < f.startDate) { toast.error("End date can't be before the start date"); return; }
    if (f.recceDate && f.recceDate > f.startDate) { toast.error("Recce date can't be after the start date"); return; }
    if (!f.budget) { toast.error("Budget is required"); return; }
    // job_id is database-generated and immutable — never sent from the client.
    const payload = { name: f.name, client: f.client, external_ref: f.externalRef.trim() || null, type: f.type, location: f.location, budget: f.budget, recce_date: f.recceDate || null, recce_start_time: f.recceTime || null, date: f.startDate || null, end_date: f.endDate || null, days, summary: f.description };
    const targetId = editingId ?? draftId;
    const { data, error } = targetId
      ? await supabase.from("productions").update(payload).eq("id", targetId).select("id").single()
      : await supabase.from("productions").insert({ ...payload, status: "Draft" } as never).select("id").single();
    if (error) { toast.error(friendlyError(error)); return; }
    if (coverFile) {
      try {
        const path = await uploadFile(`${data.id}/cover`, coverFile, coverFile.name);
        const { error: coverErr } = await supabase.from("productions").update({ image_path: path }).eq("id", data.id);
        if (coverErr) throw coverErr;
      } catch (err) { toast.error(friendlyError(err)); }
    }
    qc.invalidateQueries({ queryKey: ["productions"] });
    const wasEditing = !!editingId;
    setOpen(false);
    resetForm();
    if (wasEditing) toast.success("Production updated");
    else navigate({ to: "/productions/$id", params: { id: data.id }, search: { tab: "find-crew" } });
  };

  return (
    <Page open title={t("nav.productions")} subtitle={t("productionList.subtitle")}
      actions={isProducer ? <button onClick={openNew} className="rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground">+ {t("dashboard.newProduction")}</button> : undefined}>
      <ImageCropDialog file={cropSource} onCancel={() => setCropSource(null)} onDone={applyCrop} />
      {open && isProducer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeModal}>
          <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-sm border border-border bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{editingId ? t("productionModal.edit") : duplicating ? t("productionModal.duplicate") : t("dashboard.newProduction")}</h2>
              <button type="button" onClick={closeModal} className="text-muted-foreground hover:text-foreground" aria-label={t("common.close")}>✕</button>
            </div>
            <div className="rounded-sm border border-border p-4">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("productionModal.info")}</h3>
              <div className="mb-4 flex items-center gap-4">
                <label className="group relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-muted hover:border-primary" aria-label={t("modalDetails.addCover")}>
                  {coverPreview ?? editingCoverUrl ? <img src={coverPreview ?? editingCoverUrl ?? ""} alt={t("modalDetails.coverPreview")} className="h-full w-full object-cover" /> : <span className="px-2 text-center text-[10px] font-semibold text-muted-foreground">{t("modalDetails.addCover")}</span>}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                <p className="text-xs text-muted-foreground">{t("productionModal.coverHelp")}</p>
              </div>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <label className={labelCls}>{t("productionModal.reference")}
                  <input className={`${field} mt-1`} placeholder={t("productionModal.external")} value={f.externalRef} onChange={(e) => setF({ ...f, externalRef: e.target.value })} /></label>
                <label className={labelCls}>{t("overview.client")} *
                  <ClientPicker clients={clients} value={f.client} onChange={(company) => setF({ ...f, client: company, name: f.name === `${f.type} - ${f.client}` || !f.name ? `${f.type} - ${company}` : f.name })} onClientsChanged={() => qc.invalidateQueries({ queryKey: ["clients"] })} /></label>
                <label className={labelCls}>{t("productionModal.name")} *
                  <input className={`${field} mt-1`} placeholder={t("productionModal.name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
                <label className={labelCls}>{t("productionList.columns.Type")}
                  {addingType ? (
                    <div className="mt-1 flex gap-2">
                      <input autoFocus className={field} placeholder={t("productionModal.newType")} value={newType} onChange={(e) => setNewType(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addType())} />
                      <button type="button" onClick={addType} className="shrink-0 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Save</button>
                      <button type="button" onClick={() => { setAddingType(false); setNewType(""); }} className="shrink-0 rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
                    </div>
                  ) : (
                    <select className={`${field} mt-1`} value={f.type} onChange={(e) => e.target.value === "__add__" ? setAddingType(true) : setF({ ...f, type: e.target.value, name: f.name === `${f.type} - ${f.client}` || !f.name ? `${e.target.value} - ${f.client}` : f.name })}>
                      {productionTypes.map((type) => <option key={type} value={type}>{t(`productionTypes.${type}`, type)}</option>)}
                      <option value="__add__">+ {t("productionModal.addType")}</option>
                    </select>
                  )}</label>
                <label className={labelCls}>{t("overview.recceDate")}
                  <div className="mt-1 flex gap-2">
                    <input className={`${field} min-w-0 flex-1`} type="date" max={f.startDate || undefined} value={f.recceDate} onChange={(e) => setF({ ...f, recceDate: e.target.value })} />
                    <AmPmTimePicker label={t("productionModal.recceTime")} placeholder={t("productionModal.selectTime")} value={f.recceTime} onChange={(value) => setF({ ...f, recceTime: value })} />
                  </div></label>
                <label className={labelCls}>{t("productionModal.start")} *
                  <input className={`${field} mt-1`} type="date" value={f.startDate}
                    onChange={(e) => setF({
                      ...f, startDate: e.target.value,
                      endDate: !f.endDate || f.endDate < e.target.value ? e.target.value : f.endDate,
                      // Default the recce to 3 days before the shoot; keep it as-is if it's already earlier, but never after the new start date.
                      recceDate: !f.recceDate ? addDays(e.target.value, -3) : f.recceDate > e.target.value ? e.target.value : f.recceDate,
                    })} /></label>
                <label className={labelCls}>{t("productionModal.end")} *
                  <input className={`${field} mt-1`} type="date" min={f.startDate || undefined} value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
                <label className={labelCls}>{t("productionModal.netBudget")} *
                  <input className={`${field} mt-1`} type="number" min={0} placeholder="0" value={f.budget || ""} onChange={(e) => setF({ ...f, budget: +e.target.value })} /></label>
                <div>
                  <span className={labelCls}>{t("productionModal.grossBudget")}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 rounded-sm border border-border bg-muted/30 px-3 py-2 text-sm font-semibold">
                      {new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(f.budget * (1 + (Number((f as any).vatRate ?? 15) || 0) / 100))}
                    </div>
                    <input aria-label={t("modalDetails.taxRate")} className="w-16 rounded-sm border border-input bg-background px-2 py-2 text-sm" type="number" min={0} max={100} step="0.01"
                      value={(f as any).vatRate ?? 15} onChange={(e) => setF({ ...f, vatRate: Number(e.target.value) } as typeof f)} />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                <div className="flex items-end pb-2 text-xs text-muted-foreground sm:col-span-2">{f.startDate && f.endDate ? t("overview.days", { count: days }) : t("productionModal.datesRequired")}</div>
                <label className={`${labelCls} sm:col-span-2`}>{t("productionModal.description")}
                  <textarea rows={3} className={`${field} mt-1`} placeholder={t("productionModal.brief")}
                    value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
                <div className="flex justify-end sm:col-span-2"><PolishDescription text={f.description} name={f.name} type={f.type} client={f.client} onPolished={(v) => setF({ ...f, description: v })} /></div>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={closeModal} className="rounded-sm border border-border px-4 py-2 text-sm font-semibold">{t("common.cancel")}</button>
              <button className="rounded-sm bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{editingId ? t("productionModal.saveChanges") : t("productionModal.createDraft")}</button>
            </div>
          </form>
        </div>
      )}
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input className={`${field} pl-9`} placeholder={t("productionList.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="grid gap-3 md:hidden">
        {filteredList.length === 0 && <p className="text-sm text-muted-foreground">No productions match "{search}".</p>}
        {filteredList.map((p) => (
          <div key={p.id} className="rounded-sm border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <ProductionAvatar name={p.name} imagePath={p.imagePath} className="h-12 w-12 text-sm" />
              <Link to="/productions/$id" params={{ id: p.id }} className="min-w-0 flex-1">
                <div className="truncate font-semibold text-primary underline-offset-2 hover:underline">{p.name}</div>
                {p.jobId && <div className="text-xs text-muted-foreground">{t("productionList.columns.Job ID")}: {p.jobId}</div>}
                <div className="mt-1 flex items-center gap-2"><ClientBadge name={p.client} /><span className="text-xs text-muted-foreground">{t(`productionTypes.${p.type}`, p.type)}</span></div>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <Badge>{t(`productionList.status.${p.status}`, p.status)}</Badge>
                {isProducer && (
                  <>
                    <button onClick={() => openEdit(p)} className="text-muted-foreground hover:text-primary" aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => openDuplicate(p)} className="text-muted-foreground hover:text-primary" aria-label={`Duplicate ${p.name}`}><Copy className="h-4 w-4" /></button>
                    <button onClick={() => deleteProduction(p)} className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{p.date || "Date TBC"} · {p.days} day(s) · {p.location}</div>
            <div className="mt-3 flex items-center justify-between text-sm"><span>{fmtMoney(p.budget, p.currency)}</span><span className="text-xs text-muted-foreground">Crew {p.crewBooked}/{p.crewNeeded}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${p.crewNeeded ? Math.min(100, (p.crewBooked / p.crewNeeded) * 100) : 0}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="hidden md:block"><Panel title={t("productionList.all")}>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] text-muted-foreground">
            <tr>{["Production", "Job ID", "Type", "Location", "Date", "Days", "Budget", "Status", ""].map((h) => <th key={h} className="px-4 py-2 font-medium">{h ? t(`productionList.columns.${h}`) : ""}</th>)}</tr>
          </thead>
          <tbody>
            {filteredList.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-muted-foreground">No productions match "{search}".</td></tr>}
            {filteredList.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/50">
                <td className="px-4 py-2.5 font-medium">
                  <div className="flex items-center gap-3">
                    <ProductionAvatar name={p.name} imagePath={p.imagePath} className="h-12 w-12 text-sm" />
                    <div className="min-w-0"><Link to="/productions/$id" params={{ id: p.id }} className="text-primary underline-offset-2 hover:underline">{p.name}</Link><div className="mt-1"><ClientBadge name={p.client} /></div></div>
                  </div>
                </td>
                <td className="px-4 text-muted-foreground">{p.jobId ?? "—"}</td>
                <td className="px-4">{t(`productionTypes.${p.type}`, p.type)}</td>
                <td className="px-4 text-muted-foreground">{p.location}</td>
                <td className="px-4 text-muted-foreground">{p.date}</td>
                <td className="px-4">{p.days}</td>
                <td className="px-4">{fmtMoney(p.budget, p.currency)}</td>
                <td className="px-4"><Badge>{t(`productionList.status.${p.status}`, p.status)}</Badge></td>
                <td className="px-4">
                  {isProducer && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(p)} className="text-muted-foreground hover:text-primary" aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => openDuplicate(p)} className="text-muted-foreground hover:text-primary" aria-label={`Duplicate ${p.name}`}><Copy className="h-4 w-4" /></button>
                      <button onClick={() => deleteProduction(p)} className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel></div>
    </Page>
  );
}
