import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Anchor, Pencil as PencilIcon, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { useSignedUrl } from "@/lib/site";
import { Panel } from "@/components/AppShell";
import { breakdownScript, enhanceStoryboardReferences, generateShotImage, saveStoryboardCharacters } from "@/lib/storyboard.functions";
import { SoundDesignStudio } from "@/components/site/SoundDesignStudio";
import { AnimaticStudio } from "@/components/site/AnimaticStudio";
import type { Production } from "@/lib/demo-data";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Shot = {
  id: string; production_id: string; scene_number: number; shot_number: number; description: string;
  duration_seconds: number; image_path: string | null; status: "draft" | "generating" | "generated" | "approved" | "failed";
  generation_error: string | null; sort_order: number; created_by: string; is_anchor?: boolean;
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
      {mode === "Animatic" && <AnimaticStudio p={p} isProducer={isProducer} />}
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
  const saveChars = useServerFn(saveStoryboardCharacters);
  const chars = useQuery({
    queryKey: ["storyboard-characters", p.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("productions").select("storyboard_characters").eq("id", p.id).maybeSingle();
      if (error) throw error;
      return data?.storyboard_characters ?? "";
    },
  });
  async function storeChars(v: string) {
    if (v === (chars.data ?? "")) return;
    try { await saveChars({ data: { productionId: p.id, characters: v } }); toast.success("References saved"); qc.invalidateQueries({ queryKey: ["storyboard-characters", p.id] }); }
    catch (e) { toast.error(friendlyError(e)); }
  }
  const enhance = useServerFn(enhanceStoryboardReferences);
  const [enhancing, setEnhancing] = useState(false);
  async function enhanceRefs() {
    setEnhancing(true);
    try { await enhance({ data: { productionId: p.id, references: chars.data ?? "", brief } }); toast.success("References enhanced"); qc.invalidateQueries({ queryKey: ["storyboard-characters", p.id] }); }
    catch (e) { toast.error(friendlyError(e)); }
    finally { setEnhancing(false); }
  }
  type Choice = { label: string; value: string; tone?: "primary" | "destructive" | "outline" };
  const [ask, setAsk] = useState<{ title: string; body: string; choices: Choice[]; resolve: (v: string) => void } | null>(null);
  const askUser = (title: string, body: string, choices: Choice[]) => new Promise<string>((resolve) => setAsk({ title, body, choices, resolve }));
  const answer = (v: string) => { ask?.resolve(v); setAsk(null); };
  const [brief, setBrief] = useState("");
  const [breakingDown, setBreakingDown] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  async function runBreakdown() {
    if (!brief.trim()) { toast.error("Describe the scene or script first"); return; }
    let replace = false;
    if (shots.length > 0) {
      const n = shots.length;
      const c = await askUser("You already have shots", `There ${n === 1 ? "is 1 shot" : `are ${n} shots`} on this storyboard. Replace them with the new breakdown, or add the new shots after them?`,
        [{ label: "Cancel", value: "cancel", tone: "outline" }, { label: "Add after", value: "append", tone: "outline" }, { label: "Replace all", value: "replace", tone: "destructive" }]);
      if (c === "cancel") return;
      replace = c === "replace";
    }
    setBreakingDown(true);
    try {
      if (replace) {
        const { error: delErr } = await supabase.from("storyboard_shots").delete().eq("production_id", p.id);
        if (delErr) throw delErr;
      }
      const { shots: newShots, improvedBrief } = await breakdown({ data: { productionId: p.id, brief } });
      setBrief(improvedBrief);
      qc.invalidateQueries({ queryKey: ["storyboard-characters", p.id] });
      const startOrder = replace ? 0 : shots.length;
      const rows = newShots.map((s, i) => ({
        production_id: p.id, scene_number: s.scene_number, shot_number: s.shot_number,
        description: s.description, duration_seconds: s.duration_seconds, sort_order: startOrder + i,
      }));
      const { error } = await supabase.from("storyboard_shots").insert(rows);
      if (error) throw error;
      toast.success(`${rows.length} shot${rows.length === 1 ? "" : "s"} added`);
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

  async function updateShot(id: string, patch: Partial<Pick<Shot, "description" | "duration_seconds" | "status" | "is_anchor">>) {
    const { error } = await supabase.from("storyboard_shots").update(patch).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function deleteAllShots() {
    const c = await askUser("Delete all shots?", `This removes all ${shots.length} shots and their pictures. It cannot be undone.`,
      [{ label: "Cancel", value: "cancel", tone: "outline" }, { label: "Delete all", value: "ok", tone: "destructive" }]);
    if (c !== "ok") return;
    const { error } = await supabase.from("storyboard_shots").delete().eq("production_id", p.id);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("All shots deleted");
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

  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  async function generateAll() {
    const todo = shots.filter((s) => s.description.trim() && !s.image_path && s.status !== "generating");
    if (!todo.length) { toast.info("Every shot already has an illustration"); return; }
    setBulk({ done: 0, total: todo.length });
    let failed = 0;
    // One at a time, in story order, so each panel can follow the one before it.
    for (const [i, shot] of todo.entries()) {
      setGeneratingId(shot.id);
      try { await generateImage({ data: { productionId: p.id, shotId: shot.id, description: shot.description } }); }
      catch { failed++; }
      setBulk({ done: i + 1, total: todo.length });
      refresh();
    }
    setGeneratingId(null); setBulk(null); refresh();
    failed ? toast.error(`${failed} of ${todo.length} illustrations failed — retry them individually`) : toast.success(`${todo.length} illustrations generated`);
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

      <Panel title="References">
        <div className="space-y-2 p-4">
          <div className="flex items-start gap-3">
            <p className="flex-1 text-xs text-muted-foreground">Anything that must look the same in every shot — people, props, objects, vehicles, animals, places — gets a #REF number. Shots that mention #REF1, #REF2… always draw it the same way. One per line, e.g. "#REF1 (Father): …".</p>
            <button onClick={enhanceRefs} disabled={enhancing} className={btn}>{enhancing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {enhancing ? "Enhancing…" : "Enhance detail with AI"}</button>
          </div>
          <textarea key={chars.data ?? ""} rows={8} className={`${input} w-full font-mono text-xs`} placeholder="#REF1 (Father): Black South African man, 36, 1.82 m, lean build, oval face, short cropped black hair with a fade, faint scar on left eyebrow, light blue cotton shirt with rolled sleeves, charcoal chinos, brown leather boots&#10;#REF2 (Prop: silver locket): oval, 3 cm, tarnished silver, engraved rose, thin chain" defaultValue={chars.data ?? ""} onBlur={(e) => storeChars(e.target.value)} />
        </div>
      </Panel>

      {shots.length > 0 && <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Scenes &amp; shots <span className="font-normal text-muted-foreground">· {shots.length}</span></h3>
        <div className="ml-auto flex gap-2">
            {shots.length > 0 && <button onClick={deleteAllShots} disabled={!!bulk} className="inline-flex items-center gap-1.5 rounded-sm border border-destructive px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Delete all shots</button>}
            {shots.length > 0 && <button onClick={generateAll} disabled={!!bulk} className={btn}>
              {bulk ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PencilIcon className="h-3.5 w-3.5" />}
              {bulk ? `Generating ${Math.min(bulk.done + 1, bulk.total)} of ${bulk.total}…` : "Generate all"}
            </button>}
        </div>
      </div>}

      {shots.length === 0 ? (
        <p className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No shots yet — break down a brief above, or add one manually.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shots.map((shot) => (
            <div key={shot.id} draggable onDragStart={() => setDragId(shot.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(shot.id); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, shot.id); setDragId(null); setDragOverId(null); }}
              onDragEnd={() => { setDragId(null); setDragOverId(null); }}
              className={`cursor-grab space-y-2 rounded-sm border border-border bg-card p-3 ${dragOverId === shot.id && dragId && dragId !== shot.id ? "bg-muted" : ""} ${shot.status === "approved" ? "ring-2 ring-success" : shot.is_anchor ? "ring-2 ring-info" : ""}`}>
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1.5">Scene {shot.scene_number} · Shot {shot.shot_number}
                  <button onClick={() => updateShot(shot.id, { is_anchor: !shot.is_anchor })} aria-label={shot.is_anchor ? "Remove anchor" : "Anchor this shot"} title={shot.is_anchor ? "Anchor shot — following shots match it" : "Anchor: make following shots match this one"}
                    className={shot.is_anchor ? "text-info" : "text-muted-foreground/50 hover:text-info"}><Anchor className="h-3.5 w-3.5" /></button>
                  {shot.is_anchor && <span className="rounded-sm bg-info/15 px-1.5 py-0.5 text-[10px] text-info">Anchor</span>}</span>
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
      <AlertDialog open={!!ask} onOpenChange={(o) => { if (!o) answer("cancel"); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{ask?.title}</AlertDialogTitle>
            <AlertDialogDescription>{ask?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {ask?.choices.map((c) => (
              <button key={c.value} onClick={() => answer(c.value)}
                className={`rounded-sm px-4 py-2 text-sm font-semibold ${c.tone === "destructive" ? "bg-destructive text-destructive-foreground" : c.tone === "outline" ? "border border-border hover:border-primary" : "bg-primary text-primary-foreground"}`}>{c.label}</button>
            ))}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
