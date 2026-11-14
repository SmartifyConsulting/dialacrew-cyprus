import { SearchableSelect } from "@/components/ui/searchable-select";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Camera, ChevronLeft, Folder, ImageUp, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, useInvalidate, useLocationPoints, useSignedUrl } from "@/lib/site";
import { confirmDialog } from "@/components/ConfirmDialog";
import { CalendarDatePicker } from "@/components/site/SiteTabs";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Group = { id: string; name: string; group_date: string | null; created_by: string; created_at: string };
type Photo = { id: string; path: string; group_id: string | null; location_id: string | null; uploaded_by: string; created_at: string };

// Every production starts with these three albums so photos have somewhere sensible to land
// before a producer organises them further.
const DEFAULT_ALBUMS = ["Locations", "Mood Board", "Previs"] as const;

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
  const { t } = useTranslation();
  if (items.length === 0) return <p className="p-4 text-sm text-muted-foreground">{t("photos.empty")}</p>;
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

// One folder tile in the Explorer-style grid: a yellow folder icon, its name, and how many photos
// it holds. Clicking it drills into that folder's photos.
function FolderTile({ name, count, onOpen, muted }: { name: string; count: number; onOpen: () => void; muted?: boolean }) {
  return (
    <button type="button" onClick={onOpen} className="flex flex-col items-center gap-1 rounded-sm p-3 text-center hover:bg-muted">
      <Folder className={`h-14 w-14 ${muted ? "fill-muted text-muted-foreground/70" : "fill-amber-400 text-amber-600"}`} />
      <span className="line-clamp-2 w-full text-xs font-semibold text-foreground">{name}</span>
      <span className="text-[11px] text-muted-foreground">{count}</span>
    </button>
  );
}

