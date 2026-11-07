import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Panel } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";

const btn = "rounded-sm bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground";

const GIG_FEES = [
  { key: "gig_secure_fee", label: "Fee to secure a gig (R)", def: 50 },
  { key: "gig_penalty_fee", label: "Penalty for no-show or late withdrawal (R)", def: 500 },
  { key: "gig_notice_hours", label: "Notice needed to withdraw without penalty (hours)", def: 24 },
] as const;

export function GigFeesSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["gig-fees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("key,value").in("key", GIG_FEES.map((f) => f.key));
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.value)]));
    },
  });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const val = (k: string, d: number) => form[k] ?? String(data?.[k] ?? d);

  async function save() {
    const rows = GIG_FEES.map((f) => ({ key: f.key, value: Number(val(f.key, f.def)) }));
    if (rows.some((r) => !Number.isFinite(r.value) || r.value < 0)) { toast.error("Enter amounts of 0 or more"); return; }
    setSaving(true);
    const { error } = await supabase.from("platform_settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Gig fees saved"); setForm({}); qc.invalidateQueries({ queryKey: ["gig-fees"] });
  }

  return (
    <Panel title="Grab a Gig fees and penalties">
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">New gigs use the securing fee in place when they are posted. Penalties apply to withdrawals and no-shows from now on.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {GIG_FEES.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <input type="number" min={0} className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2"
                value={val(f.key, f.def)} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </label>
          ))}
        </div>
        <button onClick={save} disabled={saving} className={btn}>{saving ? "Saving…" : "Save changes"}</button>
      </div>
    </Panel>
  );
}

