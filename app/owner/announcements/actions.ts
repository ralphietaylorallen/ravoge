"use server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {requireRole} from "@/lib/auth";
import {announcementEmailConfigured,checkAnnouncementRecipient,getAnnouncementDeliveryEvent} from "@/lib/announcement-email";
import type {AnnouncementJob,AnnouncementRecipient} from "@/lib/announcement-types";
export type AnnouncementState={status:"idle"|"error"|"success";message?:string;job?:AnnouncementJob;busy?:boolean;paused?:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function jobState(db:SupabaseClient,org:string,id:string):Promise<AnnouncementJob>{
 if(!uuid.test(id))throw Error("unavailable");
 const [{data:job,error},{data:rows,error:rowsError}]=await Promise.all([db.from("announcements").select("id,subject,message,audience,status,created_at").eq("id",id).eq("organization_id",org).single(),db.from("announcement_recipients").select("id,email,member_role,status,attempts,provider_id,accepted_at,delivered_at,provider_checked_at,retryable,error_code,first_attempt_at,next_attempt_at,lease_until").eq("announcement_id",id).eq("organization_id",org).order("created_at").order("id")]);
 if(error||rowsError||!job)throw Error("unavailable");return {...job,recipients:rows as AnnouncementRecipient[]};
}
export async function previewAnnouncementAction(nonce:string,form:FormData):Promise<AnnouncementState>{
 const {supabase,membership}=await requireRole("owner");
 const audience=String(form.get("audience")??""),subject=String(form.get("subject")??"").trim(),message=String(form.get("message")??"").trim();
 const selected=form.getAll("recipients").map(String);
 if(!uuid.test(nonce)||!['clients','team','selected'].includes(audience)||subject.length<1||subject.length>160||/[\r\n]/.test(subject)||message.length<1||message.length>10000||selected.length>500||selected.some(id=>!uuid.test(id)))return {status:"error",message:"Choose an audience and enter a valid subject and message."};
 try{
  const {data,error}=await supabase.rpc("create_announcement_preview",{request_nonce:nonce,audience_kind:audience,announcement_subject:subject,announcement_message:message,selected_user_ids:audience==="selected"?[...new Set(selected)]:[]});
  if(error||typeof data!=="string")return {status:"error",message:error?.message.startsWith("Remove recipient")?"Remove recipient email addresses from the subject and message.":"Preview could not be created. Choose active, opted-in members of this gym (up to 500). Refresh if their preferences changed."};
  return {status:"success",job:await jobState(supabase,membership.organization_id,data),message:"Review the exact message and recipient count before sending."};
 }catch{return {status:"error",message:"The preview could not be confirmed. No announcement was sent."};}
}
export async function queueAnnouncementAction(id:string,count:number):Promise<AnnouncementState>{
 const {supabase,membership}=await requireRole("owner");
 if(!uuid.test(id)||!Number.isInteger(count)||count<1||count>500)return {status:"error",message:"Review a valid preview before sending."};
 try{const {error}=await supabase.rpc("queue_announcement",{job_id:id,expected_count:count});if(error)return {status:"error",message:"The audience changed or this preview is unavailable. Create a new preview and confirm its recipient count."};revalidatePath("/owner/announcements");return {...await startWorker(supabase,id),job:await jobState(supabase,membership.organization_id,id)};}catch{return {status:"error",message:"Queue confirmation was interrupted. Refresh before retrying; the saved request prevents duplicate queueing."};}
}
export async function refreshAnnouncementAction(id:string):Promise<AnnouncementState>{const {supabase,membership}=await requireRole("owner");try{return {status:"success",job:await jobState(supabase,membership.organization_id,id)};}catch{return {status:"error",message:"This announcement is unavailable."};}}
async function startWorker(supabase:SupabaseClient,id:string){
 const host=(await headers()).get("host")?.toLowerCase();
 if(!["ravoge.com","www.ravoge.com"].includes(host??"")||!announcementEmailConfigured())return {status:"error" as const,paused:true,message:"Queue saved. Sending is not configured in this environment; no emails were sent."};
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)return {status:"error" as const,paused:true,message:"Queue saved. Sign in again to resume sending."};
 try{const result=await fetch("https://ravoge.com/.netlify/functions/announcements-background",{method:"POST",headers:{Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json"},body:JSON.stringify({jobId:id}),signal:AbortSignal.timeout(10000)});
 if(result.status!==202)throw Error("worker_unavailable");
 return {status:"success" as const,message:"Private emails queued for background sending. You may leave this page. Provider acceptance and delivery are reported separately."};
 }catch{return {status:"error" as const,paused:true,message:"Queue saved, but the background worker could not be started. Refresh status before resuming; accepted recipients will not be resent."};}
}
export async function resumeAnnouncementQueueAction(id:string):Promise<AnnouncementState>{
 const {supabase,membership}=await requireRole("owner");
 try{const job=await jobState(supabase,membership.organization_id,id);if(job.status!=="queued")throw Error("unconfirmed");return {...await startWorker(supabase,id),job};}catch{return {status:"error",message:"Confirmed announcement unavailable."};}
}
export async function retryAnnouncementFailuresAction(id:string):Promise<AnnouncementState>{
 const {supabase,membership}=await requireRole("owner");if(!uuid.test(id))return {status:"error",message:"Announcement unavailable."};
 try{const {data,error}=await supabase.rpc("retry_announcement_failures",{job_id:id});if(error)throw error;return {...(Number(data)>0?await startWorker(supabase,id):{status:"success" as const,message:"No failures are eligible to retry yet. Accepted recipients were not requeued."}),job:await jobState(supabase,membership.organization_id,id)};}catch{return {status:"error",message:"Retry could not be confirmed. Refresh before trying again."};}
}
export async function refreshAnnouncementDeliveryAction(id:string):Promise<AnnouncementState>{
 const {supabase,membership}=await requireRole("owner");
 try{const job=await jobState(supabase,membership.organization_id,id);let checked=0;for(const r of job.recipients.filter(r=>r.provider_id&&r.status==="accepted").sort((a,b)=>Date.parse(a.provider_checked_at??"1970-01-01")-Date.parse(b.provider_checked_at??"1970-01-01")).slice(0,10)){
  const event=await getAnnouncementDeliveryEvent(r.provider_id!,r.email);const result=await supabase.rpc("record_announcement_delivery",{recipient_id:r.id,provider_event:event});if(result.error)throw result.error;checked++;await new Promise(resolve=>setTimeout(resolve,650));
 }return {status:"success",job:await jobState(supabase,membership.organization_id,id),message:`Checked ${checked} provider records. Delivery is shown only when the provider confirms it; inbox receipt still requires the recipient's confirmation.`};}catch(error){const code=error instanceof Error&&/^delivery_check_\d{3}$/.test(error.message)?` (${error.message})`:"";return {status:"error",message:`Delivery status could not be refreshed${code}. Provider-accepted messages are not being reported as delivered.`};}
}
export async function checkAnnouncementTransportAction():Promise<AnnouncementState>{
 await requireRole("owner");if(!announcementEmailConfigured())return {status:"error",message:"Resend and the hello@ravoge.com sender must be configured for this environment."};
 try{await checkAnnouncementRecipient("hello@ravoge.com");return {status:"success",message:"Sender configured; Resend suppression and preference checks are accessible. No test email was sent."};}catch(error){const code=error instanceof Error&&/^(suppression_check|preference_check)_\d{3}$/.test(error.message)?error.message:"preflight_unconfirmed";return {status:"error",message:`Announcement sending needs attention (${code}). The protected Resend key needs access to send emails and read suppressions/contacts; delivery checks also require reading sent emails. Invitation sending is unchanged.`};}
}
