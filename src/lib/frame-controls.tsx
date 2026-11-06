import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GripVertical, Pin, PinOff } from "lucide-react";

// Sidebar frames can be pinned open (always expanded) and dragged into a new order. Each frame's Panel
// reads these controls from context and shows a pin + grip in its header; layout is saved per browser.
type Controls = { pinned: boolean; togglePin: () => void; armDrag: () => void };
const FrameControlsContext = createContext<Controls | null>(null);

/** True when the surrounding frame is pinned open — Panel uses it to stay expanded. */
export function useFramePinned() {
  return useContext(FrameControlsContext)?.pinned ?? false;
}

export function FrameHeaderControls() {
  const c = useContext(FrameControlsContext);
  if (!c) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={c.togglePin} title={c.pinned ? "Unpin (allow collapsing)" : "Pin open"} aria-label={c.pinned ? "Unpin frame" : "Pin frame open"} aria-pressed={c.pinned}
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

/** Pure ordering rule: the saved order, then any new frames. Pinning does not move frames. */
export function arrangeFrames(ids: string[], layout: Layout): string[] {
  const known = new Set(ids);
  return [...layout.order.filter((id) => known.has(id)), ...ids.filter((id) => !layout.order.includes(id))];
}

export function SortableFrames({ storageKey, frames }: { storageKey: string; frames: Frame[] }) {
  const [layout, setLayout] = useState<Layout>({ order: [], pinned: [] });
  const [armed, setArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) setLayout({ order: [], pinned: [], ...JSON.parse(raw) }); } catch { /* ignore */ }
  }, [storageKey]);

  const save = (next: Layout) => { setLayout(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ } };
  const ids = frames.map((f) => f.id);
  const arranged = arrangeFrames(ids, layout);
  const byId = new Map(frames.map((f) => [f.id, f]));

  function togglePin(id: string) {
    const pinned = layout.pinned.includes(id) ? layout.pinned.filter((x) => x !== id) : [...layout.pinned, id];
    save({ order: arranged, pinned });
  }
  function drop(target: string) {
    if (!dragId || dragId === target) return;
    const order = arranged.filter((x) => x !== dragId);
    order.splice(order.indexOf(target), 0, dragId);
    save({ order, pinned: layout.pinned });
  }

  return (
    <div className="space-y-5">
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
