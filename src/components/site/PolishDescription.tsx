import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { friendlyError } from "@/lib/errors";
import { polishDescription } from "@/lib/description.functions";

export function PolishDescription({ text, name, type, client, onPolished }: {
  text: string; name: string; type: string; client: string; onPolished: (polished: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const polish = useServerFn(polishDescription);

  async function run() {
    if (!text.trim()) { toast.error("Write a description first"); return; }
    setBusy(true);
    try {
      const r = await polish({ data: { text, name, type, client } });
      onPolished(r.polished);
      toast.success("Description polished. Check it before you save.");
    } catch (e) { toast.error(friendlyError(e)); }
    setBusy(false);
  }

  return (
    <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
      <Sparkles className="h-3.5 w-3.5" /> {busy ? "Polishing…" : "Polish with AI"}
    </button>
  );
}
