import {getEmailSender} from "./email-sender-core.ts";
import {normalizeInvitationEmail} from "./invitation-input.ts";

export type AnnouncementDispatch={id:string;lease:string;email:string;subject:string;message:string;unsubscribeToken:string;gym:string};
export type AnnouncementDelivery={status:"accepted"|"failed"|"unconfirmed"|"skipped";id:string|null;code:string|null;retryAfter:number};
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function announcementRetryAfter(value:string|null){const seconds=value&&/^\d+$/.test(value)?Number(value):value?Math.ceil((Date.parse(value)-Date.now())/1000):60;return Math.min(86400,Math.max(60,Number.isFinite(seconds)?seconds:60));}
function config(){const sender=getEmailSender(),key=process.env.RESEND_API_KEY;if(!key||!sender||sender.from.address!=="hello@ravoge.com"||sender.replyToAddress!=="hello@ravoge.com")throw Error("not_configured");return {key,sender};}
export function announcementEmailConfigured(){try{config();return true;}catch{return false;}}
async function providerRead(path:string){const {key}=config();return fetch(`https://api.resend.com${path}`,{headers:{Authorization:`Bearer ${key}`},cache:"no-store",signal:AbortSignal.timeout(8000)});}
class PreflightError extends Error {readonly retryAfter:number;constructor(code:string,retryAfter:number){super(code);this.retryAfter=retryAfter;}}
export async function checkAnnouncementRecipient(email:string,wait=pause):Promise<"clear"|"suppressed"|"unsubscribed">{
 if(!normalizeInvitationEmail(email))throw Error("invalid_recipient");
 const suppression=await providerRead(`/suppressions/${encodeURIComponent(email)}`);
 if(suppression.ok){const data=await suppression.json();if(data.email?.toLowerCase()!==email)throw Error("suppression_response_unconfirmed");return "suppressed";}
 if(suppression.status!==404)throw new PreflightError(`suppression_check_${suppression.status}`,announcementRetryAfter(suppression.headers.get("retry-after")));
 await wait(650);
 const contact=await providerRead(`/contacts/${encodeURIComponent(email)}`);
 if(contact.status===404)return "clear";
 if(!contact.ok)throw new PreflightError(`preference_check_${contact.status}`,announcementRetryAfter(contact.headers.get("retry-after")));
 const data=await contact.json();if(data.email?.toLowerCase()!==email||typeof data.unsubscribed!=="boolean")throw Error("preference_response_unconfirmed");
 return data.unsubscribed?"unsubscribed":"clear";
}
export async function sendAnnouncementEmail(input:AnnouncementDispatch,eligible:()=>Promise<boolean>,wait=pause):Promise<AnnouncementDelivery>{
 const fail=(status:AnnouncementDelivery["status"],code:string,retryAfter=60):AnnouncementDelivery=>({status,id:null,code,retryAfter});
 let sender:NonNullable<ReturnType<typeof getEmailSender>>,key:string;
 try{({sender,key}=config());}catch{return fail("failed","not_configured");}
 const email=normalizeInvitationEmail(input.email);
 if(!email||email!==input.email||!uuid.test(input.id)||!/^[0-9a-f]{64}$/.test(input.unsubscribeToken)||!input.subject.trim()||input.subject.length>160||/[\r\n]/.test(input.subject)||!input.message.trim()||input.message.length>10000)return fail("failed","invalid_message");
 try{
  const preference=await checkAnnouncementRecipient(email,wait);
  if(preference!=="clear")return fail("skipped",preference);
 }catch(error){const code=error instanceof Error?error.message:"preflight_unconfirmed";return fail("failed",/^(suppression_check|preference_check)_\d{3}$/.test(code)?code:"preflight_unconfirmed",error instanceof PreflightError?error.retryAfter:60);}
 await wait(650);
 if(!await eligible())return fail("skipped","access_or_preference_changed");
 const unsubscribe=`https://ravoge.com/email/announcements/unsubscribe?token=${input.unsubscribeToken}`;
 const oneClickUnsubscribe=`https://ravoge.com/api/announcements/unsubscribe?token=${input.unsubscribeToken}`;
 const text=`${input.gym}\n\n${input.message}\n\nYou opted in to gym announcements. Unsubscribe: ${unsubscribe}`;
 const html=`<!doctype html><html><body style="background:#050606;color:#f6f5f3;font-family:Arial,sans-serif"><div style="max-width:560px;margin:auto;padding:28px"><p style="letter-spacing:.2em">RAVOGE</p><h1>${escape(input.subject)}</h1><p>${escape(input.gym)}</p><div style="white-space:pre-wrap;line-height:1.6">${escape(input.message)}</div><p style="font-size:13px;margin-top:28px">You opted in to gym announcements. <a style="color:#e4bb70" href="${unsubscribe}">Unsubscribe</a></p></div></body></html>`;
 try{
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":`ravoge-announcement/${input.id}`},body:JSON.stringify({from:sender.fromHeader,reply_to:sender.replyToAddress,to:[email],subject:input.subject,html,text,headers:{"List-Unsubscribe":`<${oneClickUnsubscribe}>`,"List-Unsubscribe-Post":"List-Unsubscribe=One-Click"}}),signal:AbortSignal.timeout(15000)});
  const retryAfter=announcementRetryAfter(response.headers.get("retry-after"));
  if(response.status===429)return fail("failed","provider_429",retryAfter);
  if(response.status>=500)return fail("unconfirmed","provider_5xx",retryAfter);
  if(!response.ok)return fail("failed",`provider_${response.status}`);
  let data:{id?:unknown};try{data=await response.json();}catch{return fail("unconfirmed","response_unconfirmed");}
  if(typeof data.id!=="string"||!uuid.test(data.id))return fail("unconfirmed","response_unconfirmed");
  return {status:"accepted",id:data.id,code:null,retryAfter:60};
 }catch{return fail("unconfirmed","network_unconfirmed");}
}
export async function getAnnouncementDeliveryEvent(providerId:string,email:string){
 if(!uuid.test(providerId)||!normalizeInvitationEmail(email))throw Error("invalid_recipient");
 const response=await providerRead(`/emails/${providerId}`);
 if(!response.ok)throw Error(`delivery_check_${response.status}`);
 const data=await response.json();
 if(data.id!==providerId||!Array.isArray(data.to)||data.to.length!==1||data.to[0]?.toLowerCase()!==email||data.cc?.length||data.bcc?.length)throw Error("delivery_response_unconfirmed");
 return typeof data.last_event==="string"?data.last_event:"unknown";
}
