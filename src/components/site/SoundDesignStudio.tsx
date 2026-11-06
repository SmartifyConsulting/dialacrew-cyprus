import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, Music2, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { uploadFile, useSignedUrl } from "@/lib/site";
import { Panel } from "@/components/AppShell";
import { proposeSoundtrack, generateAudioCue, restoreAudioVersion } from "@/lib/sound-design.functions";
import type { Production } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

type Cue = {
  id: string; production_id: string; shot_id: string | null; kind: "music" | "sfx" | "ambience" | "narration" | "upload";
  label: string; prompt: string | null; audio_path: string | null; duration_seconds: number | null;
  start_offset_seconds: number; volume: number; status: "draft" | "generating" | "generated" | "failed"; generation_error: string | null; sort_order: number;
};
type Shot = { id: string; scene_number: number; shot_number: number; description: string };
type Proposal = { kind: "music" | "sfx" | "ambience" | "narration"; scene_number: number; shot_number: number | null; label: string; prompt: string; duration_seconds: number };

const KIND_LABELS: Record<Cue["kind"], string> = { music: "Music", sfx: "SFX", ambience: "Ambience", narration: "Narration", upload: "Uploads" };
const TRACKS: Cue["kind"][] = ["music", "narration", "sfx", "ambience", "upload"];

function CuePlayer({ path }: { path: string | null }) {
  const url = useSignedUrl(path ?? undefined).data;
  if (!path) return null;
  return url ? <audio controls preload="none" src={url} className="h-8 w-full" /> : <div className="h-8 w-full animate-pulse rounded-sm bg-muted" />;
}

