import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Panel } from "@/components/AppShell";
import { friendlyError } from "@/lib/errors";

export function RefeaturePricing() {
  const qc=useQueryClient(); const [price,setPrice]=useState("0"); const [busy,setBusy]=useState(false);
  const setting=useQuery({queryKey:["refeature-price"],queryFn:async()=>{const {data,error}=await supabase.from("platform_settings").select("value").eq("key","crew_refeature_price_usd").maybeSingle();if(error)throw error;return Number(data?.value??0);}});
  useEffect(()=>{if(setting.data!==undefined)setPrice(String(setting.data));},[setting.data]);
  async function save(){const usd=Number(price);if(!Number.isFinite(usd)||usd<0||usd>10000){toast.error("Enter a price from $0 to $10,000");return;}setBusy(true);const {error}=await supabase.from("platform_settings").upsert({key:"crew_refeature_price_usd",value:usd});setBusy(false);if(error){toast.error(friendlyError(error));return;}await qc.invalidateQueries({queryKey:["refeature-price"]});toast.success("Re-featuring price saved");}
  return <Panel title="Crew re-featuring price"><div className="space-y-3 p-4 text-sm">
    {setting.isError&&<p role="alert">Could not load the current price.</p>}
    <label className="block">Price (USD)<input type="number" min="0" max="10000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} className="ml-3 w-28 rounded border border-input bg-background p-2" /></label>
    <p className="text-xs text-muted-foreground">Zero disables paid re-featuring. Purchases use the member's AI balance and appear in their ledger. This features the profile in the app; external social-media publication is separate.</p>
    <button disabled={busy||setting.isPending||setting.isError} className="rounded bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50" onClick={save}>Save price</button>
  </div></Panel>;
}
