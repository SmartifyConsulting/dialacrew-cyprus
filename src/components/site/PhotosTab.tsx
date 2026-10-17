import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Camera, ImageUp, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/AppShell";
import { uploadFile, useInvalidate, useSignedUrl } from "@/lib/site";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Group = { id: string; name: string; group_date: string | null; created_by: string; created_at: string };
type Photo = { id: string; path: string; group_id: string | null; uploaded_by: string; created_at: string };

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
const todayYmd = () => new Date().toISOString().slice(0, 10);

function PhotoThumb({ photo, alt }: { photo: Photo; alt: string }) {
  const url = useSignedUrl(photo.path).data;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={alt} className="h-28 w-full rounded-sm object-cover" /></a>
  ) : (
    <div className="h-28 w-full animate-pulse rounded-sm bg-muted" />
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
        const { error } = await supabase.from("site_photos").insert({ production_id: p.id, path });
        if (error) throw error;
      }
      toast.success(files.length > 1 ? "Photos uploaded" : "Photo uploaded");
      refresh();
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  async function createGroup() {
    if (!name.trim()) { toast.error("Name the portfolio first"); return; }
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
    if (!window.confirm("Delete this portfolio? Its photos move to Unsorted.")) return;
    const { error } = await supabase.from("site_photo_groups").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function movePhoto(id: string, groupId: string | null) {
    const { error } = await supabase.from("site_photos").update({ group_id: groupId }).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function removePhoto(id: string) {
    const { error } = await supabase.from("site_photos").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  const unsorted = photos.filter((ph) => !ph.group_id);
  const canDelete = (ph: Photo) => ph.uploaded_by === userId || isProducer;

  function Grid({ items, groupId }: { items: Photo[]; groupId: string | null }) {
    if (items.length === 0) return <p className="p-4 text-sm text-muted-foreground">No photos here yet.</p>;
    return (
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
        {items.map((ph) => (
          <div key={ph.id} className="min-w-0 space-y-1">
            <PhotoThumb photo={ph} alt="Shoot photo" />
            <div className="text-[11px] text-muted-foreground">{dateLabel(ph.created_at)} · {timeLabel(ph.created_at)}</div>
            <div className="flex items-center gap-1">
              <select className={`${input} min-w-0 flex-1 py-1 text-xs`} value={groupId ?? ""} aria-label="Move photo to portfolio"
                onChange={(e) => movePhoto(ph.id, e.target.value || null)}>
                <option value="">Unsorted</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {canDelete(ph) && (
                <button onClick={() => removePhoto(ph.id)} aria-label="Delete photo" className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${btn} inline-flex cursor-pointer items-center gap-1.5 ${busy ? "opacity-60" : ""}`}>
          <Camera className="h-4 w-4" /> Take photo
          <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
        <label className={`${btn} inline-flex cursor-pointer items-center gap-1.5 ${busy ? "opacity-60" : ""}`}>
          <ImageUp className="h-4 w-4" /> {busy ? "Uploading…" : "Upload photos"}
          <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      <Panel title="New portfolio">
        <div className="flex flex-wrap gap-2 p-4">
          <input className={`${input} min-w-56 flex-1`} placeholder="Portfolio name, e.g. Day 1 — Location 2" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Portfolio date" />
          <button onClick={createGroup} className={btn}>Create portfolio</button>
        </div>
      </Panel>

      {groups.map((g) => {
        const items = photos.filter((ph) => ph.group_id === g.id);
        const canEditGroup = g.created_by === userId || isProducer;
        return (
          <Panel key={g.id} title={`${g.name}${g.group_date ? ` · ${dateLabel(g.group_date)}` : ""} (${items.length})`}
            right={canEditGroup ? <button onClick={() => removeGroup(g.id)} aria-label="Delete portfolio" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button> : undefined}>
            {canEditGroup && (
              <div className="flex flex-wrap gap-2 border-b border-border p-4">
                <input className={`${input} min-w-48 flex-1`} defaultValue={g.name} aria-label="Portfolio name"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) updateGroup(g.id, { name: v }); }} />
                <input type="date" className={input} defaultValue={g.group_date ?? ""} aria-label="Portfolio date"
                  onChange={(e) => updateGroup(g.id, { group_date: e.target.value || null })} />
              </div>
            )}
            <Grid items={items} groupId={g.id} />
          </Panel>
        );
      })}

      <Panel title={`Unsorted (${unsorted.length})`}>
        <Grid items={unsorted} groupId={null} />
      </Panel>
    </div>
  );
}
