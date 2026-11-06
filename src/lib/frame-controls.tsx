import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GripVertical, Lightbulb, Pin, PinOff, X } from "lucide-react";

// Sidebar frames can be pinned to the top and dragged into a new order. Each frame's Panel reads
// these controls from context and shows a grip + pin in its header; layout is saved per browser.
type Controls = { pinned: boolean; togglePin: () => void; armDrag: () => void };
const FrameControlsContext = createContext<Controls | null>(null);

export function FrameHeaderControls() {
  const c = useContext(FrameControlsContext);
  if (!c) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={c.togglePin} title={c.pinned ? "Unpin frame" : "Pin frame to top"} aria-label={c.pinned ? "Unpin frame" : "Pin frame to top"}
        className={`grid h-6 w-6 place-items-center rounded ${c.pinned ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
        {c.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
      <span onPointerDown={c.armDrag} title="Drag to reorder" aria-label="Drag to reorder" className="grid h-6 w-6 cursor-grab place-items-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
    </span>
  );
}

export type Frame = { id: string; node: ReactNode };
type Layout = { order: string[]; pinned: string[] };
const TIP_KEY = "sidebar-frames-tip-dismissed";

/** Pure ordering rule: pinned frames first (in pin order), then the saved order, then any new frames. */
export function arrangeFrames(ids: string[], layout: Layout): string[] {
  const known = new Set(ids);
  const pinned = layout.pinned.filter((id) => known.has(id));
  const rest = [...layout.order.filter((id) => known.has(id) && !pinned.includes(id)), ...ids.filter((id) => !pinned.includes(id) && !layout.order.includes(id))];
  return [...pinned, ...rest];
}

export function SortableFrames({ storageKey, frames }: { storageKey: string; frames: Frame[] }) {
  const [layout, setLayout] = useState<Layout>({ order: [], pinned: [] });
  const [tip, setTip] = useState(false);
  const [armed, setArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) setLayout({ order: [], pinned: [], ...JSON.parse(raw) }); } catch { /* ignore */ }
    setTip(localStorage.getItem(TIP_KEY) !== "1");
  }, [storageKey]);

  const save = (next: Layout) => { setLayout(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ } };
  const ids = frames.map((f) => f.id);
  const arranged = arrangeFrames(ids, layout);
  const byId = new Map(frames.map((f) => [f.id, f]));

  function togglePin(id: string) {
    const pinned = layout.pinned.includes(id) ? layout.pinned.filter((x) => x !== id) : [id, ...layout.pinned];
    save({ order: arranged, pinned });
  }
  function drop(target: string) {
    if (!dragId || dragId === target) return;
    const order = arranged.filter((x) => x !== dragId);
    order.splice(order.indexOf(target), 0, dragId);
    // Dragging a frame into/out of the pinned block pins/unpins it so the drop position sticks.
    const targetPinned = layout.pinned.includes(target);
    const pinned = order.filter((x) => (x === dragId ? targetPinned : layout.pinned.includes(x)));
    save({ order, pinned });
  }

  return (
    <div className="space-y-5">
      {tip && (
        <div className="flex items-start gap-2 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="flex-1">New: pin <Pin className="inline h-3 w-3" /> a frame to keep it at the top, or drag <GripVertical className="inline h-3 w-3" /> to reorder.</span>
          <button type="button" aria-label="Dismiss tip" onClick={() => { setTip(false); localStorage.setItem(TIP_KEY, "1"); }} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {arranged.map((id) => (
        <div key={id} draggable={armed === id}
          onDragStart={(e) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(id); } }}
          onDrop={(e) => { e.preventDefault(); drop(id); setDragId(null); setOverId(null); setArmed(null); }}
          onDragEnd={() => { setDragId(null); setOverId(null); setArmed(null); }}
          onPointerUp={() => setArmed(null)}
          className={`rounded-sm transition-shadow ${dragId === id ? "opacity-50" : ""} ${overId === id && dragId && dragId !== id ? "ring-2 ring-primary" : ""}`}>
          <FrameControlsContext.Provider value={{ pinned: layout.pinned.includes(id), togglePin: () => togglePin(id), armDrag: () => setArmed(id) }}>
            {byId.get(id)!.node}
          </FrameControlsContext.Provider>
        </div>
      ))}
    </div>
  );
}
