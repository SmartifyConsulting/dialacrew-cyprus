import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { saveRetrospective, type RetroForm } from "@/lib/memory.functions";
import type { Production } from "@/lib/demo-data";
import { useSession } from "@/lib/auth";
import { AI_LEARNING_PRODUCTIONS, useAiLearningPhase } from "@/lib/site";

const TYPES = ["Feature", "Commercial", "Short", "Music Video", "Doc"];
const SIZES = ["<20", "20-50", "50+"];
const CAUSES = ["None", "Weather", "Scope Change", "Gear Failure", "Location Issues", "Director Takes", "Unrealistic Call Sheet"];
const CATS = ["Locations & Permitting", "Gear & Equipment Reliability", "Department Handoffs & Call Sheet Accuracy", "Vendor & Crew Performance"];
const ROOT = ["#PowerIssues", "#LateScriptChange", "#VendorDelay", "#UnderStaffed", "#AccessLimits"];
const LOC_TAGS = ["High Efficiency", "Power Struggles", "Sound Clean", "Sound Noisy", "Difficult Access"];
const VEN_TAGS = ["Recommend", "Over-Priced", "Reliable Under Pressure", "Do Not Rehire"];

const field = "w-full rounded-sm border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-ring";
const label = "text-[11px] font-semibold text-muted-foreground";

const blank = (p: Production): RetroForm => ({
  type: TYPES.includes(p.type) ? p.type : "Commercial", shootDays: p.days, crewSize: "<20", locationsCount: 1,
  budgetPlanned: p.budget, budgetActual: p.budget, otPlanned: 0, otActual: 0, postPlanned: 2, postActual: 2, deltaCause: "None",
  ratings: Object.fromEntries(CATS.map((c) => [c, 4])), rootTags: {},
  locations: [{ name: p.location, tags: [] }], vendors: [{ name: "", tags: [] }],
  win: "", risk: "", warning: "",
});

function Pills({ opts, value, onChange }: { opts: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => {
        const on = value.includes(o);
        return <button type="button" key={o} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] transition ${on ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary"}`}>{o}</button>;
      })}
    </div>
  );
}

