import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Emergency = {physical_address:string;emergency_contact_name:string;emergency_contact_relationship:string;emergency_contact_phone:string;medical_aid_provider:string;medical_aid_number:string;medical_conditions:string;share_medical_with_producers:boolean;consented_at:string|null};
const empty:Emergency={physical_address:"",emergency_contact_name:"",emergency_contact_relationship:"",emergency_contact_phone:"",medical_aid_provider:"",medical_aid_number:"",medical_conditions:"",share_medical_with_producers:false,consented_at:null};
const labels:{key:keyof Emergency;label:string}[]=[{key:"physical_address",label:"Your physical home address"},{key:"emergency_contact_name",label:"Emergency contact full name"},{key:"emergency_contact_relationship",label:"Relationship to emergency contact"},{key:"emergency_contact_phone",label:"Emergency contact telephone"},{key:"medical_aid_provider",label:"Medical aid / health insurer"},{key:"medical_aid_number",label:"Medical aid membership / policy number"}];
export function CrewEmergencySettings({crewId}:{crewId:string}){
 const qc=useQueryClient();const [draft,setDraft]=useState<Partial<Emergency>>({});const [busy,setBusy]=useState(false);
 const q=useQuery({queryKey:["crew-emergency-private",crewId],queryFn:async()=>{const {data,error}=await supabase.from("crew_emergency_details" as any).select("*").eq("crew_id",crewId).maybeSingle();if(error)throw error;return data as Emergency|null;}});
 const v={...empty,...q.data,...draft};
 async function save(){
  if(!v.physical_address.trim()||!v.emergency_contact_name.trim()||!v.emergency_contact_phone.trim()){toast.error("Please enter your physical address and emergency contact name and telephone");return;}
  setBusy(true);const payload={...v,crew_id:crewId,consented_at:v.share_medical_with_producers?(v.consented_at??new Date().toISOString()):null,updated_at:new Date().toISOString()};
  const {error}=await supabase.from("crew_emergency_details" as any).upsert(payload,{onConflict:"crew_id"});setBusy(false);
  if(error){toast.error(error.message);return;}setDraft({});void qc.invalidateQueries({queryKey:["crew-emergency-private",crewId]});toast.success("Private emergency information saved");
 }
 return <section className="space-y-4 rounded-md border border-border bg-card p-4">
  <div><h2 className="font-bold">Emergency and medical information</h2><p className="text-xs text-muted-foreground">Emergency contact and medical aid details are available to the authorised producer of a production you are booked on. Your medical conditions are private unless you explicitly consent below. You can withdraw consent at any time.</p></div>
  <div className="grid gap-3 sm:grid-cols-2">{labels.map(f=><label key={f.key} className="text-xs font-semibold">{f.label}<input className="mt-1 w-full rounded border border-input bg-background p-2 text-sm" value={String(v[f.key]??"")} onChange={e=>setDraft(d=>({...d,[f.key]:e.target.value}))}/></label>)}</div>
  <label className="block text-xs font-semibold">Medical conditions or emergency instructions (optional)<textarea rows={4} className="mt-1 w-full rounded border border-input bg-background p-2 text-sm" value={v.medical_conditions} onChange={e=>setDraft(d=>({...d,medical_conditions:e.target.value}))} placeholder="Only share what could help during an emergency"/></label>
  <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm"><input type="checkbox" checked={v.share_medical_with_producers} onChange={e=>setDraft(d=>({...d,share_medical_with_producers:e.target.checked,consented_at:e.target.checked?new Date().toISOString():null}))}/><span>I give ongoing consent for the medical conditions entered above to be shared with authorised producers on any production where I am booked, for emergency preparedness. This consent is given once during profile setup, not separately for each job. I may withdraw it at any time by unchecking and saving.</span></label>
  <button disabled={busy||q.isLoading} onClick={save} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?"Saving…":"Save emergency details"}</button>
 </section>;
}
export function ProducerCrewEmergency({crewId,productionId}:{crewId:string;productionId:string}){
 const [open,setOpen]=useState(false);
 const q=useQuery({queryKey:["producer-crew-emergency",crewId,productionId],enabled:open,queryFn:async()=>{const {data,error}=await supabase.rpc("crew_emergency_for_production" as any,{p_crew_id:crewId,p_production_id:productionId});if(error)throw error;return (data?.[0]??null) as Omit<Emergency,"share_medical_with_producers"|"consented_at">&{medical_shared:boolean};}});
 return <div><button className="rounded border border-border px-2 py-1 text-xs text-primary" onClick={()=>setOpen(x=>!x)}>{open?"Hide emergency details":"Emergency details"}</button>{open&&<div className="mt-2 space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs">{q.isLoading?"Loading private emergency details…":q.error?<p className="text-destructive">{q.error.message}</p>:!q.data?"Not provided":<><p><strong>Address:</strong> {q.data.physical_address||"Not provided"}</p><p><strong>Emergency contact:</strong> {q.data.emergency_contact_name||"Not provided"} ({q.data.emergency_contact_relationship||"relationship not provided"}) · {q.data.emergency_contact_phone||"No phone"}</p><p><strong>Medical aid:</strong> {q.data.medical_aid_provider||"Not provided"} · {q.data.medical_aid_number||"No number"}</p><p><strong>Medical conditions:</strong> {q.data.medical_shared?(q.data.medical_conditions||"None supplied"):"Not shared — consent not granted"}</p></>}</div>}</div>;
}
