import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistTemplateManager } from "@/components/ChecklistTemplateManager";

export function CrewPersonalChecklists({ crewId }: { crewId: string }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"Checklist" | "Done">("Checklist");
  const [title, setTitle] = useState("");
  const [newItem, setNewItem] = useState<Record<string, string>>({});
  const q = useQuery({ queryKey: ["personal-crew-checklists", crewId], queryFn: async () => {
    const { data, error } = await supabase.from("crew_checklists").select("*,crew_checklist_items(*)").eq("crew_id", crewId).order("created_at");
    if (error) throw error; return data ?? [];
  } });
  const refresh = () => qc.invalidateQueries({ queryKey: ["personal-crew-checklists", crewId] });
  async function create() {
    if (!title.trim()) return;
    const { error } = await supabase.from("crew_checklists").insert({ crew_id: crewId, title: title.trim() });
    if (error) toast.error(error.message); else { setTitle(""); void refresh(); }
  }
  async function addItem(id: string, count: number) {
    const label = (newItem[id] ?? "").trim(); if (!label) return;
    const { error } = await supabase.from("crew_checklist_items").insert({ checklist_id: id, label, sort_order: count });
    if (error) toast.error(error.message); else { setNewItem((prev) => ({ ...prev, [id]: "" })); void refresh(); }
  }
  async function saveTemplate(id: string, name: string, labels: string[]) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !labels.length) return toast.error("Add at least one item first.");
    const { error } = await supabase.from("checklist_templates").insert({ audience: "crew", owner_id: user.id, title: name, items: labels });
    if (error) toast.error(error.message); else { toast.success("Saved as reusable template"); void qc.invalidateQueries({ queryKey: ["checklist-templates", "crew"] }); }
  }
  const all = q.data ?? [];
  const counts = all.flatMap((l) => l.crew_checklist_items);
  return <div className="space-y-5">
    <ChecklistTemplateManager audience="crew" targetId={crewId} />
    <div className="flex gap-2 border-b border-border">{(["Checklist", "Done"] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`border-b-2 px-4 py-2 text-sm ${view === v ? "border-primary font-bold" : "border-transparent"}`}>{v} ({counts.filter((x) => x.done === (v === "Done")).length})</button>)}</div>
    <div className="flex gap-2"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New personal checklist" className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm" /><button onClick={create} className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground">Add checklist</button></div>
    {q.error && <p role="alert" className="text-sm text-destructive">{q.error.message}</p>}
    {all.map((list) => <section key={list.id} className="rounded border border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-bold">{list.title}</h3><div className="flex gap-3 text-xs"><button className="text-primary underline" onClick={() => saveTemplate(list.id, list.title, list.crew_checklist_items.map((i) => i.label))}>Save as template</button><button className="text-destructive underline" onClick={async () => { if (!window.confirm("Delete checklist?")) return; const { error } = await supabase.from("crew_checklists").delete().eq("id", list.id); if (error) toast.error(error.message); else void refresh(); }}>Delete</button></div></div>
      <ul className="divide-y divide-border">{list.crew_checklist_items.filter((i) => i.done === (view === "Done")).map((i) => <li key={i.id} className="flex items-center gap-3 py-2 text-sm"><input type="checkbox" checked={i.done} onChange={async () => { const { error } = await supabase.from("crew_checklist_items").update({ done: !i.done }).eq("id", i.id); if (error) toast.error(error.message); else void refresh(); }} /><span className="flex-1">{i.label}</span><button className="text-xs text-destructive" onClick={async () => { const { error } = await supabase.from("crew_checklist_items").delete().eq("id", i.id); if (error) toast.error(error.message); else void refresh(); }}>Remove</button></li>)}</ul>
      {view === "Checklist" && <div className="mt-3 flex gap-2"><input placeholder="Add task" value={newItem[list.id] ?? ""} onChange={(e) => setNewItem((prev) => ({ ...prev, [list.id]: e.target.value }))} className="min-w-0 flex-1 rounded border border-border bg-background p-2 text-sm" /><button onClick={() => addItem(list.id, list.crew_checklist_items.length)} className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">Add</button></div>}
    </section>)}
  </div>;
}
