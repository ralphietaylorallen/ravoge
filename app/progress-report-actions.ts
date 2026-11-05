"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { LOG_UUID, logDate } from "@/lib/client-logs";

export type ProgressShareState={status:"idle"|"error"|"success";message:string;shareId?:string};
export async function shareProgressAction(role:"owner"|"coach",clientId:string,_state:ProgressShareState,form:FormData):Promise<ProgressShareState> {
 const {membership,supabase}=await requireRole(role);
 const end=String(form.get("end")??""),summary=String(form.get("summary")??"").trim(),priorities=String(form.get("priorities")??"").trim(),previous=String(form.get("previous")??"");
 let valid=false;try{logDate(end);valid=true;}catch{}
 if(!LOG_UUID.test(clientId)||!valid||summary.length>4000||priorities.length>2000||!summary||!priorities)
  return {status:"error",message:"Choose a valid period and add your summary and next priorities before sharing."};
 if(previous&&(!LOG_UUID.test(previous)||form.get("revision")!=="yes"))return {status:"error",message:"Confirm publishing a new revision. The previously shared report will be preserved."};
 const {data,error}=await supabase.rpc("share_six_week_report",{target_organization_id:membership.organization_id,target_client_id:clientId,end_date:end,summary,priorities,previous_share_id:previous||null});
 if(error||typeof data!=="string")return {status:"error",message:"Report could not be shared. Reload to check for a newer revision, then try again. Nothing already shared has been changed."};
 revalidatePath(`/${role}/clients/${clientId}/progress`);revalidatePath("/client/progress");revalidatePath("/client/profile");
 return {status:"success",message:"Progress report shared with this Client. Saved snapshots remain unchanged.",shareId:data};
}
