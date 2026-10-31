import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Camera, ImageUp, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { uploadFile, useInvalidate, useLocationPoints, useSignedUrl } from "@/lib/site";
import { confirmDialog } from "@/components/ConfirmDialog";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Group = { id: string; name: string; group_date: string | null; created_by: string; created_at: string };
type Photo = { id: string; path: string; group_id: string | null; location_id: string | null; uploaded_by: string; created_at: string };

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
const todayYmd = () => new Date().toISOString().slice(0, 10);

function PhotoThumb({ photo }: { photo: Photo }) {
  const url = useSignedUrl(photo.path).data;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Shoot photo" className="h-28 w-full rounded-sm object-cover" /></a>
  ) : (
    <div className="h-28 w-full animate-pulse rounded-sm bg-muted" />
  );
}

function PhotoGrid({ items, renderControls, canDelete, onDelete }: {
  items: Photo[]; renderControls: (photo: Photo) => ReactNode; canDelete: (photo: Photo) => boolean; onDelete: (id: string) => void;
}) {
  if (items.length === 0) return <p className="p-4 text-sm text-muted-foreground">No photos here yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
      {items.map((ph) => (
        <div key={ph.id} className="min-w-0 space-y-1">
          <PhotoThumb photo={ph} />
          <div className="text-[11px] text-muted-foreground">{dateLabel(ph.created_at)} · {timeLabel(ph.created_at)}</div>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">{renderControls(ph)}</div>
            {canDelete(ph) && (
              <button onClick={() => onDelete(ph.id)} aria-label="Delete photo" className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PhotosTab({ p, userId, isProducer }: { p: { id: string }; userId: string; isProducer: boolean }) {
  const inv = useInvalidate();
  const groups = (useQuery({
    queryKey: ["site-photo-groups", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_photo_groups").select("*").eq("production_id", p.id).order("group_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Group[];
    },
  }).data) ?? [];
  const photos = (useQuery({
    queryKey: ["site-photos", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_photos").select("*").eq("production_id", p.id).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
  }).data) ?? [];
  const locations = useLocationPoints(p.id).data ?? [];

  const [view, setView] = useState<"collections" | "locations">("collections");
  const [uploadLocation, setUploadLocation] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [busy, setBusy] = useState(false);
  const refresh = () => inv(["site-photos", p.id], ["site-photo-groups", p.id]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const path = await uploadFile(`${p.id}/photos`, file, file.name);
        const { error } = await supabase.from("site_photos").insert({ production_id: p.id, path, location_id: uploadLocation || null });
        if (error) throw error;
      }
      toast.success(files.length > 1 ? "Photos uploaded" : "Photo uploaded");
      refresh();
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  async function createGroup() {
    if (!name.trim()) { toast.error("Name the collection first"); return; }
    const { error } = await supabase.from("site_photo_groups").insert({ production_id: p.id, name: name.trim(), group_date: date || null });
    if (error) { toast.error(friendlyError(error)); return; }
    setName(""); refresh();
  }

  async function updateGroup(id: string, patch: { name?: string; group_date?: string | null }) {
    const { error } = await supabase.from("site_photo_groups").update(patch).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function removeGroup(id: string) {
    if (!(await confirmDialog("Delete this collection? Its photos move to Unsorted.", { destructive: true }))) return;
    const { error } = await supabase.from("site_photo_groups").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function updatePhoto(id: string, patch: { group_id?: string | null; location_id?: string | null }) {
    const { error } = await supabase.from("site_photos").update(patch).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function removePhoto(id: string) {
    const { error } = await supabase.from("site_photos").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  const canDelete = (ph: Photo) => ph.uploaded_by === userId || isProducer;
  const unsorted = photos.filter((ph) => !ph.group_id);
  const unlocated = photos.filter((ph) => !ph.location_id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <select className={`${input} py-2 text-xs`} value={uploadLocation} onChange={(e) => setUploadLocation(e.target.value)} aria-label="Location for new photos">
          <option value="">No location</option>
          {locations.map((l, i) => <option key={l.id} value={l.id}>Location {i + 1} · {l.label}</option>)}
        </select>
        <label className={`${btn} inline-flex cursor-pointer items-center gap-1.5 ${busy ? "opacity-60" : ""}`}>
          <Camera className="h-4 w-4" /> Take photo
          <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
        <label className={`${btn} inline-flex cursor-pointer items-center gap-1.5 ${busy ? "opacity-60" : ""}`}>
          <ImageUp className="h-4 w-4" /> {busy ? "Uploading…" : "Upload photos"}
          <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
        <div className="ml-auto inline-flex rounded-sm border border-border text-xs font-semibold">
          <button onClick={() => setView("collections")} className={`px-3 py-2 ${view === "collections" ? "bg-primary text-primary-foreground" : ""}`}>Collections</button>
          <button onClick={() => setView("locations")} className={`px-3 py-2 ${view === "locations" ? "bg-primary text-primary-foreground" : ""}`}>Locations</button>
        </div>
      </div>

      {view === "collections" ? (
        <>
          <Panel title="New collection">
            <div className="flex flex-wrap gap-2 p-4">
              <input className={`${input} min-w-56 flex-1`} placeholder="Collection name, e.g. Day 1 — Location 2" value={name} onChange={(e) => setName(e.target.value)} />
              <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Collection date" />
              <button onClick={createGroup} className={btn}>Create collection</button>
            </div>
          </Panel>

          {groups.map((g) => {
            const items = photos.filter((ph) => ph.group_id === g.id);
            const canEditGroup = g.created_by === userId || isProducer;
            return (
              <Panel key={g.id} title={`${g.name}${g.group_date ? ` · ${dateLabel(g.group_date)}` : ""} (${items.length})`}
                right={canEditGroup ? <button onClick={() => removeGroup(g.id)} aria-label="Delete collection" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button> : undefined}>
                {canEditGroup && (
                  <div className="flex flex-wrap gap-2 border-b border-border p-4">
                    <input className={`${input} min-w-48 flex-1`} defaultValue={g.name} aria-label="Collection name"
                      onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) updateGroup(g.id, { name: v }); }} />
                    <input type="date" className={input} defaultValue={g.group_date ?? ""} aria-label="Collection date"
                      onChange={(e) => updateGroup(g.id, { group_date: e.target.value || null })} />
                  </div>
                )}
                <PhotoGrid items={items} canDelete={canDelete} onDelete={removePhoto} renderControls={(ph) => (
                  <select className={`${input} w-full py-1 text-xs`} value={ph.group_id ?? ""} aria-label="Move photo to collection"
                    onChange={(e) => updatePhoto(ph.id, { group_id: e.target.value || null })}>
                    <option value="">Unsorted</option>
                    {groups.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )} />
              </Panel>
            );
          })}

          <Panel title={`Unsorted (${unsorted.length})`}>
            <PhotoGrid items={unsorted} canDelete={canDelete} onDelete={removePhoto} renderControls={(ph) => (
              <select className={`${input} w-full py-1 text-xs`} value="" aria-label="Move photo to collection"
                onChange={(e) => updatePhoto(ph.id, { group_id: e.target.value || null })}>
                <option value="">Move to…</option>
                {groups.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )} />
          </Panel>
        </>
      ) : (
        <>
          {locations.length === 0 && <p className="text-sm text-muted-foreground">Add locations on the production overview to group photos by where they were taken.</p>}
          {locations.map((l, i) => {
            const items = photos.filter((ph) => ph.location_id === l.id);
            return (
              <Panel key={l.id} title={`Location ${i + 1} · ${l.label} (${items.length})`}>
                <PhotoGrid items={items} canDelete={canDelete} onDelete={removePhoto} renderControls={(ph) => (
                  <select className={`${input} w-full py-1 text-xs`} value={ph.location_id ?? ""} aria-label="Move photo to location"
                    onChange={(e) => updatePhoto(ph.id, { location_id: e.target.value || null })}>
                    <option value="">No location</option>
                    {locations.map((o, j) => <option key={o.id} value={o.id}>Location {j + 1} · {o.label}</option>)}
                  </select>
                )} />
              </Panel>
            );
          })}
          <Panel title={`No location (${unlocated.length})`}>
            <PhotoGrid items={unlocated} canDelete={canDelete} onDelete={removePhoto} renderControls={(ph) => (
              <select className={`${input} w-full py-1 text-xs`} value="" aria-label="Move photo to location"
                onChange={(e) => updatePhoto(ph.id, { location_id: e.target.value || null })}>
                <option value="">Move to…</option>
                {locations.map((o, j) => <option key={o.id} value={o.id}>Location {j + 1} · {o.label}</option>)}
              </select>
            )} />
          </Panel>
        </>
      )}
    </div>
  );
}
