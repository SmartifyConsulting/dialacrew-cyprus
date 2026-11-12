import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, Maximize, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errors";
import { signedUrl, uploadFile } from "@/lib/site";
import { Panel } from "@/components/AppShell";
import type { Production } from "@/lib/demo-data";

const btn = "inline-flex items-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";
const TRANSITION = 0.4; // seconds of cross-fade between shots

type Shot = { id: string; scene_number: number; shot_number: number; image_path: string | null; duration_seconds: number };

function useResolvedUrls(paths: (string | null | undefined)[]) {
  const key = paths.filter(Boolean).join("|");
  return useQuery({
    queryKey: ["storyboard-signed-urls", key],
    enabled: !!key,
    queryFn: async () => {
      const entries = await Promise.all(paths.map(async (p) => [p, p ? await signedUrl(p) : null] as const));
      return Object.fromEntries(entries) as Record<string, string | null>;
    },
  }).data ?? {};
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function AnimaticStudio({ p, isProducer }: { p: Production; isProducer: boolean }) {
  const qc = useQueryClient();
  const shots = useQuery({
    queryKey: ["storyboard-shots", p.id],
    queryFn: async () => { const { data, error } = await supabase.from("storyboard_shots").select("*").eq("production_id", p.id).order("sort_order"); if (error) throw error; return (data ?? []) as Shot[]; },
  }).data ?? [];


  const playableShots = shots.filter((s) => s.image_path);
  const cumulative = useMemo(() => {
    let t = 0;
    return playableShots.map((s) => { const start = t; t += s.duration_seconds || 1; return { shot: s, start, end: t }; });
  }, [playableShots]);
  const totalDuration = cumulative.at(-1)?.end ?? 0;

  const imageUrls = useResolvedUrls(playableShots.map((s) => s.image_path));

  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) { lastTickRef.current = null; return; }
    function tick(now: number) {
      if (lastTickRef.current != null) {
        setCurrentTime((t) => {
          const next = t + (now - lastTickRef.current!) / 1000;
          if (next >= totalDuration) { setPlaying(false); return totalDuration; }
          return next;
        });
      }
      lastTickRef.current = now;
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, totalDuration]);

  const currentEntry = cumulative.find((c) => currentTime >= c.start && currentTime < c.end) ?? cumulative.at(-1);
  const nextEntry = currentEntry ? cumulative[cumulative.indexOf(currentEntry) + 1] : undefined;
  const fadeProgress = currentEntry && nextEntry && currentEntry.end - currentTime < TRANSITION ? 1 - (currentEntry.end - currentTime) / TRANSITION : 0;

  function seek(t: number) {
    setCurrentTime(Math.max(0, Math.min(totalDuration, t)));
  }

  function toggleFullscreen() {
    if (!containerRef.current) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void containerRef.current.requestFullscreen();
  }

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  async function exportMp4() {
    if (!playableShots.length) { toast.error("No illustrated shots to export yet"); return; }
    setExporting(true); setExportProgress(0);
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress }) => setExportProgress(Math.round(progress * 100)));
      const core = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${core}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${core}/ffmpeg-core.wasm`, "application/wasm"),
      });

      const concatLines: string[] = [];
      for (let i = 0; i < playableShots.length; i++) {
        const shot = playableShots[i]!;
        const url = imageUrls[shot.image_path!];
        if (!url) continue;
        const name = `img${String(i).padStart(3, "0")}.png`;
        await ffmpeg.writeFile(name, await fetchFile(url));
        concatLines.push(`file '${name}'`, `duration ${shot.duration_seconds || 1}`);
        if (i === playableShots.length - 1) concatLines.push(`file '${name}'`); // ffmpeg concat quirk: repeat last file so its duration takes effect
      }
      await ffmpeg.writeFile("list.txt", concatLines.join("\n"));

      const args = ["-f", "concat", "-safe", "0", "-i", "list.txt", "-r", "25", "-pix_fmt", "yuv420p", "-an", "-c:v", "libx264", "-t", String(totalDuration), "output.mp4"];

      await ffmpeg.exec(args);
      const data = await ffmpeg.readFile("output.mp4");
      const blob = new Blob([Uint8Array.from(data as Uint8Array).buffer], { type: "video/mp4" });

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${p.name.replace(/[^\w.-]+/g, "_")}-animatic.mp4`;
      a.click();
      URL.revokeObjectURL(a.href);

      const path = await uploadFile(`${p.id}/storyboard-exports`, blob, "animatic.mp4");
      const saved = await supabase.from("storyboard_exports").insert({ production_id: p.id, video_path: path, duration_seconds: totalDuration }).select("id").single();
      if (saved.error || !saved.data) throw saved.error ?? new Error("Video downloaded, but the production copy could not be saved");
      qc.invalidateQueries({ queryKey: ["storyboard-exports", p.id] });
      toast.success("Animatic exported and saved");
    } catch (e) { toast.error(friendlyError(e)); }
    finally { setExporting(false); }
  }

  const exports = useQuery({
    queryKey: ["storyboard-exports", p.id],
    queryFn: async () => { const { data, error } = await supabase.from("storyboard_exports").select("*").eq("production_id", p.id).order("created_at", { ascending: false }); if (error) throw error; return data ?? []; },
  }).data ?? [];

  if (!isProducer) return <p className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground">Storyboard Studio is managed by the production's producer.</p>;
  if (playableShots.length === 0) return (
    <div className="space-y-4">
      <p className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Generate at least one illustration in Illustrate mode to preview an animatic.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="relative aspect-video w-full overflow-hidden rounded-sm bg-black">
        {currentEntry?.shot.image_path && imageUrls[currentEntry.shot.image_path] && (
          <img src={imageUrls[currentEntry.shot.image_path]!} alt="" className="absolute inset-0 h-full w-full object-contain" style={{ opacity: 1 - fadeProgress }} />
        )}
        {fadeProgress > 0 && nextEntry?.shot.image_path && imageUrls[nextEntry.shot.image_path] && (
          <img src={imageUrls[nextEntry.shot.image_path]!} alt="" className="absolute inset-0 h-full w-full object-contain" style={{ opacity: fadeProgress }} />
        )}
        <button onClick={toggleFullscreen} aria-label="Full screen" className="absolute right-3 top-3 rounded-sm bg-black/50 p-2 text-white hover:bg-black/70"><Maximize className="h-4 w-4" /></button>
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-3">
          <button onClick={() => setPlaying((v) => !v)} aria-label={playing ? "Pause" : "Play"} className="rounded-full bg-white p-2 text-black">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
          <span className="w-20 shrink-0 text-xs font-medium text-white">{fmtTime(currentTime)} / {fmtTime(totalDuration)}</span>
          <input type="range" min={0} max={totalDuration} step={0.05} value={currentTime} onChange={(e) => seek(Number(e.target.value))} className="w-full accent-primary" />
        </div>
      </div>

      <Panel title="Export">
        <div className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">Renders the illustrations as a silent animated MP4, in your browser (no upload needed first). This can take a while for longer animatics.</p>
          <button onClick={exportMp4} disabled={exporting} className={btn}><Download className="h-3.5 w-3.5" /> {exporting ? `Exporting… ${exportProgress}%` : "Export MP4"}</button>
          {exports.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {exports.map((ex) => (
                <li key={ex.id}>{new Date(ex.created_at).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })} — <ExportLink path={ex.video_path} /></li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}

function ExportLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let live = true; void signedUrl(path).then((u) => { if (live) setUrl(u); }); return () => { live = false; }; }, [path]);
  return url ? <a href={url} target="_blank" rel="noreferrer" className="text-primary underline">Download</a> : <span>Loading…</span>;
}
