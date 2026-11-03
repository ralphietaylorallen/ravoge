import type {SupabaseClient} from "@supabase/supabase-js";
import {sendAnnouncementEmail,type AnnouncementDispatch} from "./announcement-email-core.ts";

// Runs with an ordinary, verified Owner session. Every RPC rechecks current
// membership; no service-role credential or persisted session is needed.
export async function runAnnouncementQueue(db:SupabaseClient,jobId:string,options:{send?:typeof sendAnnouncementEmail;wait?:(ms:number)=>Promise<void>;now?:()=>number;budgetMs?:number}={}){
 const send=options.send??sendAnnouncementEmail,wait=options.wait??(ms=>new Promise(resolve=>setTimeout(resolve,ms))),now=options.now??Date.now;
 const started=now(),budget=options.budgetMs??480000;
 while(now()-started<budget){
  const claim=await db.rpc("claim_announcement_recipient",{job_id:jobId});
  if(claim.error)return {continuation:false,code:"claim_unconfirmed"};
  if(!claim.data)return {continuation:false,code:null};
  if(claim.data.busy){await wait(2000);continue;}
  const recipient=claim.data as AnnouncementDispatch;
  let result;
  try{result=await send(recipient,async()=>{const check=await db.rpc("announcement_dispatch_eligible",{recipient_id:recipient.id,claim_token:recipient.lease});if(check.error)throw Error("eligibility_unconfirmed");return check.data===true;});}
  catch{return {continuation:false,code:"dispatch_unconfirmed"};}
  const finish=await db.rpc("finish_announcement_recipient",{recipient_id:recipient.id,claim_token:recipient.lease,result_status:result.status,provider_message_id:result.id,result_code:result.code,retry_after_seconds:result.retryAfter});
  if(finish.error)return {continuation:false,code:"result_unconfirmed"};
  // Stop on provider/configuration ambiguity. Retrying failures is an explicit,
  // targeted Owner action; the background worker never resends accepted mail.
  if(result.status==="unconfirmed"||result.status==="failed")return {continuation:false,code:result.code};
  await wait(1100);
 }
 return {continuation:true,code:null};
}
