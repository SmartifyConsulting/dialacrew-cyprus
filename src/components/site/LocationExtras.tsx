import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Camera, ChevronLeft, ChevronRight, ImageUp, Trash2 } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { uploadFile, useInvalidate, useSignedUrl } from "@/lib/site";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const pick = "inline-flex cursor-pointer items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs font-semibold hover:border-primary hover:text-primary";

// What it costs to shoot at this location. Producers only: the fees live in their own table, so crew never receive them.
export function LocationFee({ p, locationId }: { p: { id: string; currency?: string | undefined }; locationId: string }) {
  const inv = useInvalidate();
  const fees = useQuery({
    queryKey: ["location-fees", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_location_fees").select("location_id, fee").eq("production_id", p.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const saved = fees.data?.find((f) => f.location_id === locationId)?.fee;
  const savedText = saved != null ? String(saved) : "";
  const [value, setValue] = useState(savedText);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValue(savedText); }, [savedText]);

  async function save() {
    const fee = value.trim() === "" ? 0 : Number(value);
    if (!Number.isFinite(fee) || fee < 0) { toast.error("Enter a fee of 0 or more"); return; }
    setBusy(true);
    const { error } = await supabase.from("production_location_fees")
      .upsert({ location_id: locationId, production_id: p.id, fee, updated_at: new Date().toISOString() }, { onConflict: "location_id" });
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Location fee saved");
    inv(["location-fees", p.id]);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
      <label className="block min-w-0 flex-1">
        <span className="text-xs text-muted-foreground">Location fee ({p.currency ?? "ZAR"}) · only producers see this</span>
        <input type="number" min={0} step="any" inputMode="decimal" className={`${input} mt-1 w-full`} placeholder="0" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button onClick={save} disabled={busy || value === savedText} className={btn}>{busy ? "Saving…" : "Save fee"}</button>
    </div>
  );
}

type LocationPhoto = { id: string; location_id: string; path: string; sort_order: number; uploaded_by: string };

function Thumb({ path }: { path: string }) {
  const url = useSignedUrl(path).data;
  return url
    ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Location" className="h-20 w-full rounded-sm object-cover" /></a>
    : <div className="h-20 w-full animate-pulse rounded-sm bg-muted" />;
}

// Photos of a location (the spot, access, parking). Everyone on the production can see and add them.
export function LocationPhotos({ p, locationId, isProducer }: { p: { id: string }; locationId: string; isProducer: boolean }) {
  const inv = useInvalidate();
  const { session } = useSession();
  const userId = session?.user.id ?? "";
  const all = (useQuery({
    queryKey: ["location-photos", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("production_location_photos").select("*").eq("production_id", p.id)
        .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LocationPhoto[];
    },
  }).data) ?? [];
  const items = all.filter((x) => x.location_id === locationId);
  const [busy, setBusy] = useState(false);
  const refresh = () => inv(["location-photos", p.id]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      let next = items.length ? Math.max(...items.map((x) => x.sort_order)) + 1 : 0;
      for (const file of Array.from(files)) {
        const path = await uploadFile(`${p.id}/locations`, file, file.name);
        const { error } = await supabase.from("production_location_photos").insert({ production_id: p.id, location_id: locationId, path, sort_order: next++ });
        if (error) throw error;
      }
      toast.success(files.length > 1 ? "Photos added" : "Photo added");
      refresh();
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  async function move(i: number, dir: -1 | 1) {
    const order = items.map((x) => x.id);
    const a = order[i];
    const b = order[i + dir];
    if (!a || !b) return;
    order[i] = b;
    order[i + dir] = a;
    const results = await Promise.all(order.map((id, idx) => supabase.from("production_location_photos").update({ sort_order: idx }).eq("id", id)));
    const error = results.find((r) => r.error)?.error;
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("production_location_photos").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  return (
    <div className="space-y-2 border-t border-border pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Location photos ({items.length})</span>
        <div className={`flex items-center gap-2 ${busy ? "opacity-60" : ""}`}>
          <label className={pick}>
            <Camera className="h-3.5 w-3.5" /> Take photo
            <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
          <label className={pick}>
            <ImageUp className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Upload"}
            <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((ph, i) => (
            <div key={ph.id} className="min-w-0 space-y-1">
              <Thumb path={ph.path} />
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center">
                  <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move photo earlier" className="hover:text-primary disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                  <button disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move photo later" className="hover:text-primary disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                </span>
                {(ph.uploaded_by === userId || isProducer) && (
                  <button onClick={() => remove(ph.id)} aria-label="Delete photo" className="hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
