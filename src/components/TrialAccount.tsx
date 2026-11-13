import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
export function useAccountStage() {
 const { session } = useSession();
 return useQuery({ queryKey: ["account-stage", session?.user.id], enabled: !!session,
 queryFn: async () => { const { data, error } = await supabase.from("profiles").select("account_stage").eq("id",session!.user.id).single(); if(error)throw error; return data.account_stage; } });
}
export function TrialBanner() {
 const stage=useAccountStage();
 return stage.data === "mvp" ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded border border-primary/30 bg-primary/5 p-3 text-sm"><span><b>MVP trial</b> · Your trial workspace is separate from other companies' data.</span><Link to="/profile" className="font-semibold text-primary underline">Account options</Link></div> : null;
}
export function TrialAccount() {
 const stage=useAccountStage();const { session }=useSession();const qc=useQueryClient();const [confirm,setConfirm]=useState(false);const [busy,setBusy]=useState(false);
 if(!session || stage.data !== "mvp")return null;
 async function commit(){setBusy(true);try{const {error}=await supabase.from("profiles").update({account_stage:"committed"}).eq("id",session!.user.id).select("id").single();if(error)throw error;await qc.invalidateQueries();toast.success("Account committed. Your trial data has been kept.");}catch(e){toast.error(friendlyError(e));}finally{setBusy(false);}}
 return <section className="border-t border-border p-4 text-sm"><h2 className="font-semibold text-primary">MVP trial account</h2><p className="my-2 text-muted-foreground">Commit when you are ready to use the product. Your productions, documents and other trial data stay saved until you choose to delete them. Committing does not purchase a membership, charge your card or change your account roles.</p>{confirm ? <div className="flex gap-2"><button disabled={busy} onClick={commit} className="rounded bg-primary px-3 py-2 text-primary-foreground">{busy ? "Saving…" : "Confirm and keep my data"}</button><button disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button></div> : <button onClick={()=>setConfirm(true)} className="rounded bg-primary px-3 py-2 text-primary-foreground">Commit to using Book a Crew</button>}</section>;
}
