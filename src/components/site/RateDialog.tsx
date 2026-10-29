import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FRAMEWORKS, WORK_AGAIN, inferFramework, summarize, type FrameworkId, type Scores, type WorkAgain } from "@/lib/rating-frameworks";

type Props = { crewId: string; name: string; role?: string | null; department?: string | null; productionId: string; onClose: () => void; onSaved: () => void };

export function RateDialog({ crewId, name, role, department, productionId, onClose, onSaved }: Props) {
  const inferred = inferFramework(role, department);
  const [fw, setFw] = useState<FrameworkId | null>(inferred);
  const [scores, setScores] = useState<Scores>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [comment, setComment] = useState("");
  const [again, setAgain] = useState<WorkAgain | null>(null);
  const [busy, setBusy] = useState(false);

  // Load this reviewer's existing rating for this person on this production, so it's edited rather than duplicated.
  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("crew_reviews").select("framework, scores, criterion_comments, comment, work_again")
        .eq("crew_id", crewId).eq("production_id", productionId).eq("reviewer_id", u.user.id).maybeSingle();
      if (!data) return;
      if (data.framework) setFw(data.framework as FrameworkId);
      setScores((data.scores ?? {}) as Scores);
      setNotes((data.criterion_comments ?? {}) as Record<string, string>);
      setComment(data.comment ?? "");
      if (data.work_again) setAgain(data.work_again as WorkAgain);
    })();
  }, [crewId, productionId]);

  const sum = fw ? summarize(fw, scores) : null;

  async function submit() {
    if (!fw || !sum) { toast.error("Choose which rating framework fits this person"); return; }
    if (sum.rated === 0) { toast.error("Rate at least one criterion"); return; }
    if (!again) { toast.error(`Answer: would you work with ${name} again?`); return; }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", u.user!.id).maybeSingle();
    const { error } = await supabase.from("crew_reviews").upsert({
      crew_id: crewId, production_id: productionId, reviewer_id: u.user!.id, reviewer_name: prof?.full_name ?? "",
      rating: Math.max(1, Math.min(5, Math.round(sum.overall!))), overall_score: sum.overall, framework: fw,
      scores, criterion_comments: Object.fromEntries(Object.entries(notes).filter(([, v]) => v.trim())), comment, work_again: again,
    }, { onConflict: "crew_id,production_id,reviewer_id" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Rating saved for ${name}`);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-3" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border p-4">
          <h3 className="text-xl font-semibold text-foreground">Rate {name}</h3>
          <label className="mt-2 block text-xs text-muted-foreground">Rating framework{!inferred && <span className="text-destructive"> · please choose</span>}
            <select className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground" value={fw ?? ""} onChange={(e) => setFw((e.target.value || null) as FrameworkId | null)}>
              <option value="">Select…</option>
              {Object.values(FRAMEWORKS).map((f) => <option key={f.id} value={f.id}>{f.name} — {f.blurb}</option>)}
            </select>
          </label>
          {sum && <p className="mt-2 text-sm font-semibold text-foreground">Overall: {sum.overall != null ? `${sum.overall} / 5` : "Not rated"} <span className="text-xs font-normal text-muted-foreground">({sum.rated}/{sum.total} criteria)</span></p>}
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {fw && FRAMEWORKS[fw].categories.map((c, ci) => {
            const cs = sum!.categories[ci]!;
            return (
              <details key={c.name} open={ci === 0} className="group rounded-lg border border-border">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold text-foreground">
                  <span>{c.name}</span>
                  <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">{cs.score != null ? `${cs.score} / 5` : "Not rated"}<ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></span>
                </summary>
                <div className="space-y-3 border-t border-border px-3 py-3">
                  {c.criteria.map((k) => (
                    <div key={k}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-foreground">{k}</span>
                        <div className="flex gap-1" role="radiogroup" aria-label={k}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button key={n} type="button" role="radio" aria-checked={scores[k] === n} aria-label={`${k}: ${n}`}
                              onClick={() => setScores((s) => { const next = { ...s }; if (next[k] === n) delete next[k]; else next[k] = n; return next; })}
                              className={`h-7 w-7 rounded-md border text-xs font-semibold ${scores[k] === n ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>{n}</button>
                          ))}
                        </div>
                      </div>
                      <input className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-xs" placeholder="Optional comment"
                        value={notes[k] ?? ""} onChange={(e) => setNotes((x) => ({ ...x, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
          {fw && (
            <>
              <textarea rows={2} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" placeholder="Overall comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
              <fieldset className="rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-semibold text-foreground">Would you work with {name} again? <span className="text-destructive">*</span></legend>
                <div className="flex gap-2">
                  {WORK_AGAIN.map((o) => (
                    <button key={o.v} type="button" aria-pressed={again === o.v} onClick={() => setAgain(o.v)}
                      className={`flex-1 rounded-md border px-3 py-1.5 text-sm font-semibold ${again === o.v ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"}`}>{o.label}</button>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border p-3">
          <button onClick={onClose} className="px-3 py-2 text-xs text-muted-foreground">Cancel</button>
          <button disabled={busy} onClick={submit} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save rating"}</button>
        </div>
      </div>
    </div>
  );
}
