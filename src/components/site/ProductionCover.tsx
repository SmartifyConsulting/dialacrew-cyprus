import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, useSignedUrl } from "@/lib/site";
import { ImageCropDialog } from "@/components/site/ImageCropDialog";

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "P";

// A rounded-square picture of the production (or its initials when it has none), shown before the production's name.
export function ProductionAvatar({ name, imagePath, className = "h-12 w-12 text-sm" }: { name: string; imagePath?: string | null | undefined; className?: string }) {
  const url = useSignedUrl(imagePath ?? null).data;
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-border bg-muted ${className}`}>
      {url
        ? <img src={url} alt="" className="h-full w-full object-cover" />
        : <span className="font-display font-bold text-primary">{initialsOf(name)}</span>}
    </span>
  );
}

// The production site's header picture. Producers change it with the pencil, then crop and position it before it is saved.
export function ProductionCover({ p, isProducer }: { p: { id: string; name: string; imagePath?: string | null }; isProducer: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [cropSource, setCropSource] = useState<File | null>(null);

  async function save(file: File) {
    setBusy(true);
    try {
      const path = await uploadFile(`${p.id}/cover`, file, file.name);
      const { error } = await supabase.from("productions").update({ image_path: path }).eq("id", p.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["productions"] });
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <span className="relative mb-3 inline-flex shrink-0 align-middle">
      <ProductionAvatar name={p.name} imagePath={p.imagePath} className="h-16 w-16 text-lg md:h-20 md:w-20 md:text-xl" />
      {isProducer && (
        <>
          <label className={`absolute -bottom-1.5 -right-1.5 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow ${busy ? "opacity-60" : ""}`} aria-label="Edit picture">
            <Pencil className="h-3.5 w-3.5" />
            <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { setCropSource(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          </label>
          <ImageCropDialog file={cropSource} onCancel={() => setCropSource(null)} onDone={(f) => { setCropSource(null); save(f); }} />
        </>
      )}
    </span>
  );
}
