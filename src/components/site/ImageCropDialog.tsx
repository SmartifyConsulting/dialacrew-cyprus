import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

const VIEW = 280; // on-screen size of the square crop area (px)
const OUT = 600; // saved picture size (px)

type Offset = { x: number; y: number };

// Drag a picture around and zoom it inside a rounded square; "Use this picture" saves exactly what is inside the square.
export function ImageCropDialog({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (cropped: File) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<Offset | null>(null);

  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u); setSize(null); setZoom(1); setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // At zoom 1 the picture just covers the square; the offset can never pull an edge inside it.
  const base = size ? Math.max(VIEW / size.w, VIEW / size.h) : 1;
  const scale = base * zoom;
  const clamp = (o: Offset, s: number): Offset => {
    if (!size) return o;
    const mx = Math.max(0, (size.w * s - VIEW) / 2);
    const my = Math.max(0, (size.h * s - VIEW) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };
  const changeZoom = (z: number) => { setZoom(z); setOffset((o) => clamp(o, base * z)); };

  function save() {
    const img = imgRef.current;
    if (!img || !size || !file) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Where the picture's top-left corner sits inside the square, then the part of the picture the square shows.
    const left = VIEW / 2 - (size.w * scale) / 2 + offset.x;
    const top = VIEW / 2 - (size.h * scale) / 2 + offset.y;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(img, -left / scale, -top / scale, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT);
    canvas.toBlob((blob) => {
      if (!blob) { toast.error("Couldn't save the cropped picture. Try another one."); return; }
      onDone(new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "cover"}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }

  return (
    <Dialog open={!!file} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Crop picture</DialogTitle>
          <DialogDescription>Drag the picture to move it, and use the slider to zoom.</DialogDescription>
        </DialogHeader>
        <div
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-border bg-muted active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            const dx = e.clientX - drag.current.x;
            const dy = e.clientY - drag.current.y;
            drag.current = { x: e.clientX, y: e.clientY };
            setOffset((o) => clamp({ x: o.x + dx, y: o.y + dy }, scale));
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          {url && (
            <img
              ref={imgRef} src={url} alt="" draggable={false}
              onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => { toast.error("That picture can't be opened. Try a JPG or PNG."); onCancel(); }}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={size
                ? { width: size.w * scale, height: size.h * scale, transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }
                : { opacity: 0 }}
            />
          )}
        </div>
        <Slider min={1} max={4} step={0.01} value={[zoom]} onValueChange={(v) => changeZoom(v[0] ?? 1)} aria-label="Zoom" />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={save} disabled={!size}>Use this picture</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