export function RetroTab({ p }: { p: Production }) {
  const { session } = useSession();
  const phase = useAiLearningPhase(p.id, session?.user.id);
  const qc = useQueryClient();
  const save = useServerFn(saveRetrospective);
  const existing = useQuery({
    queryKey: ["retro", p.id],
    queryFn: async () => {
      const { data } = await (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> })
        .from("production_retrospectives").select("form, lessons, memory").eq("production_id", p.id).maybeSingle();
      return data as unknown as { form: RetroForm; lessons: string; memory: Record<string, string | string[]> } | null;
    },
  });
  const [f, setF] = useState<RetroForm>(() => blank(p));
  const [out, setOut] = useState<{ lessons: string; payload: Record<string, string | string[]> } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (existing.data) { setF({ ...blank(p), ...existing.data.form }); setOut({ lessons: existing.data.lessons, payload: existing.data.memory }); } }, [existing.data, p]);

  const set = <K extends keyof RetroForm>(k: K, v: RetroForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const preview = useMemo(() => ({
    project: p.name, client: p.client, type: f.type, shoot_days: f.shootDays, crew_size: f.crewSize,
    variance: { budget_pct: f.budgetPlanned ? Math.round(((f.budgetActual - f.budgetPlanned) / f.budgetPlanned) * 100) : 0, overtime_hrs: f.otActual - f.otPlanned, post_weeks: f.postActual - f.postPlanned, cause: f.deltaCause },
    friction: Object.fromEntries(CATS.map((c) => [c, { rating: f.ratings[c], tags: (f.ratings[c] ?? 5) <= 3 ? f.rootTags[c] ?? [] : [] }])),
    locations: f.locations.filter((l) => l.name), vendors: f.vendors.filter((v) => v.name),
    win: f.win, risk: f.risk, warning: f.warning,
  }), [f, p]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const form = { ...f, locations: f.locations.filter((l) => l.name.trim()), vendors: f.vendors.filter((v) => v.name.trim()) };
      setOut(await save({ data: { productionId: p.id, form } }));
      await qc.invalidateQueries({ queryKey: ["retro", p.id] });
      await qc.invalidateQueries({ queryKey: ["company_memory"] });
      toast.success(`Saved — ${p.client}'s MemoryBank has been updated`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not save."); } finally { setBusy(false); }
  };

  const num = (k: keyof RetroForm) => (
    <input className={field} type="number" min={0} value={f[k] as number} onChange={(e) => set(k, Math.max(0, +e.target.value) as never)} />
  );

  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-5">
        <section className="rounded-sm border border-border bg-card p-4">
          <h3 className="mb-3 font-display text-sm text-primary">1 · Project</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="space-y-1"><span className={label}>Type</span><select className={field} value={f.type} onChange={(e) => set("type", e.target.value)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="space-y-1"><span className={label}>Shoot days</span>{num("shootDays")}</label>
            <label className="space-y-1"><span className={label}>Crew size</span><select className={field} value={f.crewSize} onChange={(e) => set("crewSize", e.target.value)}>{SIZES.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label className="space-y-1"><span className={label}>Locations</span>{num("locationsCount")}</label>
          </div>
        </section>

        <section className="rounded-sm border border-border bg-card p-4">
          <h3 className="mb-3 font-display text-sm text-primary">2 · Planned vs actual</h3>
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-2 text-sm">
            <span /><span className={label}>Planned</span><span className={label}>Actual</span>
            <span>Budget (R)</span>{num("budgetPlanned")}{num("budgetActual")}
            <span>Overtime (hrs)</span>{num("otPlanned")}{num("otActual")}
            <span>Post (weeks)</span>{num("postPlanned")}{num("postActual")}
          </div>
          <label className="mt-3 block space-y-1"><span className={label}>Primary cause of difference</span>
            <select className={field} value={f.deltaCause} onChange={(e) => set("deltaCause", e.target.value)}>{CAUSES.map((c) => <option key={c}>{c}</option>)}</select></label>
        </section>

        <section className="rounded-sm border border-border bg-card p-4">
          <h3 className="mb-3 font-display text-sm text-primary">3 · Friction ratings</h3>
          <div className="space-y-3">
            {CATS.map((c) => (
              <div key={c}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">{c}</span>
                  <div className="flex">{[1, 2, 3, 4, 5].map((n) => (
                    <button type="button" key={n} aria-label={`${c} ${n} stars`} onClick={() => set("ratings", { ...f.ratings, [c]: n })}>
                      <Star className={`h-5 w-5 ${n <= (f.ratings[c] ?? 0) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </button>
                  ))}</div>
                </div>
                {(f.ratings[c] ?? 5) <= 3 && <div className="mt-1.5"><Pills opts={ROOT} value={f.rootTags[c] ?? []} onChange={(v) => set("rootTags", { ...f.rootTags, [c]: v })} /></div>}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-sm border border-border bg-card p-4">
          <h3 className="mb-3 font-display text-sm text-primary">4 · Locations & vendors</h3>
          {f.locations.map((l, i) => (
            <div key={`l${i}`} className="mb-3 space-y-1.5">
              <input className={field} placeholder="Location name" value={l.name} onChange={(e) => set("locations", f.locations.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <Pills opts={LOC_TAGS} value={l.tags} onChange={(v) => set("locations", f.locations.map((x, j) => j === i ? { ...x, tags: v } : x))} />
            </div>
          ))}
          <button type="button" className="mb-4 text-xs text-primary" onClick={() => set("locations", [...f.locations, { name: "", tags: [] }])}>+ Add location</button>
          {f.vendors.map((v, i) => (
            <div key={`v${i}`} className="mb-3 space-y-1.5">
              <input className={field} placeholder="Vendor or crew name" value={v.name} onChange={(e) => set("vendors", f.vendors.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <Pills opts={VEN_TAGS} value={v.tags} onChange={(t) => set("vendors", f.vendors.map((x, j) => j === i ? { ...x, tags: t } : x))} />
            </div>
          ))}
          <button type="button" className="text-xs text-primary" onClick={() => set("vendors", [...f.vendors, { name: "", tags: [] }])}>+ Add vendor</button>
        </section>

        <section className="rounded-sm border border-border bg-card p-4">
          <h3 className="mb-3 font-display text-sm text-primary">5 · Quick notes</h3>
          {([["win", "Top operational win"], ["risk", "Top risk / close call"], ["warning", "What should AI warn us about on the next similar shoot?"]] as const).map(([k, t]) => (
            <label key={k} className="mb-3 block space-y-1">
              <span className="flex justify-between"><span className={label}>{t}</span><span className="text-[11px] text-muted-foreground">{f[k].length}/280</span></span>
              <textarea className={`${field} min-h-16`} maxLength={280} value={f[k]} onChange={(e) => set(k, e.target.value)} />
            </label>
          ))}
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="rounded-sm border border-primary/50 bg-card p-4">
          {phase.learning ? (
            <p className="text-xs text-muted-foreground">
              The AI memory summary unlocks after your first {AI_LEARNING_PRODUCTIONS} productions{phase.position ? ` (this is production ${phase.position} of ${AI_LEARNING_PRODUCTIONS})` : ""}. Saving this review still teaches the AI about {p.client}.
            </p>
          ) : (
            <>
              <h3 className="mb-2 flex items-center gap-2 font-display text-sm text-primary"><Sparkles className="h-4 w-4" />AI Memory Summary</h3>
              {out?.lessons ? <p className="rounded-sm bg-primary/10 p-3 text-sm"><strong>Lessons learned:</strong> {out.lessons}</p>
                : <p className="text-xs text-muted-foreground">Save to generate the lessons-learned alert. It's added to {p.client}'s MemoryBank and used in future crew matching.</p>}
              <pre className="mt-3 max-h-80 overflow-auto rounded-sm bg-background p-2 text-[10px] leading-snug text-muted-foreground">{JSON.stringify(out?.payload && Object.keys(out.payload).length ? out.payload : preview, null, 2)}</pre>
            </>
          )}
          <button disabled={busy} className="mt-3 w-full rounded-sm bg-primary px-4 py-2 font-display text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? "Learning…" : existing.data ? "Update review" : "Save review & teach AI"}
          </button>
        </div>
      </aside>
    </form>
  );
}
