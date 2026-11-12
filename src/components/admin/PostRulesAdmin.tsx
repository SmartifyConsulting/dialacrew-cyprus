import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRole } from "@/lib/auth";
import { Panel } from "@/components/AppShell";
import { friendlyError } from "@/lib/errors";

export function PostRulesAdmin() {
  const { session } = useSession(); const role = useRole(session?.user.id); const qc = useQueryClient();
  const [producer, setProducer] = useState(""); const target = producer || session?.user.id;
  const producers = useQuery({ queryKey:["post-rule-producers"], enabled:role.data === "admin", queryFn:async()=> {
    const roles=await supabase.from("user_roles").select("user_id").eq("role","producer"); if(roles.error)throw roles.error;
    if(!roles.data?.length)return [];
    const result=await supabase.from("profiles").select("id,full_name,email").in("id",roles.data.map(r=>r.user_id));if(result.error)throw result.error;return result.data??[];
  }});
  const settings=useQuery({queryKey:["producer-post-rules",target],enabled:!!target,queryFn:async()=>{
    const result=await supabase.from("producer_post_rules").select("*").eq("producer_id",target!).maybeSingle();if(result.error)throw result.error;return result.data;
  }});
  const [rules,setRules]=useState(""); const [all,setAll]=useState(false); const [busy,setBusy]=useState(false);
  useEffect(()=>{setRules(settings.data?.rules??"");setAll(!!settings.data?.apply_to_all);},[settings.data,target]);
  async function save(){if(!target)return;if(all&&!rules.trim()){toast.error("Enter the rules before applying them to every production");return;}setBusy(true);
    const {error}=await supabase.from("producer_post_rules").upsert({producer_id:target,rules:rules.trim(),apply_to_all:all,updated_at:new Date().toISOString()});setBusy(false);
    if(error){toast.error(friendlyError(error));return;}await qc.invalidateQueries({queryKey:["producer-post-rules"]});toast.success("Post rules saved");
  }
  return <Panel title="Producer post rules"><div className="space-y-3 p-4 text-sm">
    {role.data==="admin"&&<label className="block">Producer<select className="mt-1 w-full rounded border border-input bg-background p-2" value={target??""} onChange={e=>setProducer(e.target.value)}><option value={session?.user.id}>My account</option>{producers.data?.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email}</option>)}</select></label>}
    {settings.isError&&<p role="alert">Could not load producer rules.</p>}
    <label className="block">Rules of engagement<textarea rows={7} className="mt-1 w-full rounded border border-input bg-background p-2" value={rules} onChange={e=>setRules(e.target.value)} /></label>
    <label className="flex items-center gap-2"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)} />Apply these rules to every production owned by this producer</label>
    <p className="text-xs text-muted-foreground">If this is off, each production can use the producer default, its own rules, or no rules. Existing custom text is preserved.</p>
    <button className="rounded bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50" disabled={busy||settings.isPending||settings.isError} onClick={save}>Save post rules</button>
  </div></Panel>;
}
