import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mic, Square, X } from "lucide-react";
import { toast } from "sonner";
import { transcribeAudio } from "@/lib/transcribe.functions";

const toBase64 = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onloadend = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = rej;
  r.readAsDataURL(blob);
});

/** Records a voice note, transcribes it, and hands back the audio + transcript. */
export function AudioRecorder({ onDone, onCancel }: { onDone: (blob: Blob, transcript: string) => void; onCancel: () => void }) {
  const transcribe = useServerFn(transcribeAudio);
  const [state, setState] = useState<"rec" | "busy">("rec");
  const [secs, setSecs] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const cancelled = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
        const mr = new MediaRecorder(stream, { mimeType: mime });
        mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        mr.onstop = async () => {
          stream?.getTracks().forEach((t) => t.stop());
          if (cancelled.current || !chunks.current.length) return;
          const blob = new Blob(chunks.current, { type: mime });
          try {
            const { text } = await transcribe({ data: { audio: await toBase64(blob), mime } });
            onDone(blob, text);
          } catch (e) {
            toast.error((e as Error).message || "Could not transcribe. The audio will still be attached.");
            onDone(blob, "");
          }
        };
        mr.start();
        rec.current = mr;
        timer = setInterval(() => setSecs((s) => s + 1), 1000);
      } catch {
        toast.error("Could not access the microphone. Check your browser permissions.");
        onCancel();
      }
    })();
    return () => { clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => { setState("busy"); rec.current?.stop(); };
  const cancel = () => { cancelled.current = true; rec.current?.state === "recording" && rec.current.stop(); onCancel(); };
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-3 rounded-sm border border-primary bg-primary/10 px-3 py-2">
      {state === "rec" ? (
        <>
          <span className="flex items-center gap-2 text-sm font-semibold text-primary"><Mic className="h-4 w-4 animate-pulse" /> Recording {mm}</span>
          <button onClick={stop} className="ml-auto flex items-center gap-1 rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold uppercase text-primary-foreground"><Square className="h-3 w-3" /> Stop & transcribe</button>
          <button onClick={cancel} aria-label="Cancel recording" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </>
      ) : (
        <span className="flex items-center gap-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin" /> Transcribing…</span>
      )}
    </div>
  );
}
