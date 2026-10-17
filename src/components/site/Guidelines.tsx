import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import type { Production } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

// Guidelines for posts on a job. Only admins can write them; producers can hide them from the job.
export function Guidelines({ p, isProducer }: { p: Production; isProducer: boolean }) {
  const qc = useQueryClient();
  const { session } = useSession();
  const isAdmin = useRole(session?.user.id).data === "admin";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.postRules ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("productions").update({ post_rules: text.trim() }).eq("id", p.id);
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success("Guidelines saved");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["productions"] });
  }

  async function setHidden(hidden: boolean) {
    const { error } = await supabase.from("productions").update({ post_rules_hidden: hidden }).eq("id", p.id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["productions"] });
  }

  if (p.postRulesHidden && !isProducer) return null;

  const hideToggle = isProducer && (
    <button onClick={() => setHidden(!p.postRulesHidden)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
      {p.postRulesHidden ? "Show guidelines" : "Hide guidelines"}
    </button>
  );

  if (p.postRulesHidden) {
    return (
      <div className="flex items-center justify-between rounded-sm border border-dashed border-border bg-card px-4 py-3">
        <span className="text-xs text-muted-foreground">Guidelines are hidden from the job.</span>
        {hideToggle}
      </div>
    );
  }

  if (editing && isAdmin) {
    return (
      <div className="space-y-2 rounded-sm border border-primary/40 bg-primary/5 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guidelines</div>
        <textarea rows={4} className={`${input} w-full`} placeholder="e.g. Tag the production in every photo. Keep posts about the work." value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <button disabled={busy} onClick={save} className={btn}>{busy ? "Saving…" : "Save guidelines"}</button>
          <button onClick={() => setEditing(false)} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guidelines</div>
        <div className="flex items-center gap-3">
          {isAdmin && <button onClick={() => { setText(p.postRules ?? ""); setEditing(true); }} className="text-xs font-semibold text-primary hover:underline">{p.postRules ? "Edit" : "Set guidelines"}</button>}
          {hideToggle}
        </div>
      </div>
      {p.postRules
        ? <p className="mt-2 whitespace-pre-wrap text-sm">{p.postRules}</p>
        : <p className="mt-2 text-sm text-muted-foreground">Provide guidelines for posts.</p>}
    </div>
  );
}
