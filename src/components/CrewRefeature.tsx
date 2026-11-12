import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useRole } from "@/lib/auth";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { friendlyError } from "@/lib/errors";

export function CrewRefeature() {
  const pendingOperation=useRef<string|null>(null);
  const {session}=useSession();const role=useRole(session?.user.id);const qc=useQueryClient();const [busy,setBusy]=useState(false);
  const settings=useQuery({queryKey:["refeature-price"],queryFn:async()=>{const {data,error}=await supabase.from("platform_settings").select("value").eq("key","crew_refeature_price_usd").maybeSingle();if(error)throw error;return Number(data?.value??0);}});
  const profile=useQuery({queryKey:["my-feature-status",session?.user.id],enabled:!!session,queryFn:async()=>{const {data,error}=await supabase.from("profiles").select("social_opt_in,spotlight_featured_at").eq("id",session!.user.id).single();if(error)throw error;return data;}});
  if(role.data!=="crew")return null;
  async function buy(){if(busy)return;const price=settings.data??0;if(!(price>0))return;
    if(!await confirmDialog(`Use $${price.toFixed(2)} from your AI balance to feature your crew profile again?`))return;
    setBusy(true);const {error}=await supabase.rpc("buy_crew_refeature",{p_operation:pendingOperation.current??(pendingOperation.current=crypto.randomUUID()),p_expected_price_micros:Math.ceil(price*1_000_000)});setBusy(false);
    if(error){toast.error(friendlyError(error));return;}pendingOperation.current=null;await Promise.all([qc.invalidateQueries({queryKey:["my-feature-status"]}),qc.invalidateQueries({queryKey:["ai-balance"]}),qc.invalidateQueries({queryKey:["personal-ai-ledger"]}),qc.invalidateQueries({queryKey:["crew-travel-status"]})]);toast.success("Your crew profile is featured again");
  }
  return <div className="space-y-2 border-t border-border p-4 text-sm"><h3 className="font-semibold">Feature your crew profile again</h3>
    {profile.data?.spotlight_featured_at&&<p className="text-xs text-muted-foreground">Last featured: {new Date(profile.data.spotlight_featured_at).toLocaleString()}</p>}
    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!profile.data?.social_opt_in} disabled={!profile.isSuccess} onChange={async e=>{const {error}=await supabase.from("profiles").update({social_opt_in:e.target.checked}).eq("id",session!.user.id);if(error){toast.error(friendlyError(error));return;}await profile.refetch();}} />I consent to my crew profile being featured.</label>
    <button disabled={busy||!profile.data?.social_opt_in||!(settings.data!>0)} onClick={buy} className="rounded bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">Re-feature profile{settings.data!>0?` — $${settings.data!.toFixed(2)} from AI balance`:""}</button>
    {settings.isSuccess&&!(settings.data>0)&&<p className="text-xs text-muted-foreground">Paid re-featuring is not available until an administrator sets the price.</p>}
    {(profile.isError||settings.isError)&&<p role="alert" className="text-xs">Could not load re-featuring settings.</p>}
  </div>;
}