function VersionHistory({ p, cue, onRestored }: { p: Production; cue: Cue; onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  const restore = useServerFn(restoreAudioVersion);
  const versions = useQuery({
    queryKey: ["storyboard-audio-versions", cue.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("storyboard_audio_cue_versions").select("*").eq("cue_id", cue.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  }).data ?? [];

  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} title="Version history" aria-label="Version history"
        className="inline-flex items-center justify-center rounded-sm border border-border p-1.5 text-muted-foreground hover:text-primary">
        <History className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 max-h-64 space-y-1 overflow-y-auto rounded-sm border border-border bg-card p-2 shadow-md">
          {versions.length === 0 && <p className="p-1 text-xs text-muted-foreground">No past takes yet.</p>}
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-2 rounded-sm border border-border px-2 py-1.5 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{new Date(v.created_at).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}</span>
              <button type="button" onClick={async () => { try { await restore({ data: { productionId: p.id, cueId: cue.id, versionId: v.id } }); toast.success("Restored that take"); setOpen(false); onRestored(); } catch (e) { toast.error(friendlyError(e)); } }}
                className="shrink-0 rounded-sm bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">Restore</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SoundDesignStudio({ p, isProducer }: { p: Production; isProducer: boolean }) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["storyboard-audio-cues", p.id] });
  const shots = useQuery({
    queryKey: ["storyboard-shots", p.id],
    queryFn: async () => { const { data, error } = await supabase.from("storyboard_shots").select("id, scene_number, shot_number, description").eq("production_id", p.id).order("sort_order"); if (error) throw error; return (data ?? []) as Shot[]; },
  }).data ?? [];
  const cues = useQuery({
    queryKey: ["storyboard-audio-cues", p.id],
    queryFn: async () => { const { data, error } = await supabase.from("storyboard_audio_cues").select("*").eq("production_id", p.id).order("sort_order"); if (error) throw error; return (data ?? []) as Cue[]; },
  }).data ?? [];

  const propose = useServerFn(proposeSoundtrack);
  const generate = useServerFn(generateAudioCue);
  const [proposing, setProposing] = useState(false);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  async function runSoundDirector() {
    setProposing(true);
    try {
      const { proposals: out } = await propose({ data: { productionId: p.id } });
      setProposals(out);
      setPicked(new Set(out.map((_, i) => i)));
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setProposing(false); }
  }

  async function addPicked() {
    if (!proposals) return;
    const rows = [...picked].map((i) => {
      const prop = proposals[i]!;
      const shot = prop.shot_number ? shots.find((s) => s.scene_number === prop.scene_number && s.shot_number === prop.shot_number) : undefined;
      return { production_id: p.id, shot_id: shot?.id ?? null, kind: prop.kind, label: prop.label, prompt: prop.prompt, duration_seconds: prop.duration_seconds, sort_order: cues.length };
    });
    if (!rows.length) return;
    const { error } = await supabase.from("storyboard_audio_cues").insert(rows);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(`${rows.length} cue${rows.length === 1 ? "" : "s"} added as drafts`);
    setProposals(null);
    refresh();
  }

  async function addBlankCue(kind: Cue["kind"]) {
    const { error } = await supabase.from("storyboard_audio_cues").insert({ production_id: p.id, kind, label: `New ${KIND_LABELS[kind].toLowerCase()}`, sort_order: cues.length });
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function updateCue(id: string, patch: Partial<Pick<Cue, "label" | "prompt" | "volume" | "start_offset_seconds">>) {
    const { error } = await supabase.from("storyboard_audio_cues").update(patch).eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function deleteCue(id: string) {
    const { error } = await supabase.from("storyboard_audio_cues").delete().eq("id", id);
    if (error) { toast.error(friendlyError(error)); return; }
    refresh();
  }

  async function runGenerate(cue: Cue) {
    if (!cue.prompt?.trim()) { toast.error("Write a prompt for this cue first"); return; }
    setGeneratingId(cue.id);
    refresh();
    try {
      await generate({ data: { productionId: p.id, cueId: cue.id, kind: cue.kind === "upload" ? "sfx" : cue.kind, prompt: cue.prompt, durationSeconds: cue.duration_seconds ?? undefined } });
      toast.success("Audio generated");
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setGeneratingId(null); refresh(); }
  }

  async function uploadCueFile(cue: Cue, file?: File) {
    if (!file) return;
    try {
      const path = await uploadFile(`${p.id}/storyboard-audio`, file, file.name);
      const { error } = await supabase.from("storyboard_audio_cues").update({ audio_path: path, status: "generated" }).eq("id", cue.id);
      if (error) throw error;
      toast.success("Uploaded");
      refresh();
    } catch (e) { toast.error(friendlyError(e)); }
  }

  if (!isProducer) return <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">Storyboard Studio is managed by the production's producer.</p>;

  const timelineEnd = Math.max(60, ...cues.map((c) => c.start_offset_seconds + (c.duration_seconds ?? 10)));

  return (
    <div className="space-y-4">
      <Panel title="AI Sound Director">
        <div className="space-y-3 p-4">
          <p className="text-xs text-muted-foreground">Analyses this storyboard's scenes and shots and proposes an emotional soundtrack journey — music, SFX, ambience and narration — for you to review before anything is generated.</p>
          <button onClick={runSoundDirector} disabled={proposing} className={btn}><Sparkles className="h-3.5 w-3.5" /> {proposing ? "Thinking…" : "Propose soundtrack"}</button>
          {proposals && (
            <div className="space-y-2 rounded-sm border border-border p-3">
              {proposals.map((prop, i) => (
                <label key={i} className="flex items-start gap-2 text-xs">
                  <input type="checkbox" className="mt-0.5 accent-primary" checked={picked.has(i)} onChange={(e) => setPicked((prev) => { const n = new Set(prev); if (e.target.checked) n.add(i); else n.delete(i); return n; })} />
                  <span><span className="font-semibold text-foreground">{KIND_LABELS[prop.kind]} · Scene {prop.scene_number}{prop.shot_number ? ` · Shot ${prop.shot_number}` : ""} — {prop.label}</span><br /><span className="text-muted-foreground">{prop.prompt}</span></span>
                </label>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={addPicked} className={btn}>Add {picked.size} as drafts</button>
                <button onClick={() => setProposals(null)} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Dismiss</button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <div className="space-y-3">
        {TRACKS.map((kind) => {
          const trackCues = cues.filter((c) => c.kind === kind);
          return (
            <div key={kind} className="rounded-sm border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Music2 className="h-3.5 w-3.5" /> {KIND_LABELS[kind]}</span>
                <button onClick={() => addBlankCue(kind)} className="text-xs font-semibold text-primary hover:underline">+ Add</button>
              </div>
              {trackCues.length === 0 ? (
                <p className="p-3 text-xs text-muted-foreground">No {KIND_LABELS[kind].toLowerCase()} cues yet.</p>
              ) : (
                <div className="relative mx-3 my-3 h-10 rounded-sm bg-muted/40">
                  {trackCues.map((c) => (
                    <div key={c.id} title={c.label} className="absolute top-0.5 h-9 overflow-hidden rounded-sm border border-primary/40 bg-primary/15 px-1.5 text-[10px] font-semibold text-primary"
                      style={{ left: `${(c.start_offset_seconds / timelineEnd) * 100}%`, width: `${Math.max(4, ((c.duration_seconds ?? 10) / timelineEnd) * 100)}%` }}>
                      <span className="block truncate leading-9">{c.label}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2 p-3 pt-0">
                {trackCues.map((c) => (
                  <div key={c.id} className="space-y-1.5 rounded-sm border border-border p-2">
                    <div className="flex items-center gap-2">
                      <input className={`${input} min-w-32 flex-1 py-1 text-xs`} defaultValue={c.label} onBlur={(e) => { const v = e.target.value; if (v !== c.label) updateCue(c.id, { label: v }); }} />
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">start<input type="number" min={0} className={`${input} w-14 px-1 py-1`} defaultValue={c.start_offset_seconds} onBlur={(e) => { const v = Number(e.target.value); if (v !== c.start_offset_seconds) updateCue(c.id, { start_offset_seconds: v }); }} />s</label>
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">vol<input type="range" min={0} max={1} step={0.05} defaultValue={c.volume} onChange={(e) => updateCue(c.id, { volume: Number(e.target.value) })} className="w-16" /></label>
                      {c.kind !== "upload" && <VersionHistory p={p} cue={c} onRestored={refresh} />}
                      <button onClick={() => deleteCue(c.id)} aria-label="Delete cue" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {c.kind === "upload" ? (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                        <Upload className="h-3.5 w-3.5" /> {c.audio_path ? "Replace file" : "Upload file"}
                        <input type="file" accept="audio/*" hidden onChange={(e) => { uploadCueFile(c, e.target.files?.[0]); e.target.value = ""; }} />
                      </label>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input className={`${input} flex-1 py-1 text-xs`} placeholder="Prompt" defaultValue={c.prompt ?? ""} onBlur={(e) => { const v = e.target.value; if (v !== c.prompt) updateCue(c.id, { prompt: v }); }} />
                        <button onClick={() => runGenerate(c)} disabled={generatingId === c.id || c.status === "generating"} className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-primary px-2 py-1 text-[11px] font-semibold text-primary disabled:opacity-50">
                          {c.status === "generating" || generatingId === c.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} {c.audio_path ? "Regenerate" : "Generate"}
                        </button>
                      </div>
                    )}
                    {c.status === "failed" && c.generation_error && <p className="text-xs text-destructive">{c.generation_error}</p>}
                    <CuePlayer path={c.audio_path} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
