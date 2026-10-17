import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, useSignedUrl } from "@/lib/site";

// A square, rounded picture for the production, shown before its name. Producers can change or remove it.
export function ProductionCover({ p, isProducer }: { p: { id: string; name: string; imagePath?: string | null }; isProducer: boolean }) {
  const qc = useQueryClient();
  const url = useSignedUrl(p.imagePath ?? null).data;
  const [busy, setBusy] = useState(false);
  const initials = p.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "P";

  async function change(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadFile(`${p.id}/cover`, file, file.name);
      const { error } = await supabase.from("productions").update({ image_path: path }).eq("id", p.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["productions"] });
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  async function remove() {
    if (!window.confirm("Remove this picture?")) return;
    const { error } = await supabase.from("productions").update({ image_path: null }).eq("id", p.id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["productions"] });
  }

  return (
    <span className="relative mb-3 inline-flex shrink-0 align-middle">
      <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-border bg-muted md:h-20 md:w-20">
        {url
          ? <img src={url} alt={p.name} className="h-full w-full object-cover" />
          : <span className="font-display text-lg font-bold text-primary">{initials}</span>}
      </span>
      {isProducer && (
        <label className={`absolute -bottom-1.5 -right-1.5 grid h-7 w-7 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow ${busy ? "opacity-60" : ""}`} aria-label="Edit picture">
          <Pencil className="h-3.5 w-3.5" />
          <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { change(e.target.files); e.target.value = ""; }} />
        </label>
      )}
    </span>
  );
}