export function PhotosTab({ p, userId, isProducer }: { p: { id: string }; userId: string; isProducer: boolean }) {
  const { t } = useTranslation();
  const inv = useInvalidate();
  const groupsQuery = useQuery({
    queryKey: ["site-photo-groups", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_photo_groups").select("*").eq("production_id", p.id).order("group_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Group[];
    },
  });
  const groups = groupsQuery.data ?? [];
  const photos = (useQuery({
    queryKey: ["site-photos", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_photos").select("*").eq("production_id", p.id).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Photo[];
    },
  }).data) ?? [];
  const locations = useLocationPoints(p.id).data ?? [];

  const [view, setView] = useState<"albums" | "locations">("albums");
  const [openAlbum, setOpenAlbum] = useState<string | "unsorted" | null>(null);
  const [openLocation, setOpenLocation] = useState<string | "unlocated" | null>(null);
  const [uploadLocation, setUploadLocation] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayYmd());
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const refresh = () => inv(["site-photos", p.id], ["site-photo-groups", p.id]);

  // Create the three default albums the first time this production's Photos tab is opened
  // (once groups have loaded and there genuinely are none yet) so photos always have somewhere to go.
  useEffect(() => {
    if (!isProducer || groupsQuery.isLoading || groups.length > 0) return;
    (async () => {
      const { error } = await supabase.from("site_photo_groups").insert(DEFAULT_ALBUMS.map((n) => ({ production_id: p.id, name: n })));
      if (!error) refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProducer, groupsQuery.isLoading, groups.length, p.id]);

  async function locationsAlbumId(): Promise<string | null> {
    const existing = groups.find((g) => g.name === "Locations");
    if (existing) return existing.id;
    const { data, error } = await supabase.from("site_photo_groups").insert({ production_id: p.id, name: "Locations" }).select("id").single();
    if (error) return null;
    return data.id;
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      // A photo taken at a location also files itself into the Locations album automatically.
      const groupId = uploadLocation ? await locationsAlbumId() : null;
      for (const file of Array.from(files)) {
        const path = await uploadFile(`${p.id}/photos`, file, file.name);
        const { error } = await supabase.from("site_photos").insert({ production_id: p.id, path, location_id: uploadLocation || null, group_id: groupId });
        if (error) throw error;
      }
      toast.success(files.length > 1 ? "Photos uploaded" : "Photo uploaded");
      refresh();
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  async function createGroup() {
    if (!name.trim()) { toast.error("Name the album first"); return; }
    const { error } = await supabase.from("site_photo_groups").insert({ production_id: p.id, name: name.trim(), group_date: date || null });
    if (error) { toast.error(friendlyError(error)); return; }
    setName(""); setAdding(false); refresh();
  }

  async function updateGroup(id: string, patch: { name?: string; group_date?: string | null }) {
    const { error } = await supabase.from("site_photo_groups").update(patch).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function removeGroup(id: string) {
    if (!(await confirmDialog("Delete this album? Its photos move to Unsorted.", { destructive: true }))) return;
    const { error } = await supabase.from("site_photo_groups").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    setOpenAlbum(null);
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

  const openGroup = openAlbum && openAlbum !== "unsorted" ? groups.find((g) => g.id === openAlbum) : null;
  const openGroupItems = openAlbum === "unsorted" ? unsorted : openAlbum ? photos.filter((ph) => ph.group_id === openAlbum) : [];
  const canEditOpenGroup = !!openGroup && (openGroup.created_by === userId || isProducer);

  const openLoc = openLocation && openLocation !== "unlocated" ? locations.find((l) => l.id === openLocation) : null;
  const openLocIndex = openLoc ? locations.findIndex((l) => l.id === openLoc.id) : -1;
  const openLocItems = openLocation === "unlocated" ? unlocated : openLocation ? photos.filter((ph) => ph.location_id === openLocation) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <SearchableSelect className={`${input} py-2 text-xs`} value={uploadLocation} onChange={(e) => setUploadLocation(e.target.value)} aria-label="Location for new photos">
          <option value="">{t("photos.noLocation")}</option>
          {locations.map((l, i) => <option key={l.id} value={l.id}>Location {i + 1} · {l.label}</option>)}
        </SearchableSelect>
        <label className={`${btn} inline-flex cursor-pointer items-center gap-1.5 ${busy ? "opacity-60" : ""}`}>
          <Camera className="h-4 w-4" /> {t("photos.take")}
          <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
        <label className={`${btn} inline-flex cursor-pointer items-center gap-1.5 ${busy ? "opacity-60" : ""}`}>
          <ImageUp className="h-4 w-4" /> {busy ? t("files.uploading") : t("photos.upload")}
          <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
        </label>
        <div className="ml-auto inline-flex rounded-sm border border-border text-xs font-semibold">
          <button onClick={() => { setView("albums"); setOpenLocation(null); }} className={`px-3 py-2 ${view === "albums" ? "bg-primary text-primary-foreground" : ""}`}>{t("photos.collections")}</button>
          <button onClick={() => { setView("locations"); setOpenAlbum(null); }} className={`px-3 py-2 ${view === "locations" ? "bg-primary text-primary-foreground" : ""}`}>{t("overview.locations")}</button>
        </div>
      </div>

      {view === "albums" ? (
        openAlbum ? (
          <div className="rounded-sm border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <button onClick={() => setOpenAlbum(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary">
                <ChevronLeft className="h-4 w-4" /> {t("photos.collections")}
              </button>
              <h3 className="min-w-0 flex-1 truncate text-center font-display text-sm font-semibold">
                {openGroup ? `${openGroup.name}${openGroup.group_date ? ` · ${dateLabel(openGroup.group_date)}` : ""}` : t("photos.unsorted", { count: openGroupItems.length })} ({openGroupItems.length})
              </h3>
              {openGroup && canEditOpenGroup ? (
                <button onClick={() => removeGroup(openGroup.id)} aria-label="Delete album" className="shrink-0 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              ) : <span className="w-16" />}
            </div>
            {openGroup && canEditOpenGroup && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                <input className={`${input} min-w-48 flex-1`} defaultValue={openGroup.name} aria-label="Album name"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== openGroup.name) updateGroup(openGroup.id, { name: v }); }} />
                <CalendarDatePicker label="Album date" value={openGroup.group_date ?? ""} onChange={(v) => updateGroup(openGroup.id, { group_date: v || null })} />
              </div>
            )}
            <PhotoGrid items={openGroupItems} canDelete={canDelete} onDelete={removePhoto} renderControls={(ph) => (
              <SearchableSelect className={`${input} w-full py-1 text-xs`} value={ph.group_id ?? ""} aria-label="Move photo to album"
                onChange={(e) => updatePhoto(ph.id, { group_id: e.target.value || null })}>
                <option value="">Unsorted</option>
                {groups.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </SearchableSelect>
            )} />
          </div>
        ) : (
          <div className="rounded-sm border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
              <h3 className="font-display text-sm font-semibold">{t("photos.collections")}</h3>
              {isProducer && (adding ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input autoFocus className={`${input} min-w-48`} placeholder={t("photos.name")} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createGroup()} />
                  <CalendarDatePicker label="New album date" value={date} onChange={setDate} />
                  <button onClick={createGroup} className={btn}>{t("photos.create")}</button>
                  <button onClick={() => setAdding(false)} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} className={btn}>+ {t("photos.new")}</button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 md:grid-cols-6">
              {groups.map((g) => (
                <FolderTile key={g.id} name={g.name} count={photos.filter((ph) => ph.group_id === g.id).length} onOpen={() => setOpenAlbum(g.id)} />
              ))}
              <FolderTile name={t("photos.unsorted", { count: unsorted.length })} count={unsorted.length} muted onOpen={() => setOpenAlbum("unsorted")} />
            </div>
          </div>
        )
      ) : openLocation ? (
        <div className="rounded-sm border border-border bg-card">
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <button onClick={() => setOpenLocation(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary">
              <ChevronLeft className="h-4 w-4" /> {t("overview.locations")}
            </button>
            <h3 className="min-w-0 flex-1 truncate text-center font-display text-sm font-semibold">
              {openLoc ? `Location ${openLocIndex + 1} · ${openLoc.label}` : `No location`} ({openLocItems.length})
            </h3>
            <span className="w-16" />
          </div>
          <PhotoGrid items={openLocItems} canDelete={canDelete} onDelete={removePhoto} renderControls={(ph) => (
            <SearchableSelect className={`${input} w-full py-1 text-xs`} value={ph.location_id ?? ""} aria-label="Move photo to location"
              onChange={(e) => updatePhoto(ph.id, { location_id: e.target.value || null })}>
              <option value="">No location</option>
              {locations.map((o, j) => <option key={o.id} value={o.id}>Location {j + 1} · {o.label}</option>)}
            </SearchableSelect>
          )} />
        </div>
      ) : (
        <div className="rounded-sm border border-border bg-card">
          <div className="border-b border-border p-3"><h3 className="font-display text-sm font-semibold">{t("overview.locations")}</h3></div>
          {locations.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Add locations on the production overview to group photos by where they were taken.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 p-3 sm:grid-cols-4 md:grid-cols-6">
              {locations.map((l, i) => (
                <FolderTile key={l.id} name={`Location ${i + 1} · ${l.label}`} count={photos.filter((ph) => ph.location_id === l.id).length} onOpen={() => setOpenLocation(l.id)} />
              ))}
              <FolderTile name="No location" count={unlocated.length} muted onOpen={() => setOpenLocation("unlocated")} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
