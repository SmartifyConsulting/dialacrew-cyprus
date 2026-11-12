import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AutoTranslatedText } from "@/components/AutoTranslatedText";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";
import { useRole, useSession } from "@/lib/auth";
import type { Production } from "@/lib/demo-data";

const input = "rounded-sm border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring min-w-0";
const btn = "rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50";

const DEFAULT_GUIDELINES = [
  "Keep posts about the work — wrap, call times, kit, location changes.",
  "Tag the production in any photos you share.",
  "No confidential client info, scripts, or unreleased footage.",
  "Be respectful — posts are visible to everyone on this job.",
].map((l) => `• ${l}`).join("\n");

// Guidelines for posts on a job. Only admins can write them; producers can hide them from the job.
export function Guidelines({ p, isProducer }: { p: Production; isProducer: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { session } = useSession();
  const settings = useQuery({ queryKey: ["producer-post-rules", p.createdBy], enabled: !!p.createdBy, queryFn: async () => { const { data, error } = await supabase.from("producer_post_rules").select("*").eq("producer_id",p.createdBy!).maybeSingle(); if(error)throw error;return data; } });
  const forced = !!settings.data?.apply_to_all && !!settings.data.rules.trim();
  const mode = p.postRulesMode ?? "custom";
  const effectiveRules = forced || mode === "producer" ? settings.data?.rules || DEFAULT_GUIDELINES : p.postRules || DEFAULT_GUIDELINES;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(p.postRules || DEFAULT_GUIDELINES);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("productions").update({ post_rules: text.trim() }).eq("id", p.id);
    setBusy(false);
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(t("guidelines.saved"));
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["productions"] });
  }

  async function setHidden(hidden: boolean) {
    const { error } = await supabase.from("productions").update({ post_rules_hidden: hidden }).eq("id", p.id);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["productions"] });
  }

  // "Don't show again" is a personal choice remembered on this device.
  const dismissKey = `guidelines-dismissed:${session?.user.id ?? "anon"}`;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(window.localStorage.getItem(dismissKey) === "1"); }, [dismissKey]);
  const dismiss = () => { window.localStorage.setItem(dismissKey, "1"); setDismissed(true); };

  if (dismissed && !editing && !forced) return null;
  if ((p.postRulesHidden || mode === "none") && !isProducer && !forced) return null;

  const hideToggle = isProducer && !forced && (
    <button onClick={() => setHidden(!p.postRulesHidden)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
      {p.postRulesHidden ? t("guidelines.show") : t("guidelines.hide")}
    </button>
  );

  if (p.postRulesHidden && !forced) {
    return (
      <div className="flex items-center justify-between rounded-sm border border-dashed border-border bg-card px-4 py-3">
        <span className="text-xs text-muted-foreground">{t("guidelines.hidden")}</span>
        {hideToggle}
      </div>
    );
  }

  if (editing && isProducer && !forced) {
    return (
      <div className="space-y-2 rounded-sm border border-primary/40 bg-primary/5 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("guidelines.title")}</div>
        <textarea rows={5} className={`${input} w-full`} placeholder={t("guidelines.placeholder")} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <button disabled={busy} onClick={save} className={btn}>{busy ? t("recovery.saving") : t("guidelines.save")}</button>
          <button onClick={() => setEditing(false)} className="rounded-sm border border-border px-3 py-2 text-xs font-semibold">{t("common.cancel")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("guidelines.title")}</div>
        <div className="flex items-center gap-3">
          {isProducer && !forced && mode === "custom" && <button onClick={() => { setText(p.postRules || DEFAULT_GUIDELINES); setEditing(true); }} className="text-xs font-semibold text-primary hover:underline">{t("common.edit")}</button>}
          {isProducer && !forced && <select aria-label="Post rules source" value={mode} className="rounded border border-input bg-background p-1 text-xs" onChange={async e => { const { error } = await supabase.from("productions").update({ post_rules_mode:e.target.value, post_rules_hidden:false }).eq("id",p.id).select("id").single();if(error){toast.error(friendlyError(error));return;}qc.invalidateQueries({queryKey:["productions"]}); }}><option value="custom">This production's rules</option><option value="producer">Producer default</option><option value="none">No rules</option></select>}
          {forced && <span className="text-xs text-muted-foreground">Producer rules apply to all productions</span>}
          {hideToggle}
          {!forced && <button onClick={dismiss} className="text-xs font-semibold text-muted-foreground hover:text-foreground">Don't show again</button>}
        </div>
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm">{mode === "none" && !forced ? "No post rules applied to this production." : effectiveRules !== DEFAULT_GUIDELINES ? <AutoTranslatedText text={effectiveRules} /> : t("guidelines.defaults")}</div>
    </div>
  );
}
