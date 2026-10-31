import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";

type Negotiation = {id:string;booking_id:string;crew_id:string;latest_rate:number;latest_by:"crew"|"producer";status:string;agreed_rate:number|null;crew_members?:{name:string}|null};
const money=(n:number)=>new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"}).format(n);

export function GigNegotiation({bookingId,role,offeredRate,productionId}: {bookingId:string;role:"crew"|"producer";offeredRate:number;productionId?:string}) {
 const qc=useQueryClient();
 const [rate,setRate]=useState("");
 const [busy,setBusy]=useState(false);
 const [ack,setAck]=useState(false);
 const me=useQuery({queryKey:["negotiation-my-crew"],enabled:role==="crew",queryFn:async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)return null;const {data,error}=await supabase.from("crew_members").select("id,day_rate").eq("user_id",user.id).maybeSingle();if(error)throw error;return data;}});
 const negotiations=useQuery({queryKey:["gig-negotiations",bookingId],queryFn:async()=>{const {data,error}=await supabase.from("gig_negotiations").select("*").eq("booking_id",bookingId).order("created_at",{ascending:false});if(error)throw error;return (data??[]) as Negotiation[];}});
 const mine=negotiations.data?.find(n=>n.crew_id===me.data?.id);
 const current=role==="crew"? (mine?[mine]:[]):negotiations.data??[];
 async function act(crewId:string,action:"counter"|"accept"|"decline",n?:Negotiation){
   const number=Number(rate);if(action==="counter"&&(!rate||!Number.isFinite(number)||number<=0)){toast.error("Enter a valid day rate");return;}
   const acceptedRate=action==="accept"?Number(n?.latest_rate??0):number;
   const below=role==="crew"&&Number(me.data?.day_rate??0)>0&&acceptedRate<Number(me.data?.day_rate??0);
   if((action==="accept"||action==="counter")&&below&&!ack){toast.error("Please acknowledge the below-usual rate first");return;}
   setBusy(true);
   const {error}=await supabase.rpc("gig_negotiate" as any,{p_booking_id:bookingId,p_crew_id:crewId,p_action:action,p_rate:action==="counter"?number:null,p_ack_below_usual:below&&ack});
   setBusy(false);if(error){toast.error(friendlyError(error));return;}
   toast.success(action==="accept"?"Rate agreed — booking reserved pending job terms":action==="counter"?"Counter-offer sent":"Offer declined");
   setRate("");setAck(false);
   for(const key of [["gig-negotiations",bookingId],["open-gigs"],["bookings"],["audit",productionId]])void qc.invalidateQueries({queryKey:key});
 }
 if(role==="crew"&&!me.data?.id)return null;
 return <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
  {role==="crew"&&<div className="text-muted-foreground">Offered: {money(offeredRate)} / day · Your usual rate: {money(Number(me.data?.day_rate??0))} / day</div>}
  {current.map(n=><div key={n.id} className="space-y-2 border-b border-border pb-2">
   <div><strong>{role==="producer"?`Crew ${n.crew_id}`:"Your negotiation"}</strong> · {n.status.replaceAll("_"," ")} · Latest {money(Number(n.latest_rate))} from {n.latest_by}</div>
   {((role==="crew"&&n.status==="pending_crew")||(role==="producer"&&n.status==="pending_producer"))&&<div className="space-y-2">
    {role==="crew"&&Number(n.latest_rate)<Number(me.data?.day_rate??0)&&<label className="flex items-start gap-2"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>I acknowledge that {money(Number(n.latest_rate))} is below my usual day rate of {money(Number(me.data?.day_rate??0))}, and I agree to accept this lower rate for this job.</span></label>}
    <div className="flex flex-wrap gap-2"><button disabled={busy||(role==="crew"&&Number(n.latest_rate)<Number(me.data?.day_rate??0)&&!ack)} onClick={()=>act(n.crew_id,"accept",n)} className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50">Accept {money(Number(n.latest_rate))}</button><button disabled={busy} onClick={()=>act(n.crew_id,"decline",n)} className="rounded border px-2 py-1">Decline</button></div>
   </div>}
   {n.status==="accepted"&&<div className="font-semibold">Agreed: {money(Number(n.agreed_rate))} / day</div>}
  </div>)}
  {(role==="crew"?(!mine||mine.status==="pending_crew"):current.some(n=>n.status==="pending_producer"))&&<div className="space-y-2">
   {role==="crew"&&!!rate&&Number(rate)<Number(me.data?.day_rate??0)&&<label className="flex items-start gap-2 text-amber-700 dark:text-amber-400"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/><span>I acknowledge my proposed rate of {money(Number(rate))} is below my usual rate of {money(Number(me.data?.day_rate??0))}.</span></label>}
   <div className="flex flex-wrap items-center gap-2"><input aria-label="Counter-offer day rate" type="number" min="1" step="0.01" value={rate} onChange={e=>setRate(e.target.value)} placeholder="Your proposed day rate" className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1"/>
   {role==="crew"?<button disabled={busy} onClick={()=>act(me.data!.id,"counter",mine)} className="rounded border border-primary px-2 py-1 text-primary">Send counter-offer</button>:current.filter(n=>n.status==="pending_producer").map(n=><button key={n.id} disabled={busy} onClick={()=>act(n.crew_id,"counter",n)} className="rounded border border-primary px-2 py-1 text-primary">Counter crew {n.crew_id.slice(0,6)}</button>)}
   </div>
  </div>}
  {role==="crew"&&mine?.status==="pending_producer"&&<p className="text-muted-foreground">Waiting for the producer to respond.</p>}
 </div>;
}
