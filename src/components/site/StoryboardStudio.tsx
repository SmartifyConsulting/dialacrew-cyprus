import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Film, Pencil as PencilIcon, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { useSignedUrl } from "@/lib/site";
import { Panel } from "@/components/AppShell";
import { breakdownScript, generateShotImage } from "@/lib/storyboard.functions";
import { SoundDesignStudio } from "@/components/site/SoundDesignStudio";
import type { Production } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Shot = {
  id: string; production_id: string; scene_number: number; shot_number: number; description: string;
  duration_seconds: number; image_path: string | null; status: "draft" | "generating" | "generated" | "approved" | "failed";
  generation_error: string | null; sort_order: number; created_by: string;
};

const MODES = ["Illustrate", "Sound Design", "Animatic"] as const;
type Mode = (typeof MODES)[number];

export function StoryboardStudio({ p, isProducer }: { p: Production; isProducer: boolean }) {
  const [mode, setMode] = useState<Mode>("Illustrate");
  return (
    <div className="space-y-4">
      <nav role="tablist" aria-label="Storyboard Studio mode" className="inline-flex rounded-sm border border-border text-xs font-semibold">
        {MODES.map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`px-3 py-2 first:rounded-l-sm last:rounded-r-sm ${m !== "Illustrate" ? "border-l border-border" : ""} ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {m}
          </button>
        ))}
      </nav>
      {mode === "Illustrate" && <IllustrateMode p={p} isProducer={isProducer} />}
      {mode === "Sound Design" && <SoundDesignStudio p={p} isProducer={isProducer} />}
      {mode === "Animatic" && <ComingSoon icon={<Film className="h-5 w-5" />} title="Animatic" stage="Stage 3" note="Synchronized playback of the illustrations and audio, with MP4 export." />}
    </div>
  );
}

function ComingSoon({ icon, title, stage, note }: { icon: ReactNode; title: string; stage: string; note: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-sm border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {icon}
      <p className="font-semibold text-foreground">{title} — {stage}</p>
      <p className="max-w-sm">{note}</p>
    </div>
  );
}

function ShotImage({ path }: { path: string | null }) {
  const url = useSignedUrl(path ?? undefined).data;
  if (!path) return <div className="grid aspect-square w-full place-items-center rounded-sm bg-muted text-xs text-muted-foreground">No illustration yet</div>;
  return url ? (
    <img src={url} alt="Storyboard panel" className="aspect-square w-full rounded-sm border border-border object-cover" />
  ) : (
    <div className="aspect-square w-full animate-pulse rounded-sm bg-muted" />
  );
}

function IllustrateMode({ p, isProducer }: { p: Production; isProducer: boolean }) {
  const qc = useQueryClient();
  const shots = useQuery({
    queryKey: ["storyboard-shots", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("storyboard_shots").select("*").eq("production_id", p.id).order("sort_order");
      if (error) throw error;
      return (data ?? []) as Shot[];
    },
  }).data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["storyboard-shots", p.id] });

  const breakdown = useServerFn(breakdownScript);
  const generateImage = useServerFn(generateShotImage);
  const [brief, setBrief] = useState("");
  const [breakingDown, setBreakingDown] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  async function runBreakdown() {
    if (!brief.trim()) { toast.error("Describe the scene or script first"); return; }
    setBreakingDown(true);
    try {
      const { shots: newShots } = await breakdown({ data: { productionId: p.id, brief } });
      const startOrder = shots.length;
      const rows = newShots.map((s, i) => ({
        production_id: p.id, scene_number: s.scene_number, shot_number: s.shot_number,
        description: s.description, duration_seconds: s.duration_seconds, sort_order: startOrder + i,
      }));
      const { error } = await supabase.from("storyboard_shots").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} shot${rows.length === 1 ? "" : "s"} added`);
      setBrief("");
      refresh();
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setBreakingDown(false); }
  }

  async function addBlankShot() {
    const { error } = await supabase.from("storyboard_shots").insert({
      production_id: p.id, scene_number: shots.at(-1)?.scene_number ?? 1, shot_number: (shots.at(-1)?.shot_number ?? 0) + 1,
      description: "", duration_seconds: 3, sort_order: shots.length,
    });
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function updateShot(id: string, patch: Partial<Pick<Shot, "description" | "duration_seconds" | "status">>) {
    const { error } = await supabase.from("storyboard_shots").update(patch).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function deleteShot(id: string) {
    const { error } = await supabase.from("storyboard_shots").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    const order = shots.map((s) => s.id);
    const from = order.indexOf(fromId);
    const to = order.indexOf(toId);
    if (from === -1 || to === -1) return;
    order.splice(to, 0, order.splice(from, 1)[0]!);
    const results = await Promise.all(order.map((id, i) => supabase.from("storyboard_shots").update({ sort_order: i }).eq("id", id)));
    const error = results.find((r) => r.error)?.error;
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function generate(shot: Shot) {
    if (!shot.description.trim()) { toast.error("Write a description for this shot first"); return; }
    setGeneratingId(shot.id);
    refresh();
    try {
      await generateImage({ data: { productionId: p.id, shotId: shot.id, description: shot.description } });
      toast.success("Illustration generated");
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setGeneratingId(null); refresh(); }
  }

  if (!isProducer) return <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">Storyboard Studio is managed by the production's producer.</p>;

  return (
    <div className="space-y-4">
      <Panel title="AI shot breakdown">
        <div className="space-y-2 p-4">
          <textarea rows={3} className={`${input} w-full`} placeholder="Paste the creative brief or script excerpt to break down into shots…" value={brief} onChange={(e) => setBrief(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={runBreakdown} disabled={breakingDown} className={btn}><Sparkles className="h-3.5 w-3.5" /> {breakingDown ? "Breaking down…" : "Break down into shots"}</button>
            <button onClick={addBlankShot} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold hover:border-primary hover:text-primary">+ Add shot manually</button>
          </div>
        </div>
      </Panel>

      {shots.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No shots yet — break down a brief above, or add one manually.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shots.map((shot) => (
            <div key={shot.id} draggable onDragStart={() => setDragId(shot.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(shot.id); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, shot.id); setDragId(null); setDragOverId(null); }}
              onDragEnd={() => { setDragId(null); setDragOverId(null); }}
              className={`cursor-grab space-y-2 rounded-sm border border-border bg-card p-3 ${dragOverId === shot.id && dragId && dragId !== shot.id ? "bg-muted" : ""} ${shot.status === "approved" ? "ring-2 ring-success" : ""}`}>
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Scene {shot.scene_number} · Shot {shot.shot_number}</span>
                <button onClick={() => deleteShot(shot.id)} aria-label="Delete shot" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <ShotImage path={shot.image_path} />
              {shot.status === "failed" && shot.generation_error && <p className="text-xs text-destructive">{shot.generation_error}</p>}
              <textarea rows={2} className={`${input} w-full text-xs`} defaultValue={shot.description}
                onBlur={(e) => { const v = e.target.value; if (v !== shot.description) updateShot(shot.id, { description: v }); }} />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="number" min={1} className={`${input} w-14 px-1.5 py-1`} defaultValue={shot.duration_seconds}
                    onBlur={(e) => { const v = Number(e.target.value); if (v && v !== shot.duration_seconds) updateShot(shot.id, { duration_seconds: v }); }} /> sec
                </label>
                <button onClick={() => generate(shot)} disabled={generatingId === shot.id || shot.status === "generating"}
                  className="ml-auto inline-flex items-center gap-1 rounded-sm border border-primary px-2 py-1 text-[11px] font-semibold text-primary disabled:opacity-50">
                  {shot.status === "generating" || generatingId === shot.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <PencilIcon className="h-3 w-3" />}
                  {shot.image_path ? "Regenerate" : "Generate"}
                </button>
              </div>
              {shot.status !== "approved" ? (
                <button onClick={() => updateShot(shot.id, { status: "approved" })} disabled={!shot.image_path} className="w-full rounded-sm border border-success px-2 py-1 text-[11px] font-semibold text-success disabled:opacity-50">Approve</button>
              ) : (
                <button onClick={() => updateShot(shot.id, { status: "generated" })} className="w-full rounded-sm border border-border px-2 py-1 text-[11px] font-semibold text-muted-foreground">Approved — unapprove</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
