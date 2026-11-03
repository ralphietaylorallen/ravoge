import {createClient} from "@supabase/supabase-js";
import {getSupabaseEnvironment} from "../../lib/supabase/env.ts";
import {announcementEmailConfigured} from "../../lib/announcement-email-core.ts";
import {runAnnouncementQueue} from "../../lib/announcement-worker.ts";

export const config={background:true};
export default async function handler(request:Request,context?:{deploy:{context:string};site:{id:string}}){
 // Preview secrets are intentionally absent. Never send from preview/local.
 if(request.method!=="POST"||context?.deploy.context!=="production"||context.site.id!=="c1bf03e6-2657-40fe-9584-f265ab9c2b94"||!announcementEmailConfigured())return;
 const authorization=request.headers.get("authorization");
 if(!authorization?.startsWith("Bearer ")||authorization.length>12000)return;
 try{
  const {jobId}=await request.json();
  if(typeof jobId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId))return;
  const {url,publishableKey}=getSupabaseEnvironment();
  if(url!=="https://kqdnljafaiohlijbgfld.supabase.co")return;
  const db=createClient(url,publishableKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
  const verified=await db.auth.getUser(authorization.slice(7));
  if(verified.error||!verified.data.user)return;
  // An expired/revoked/non-Owner session fails closed in the first RPC.
  const result=await runAnnouncementQueue(db,jobId);
  if(result.continuation)await fetch("https://ravoge.com/.netlify/functions/announcements-background",{method:"POST",headers:{Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({jobId}),signal:AbortSignal.timeout(10000)});
 }catch{ /* Saved leases become unconfirmed; never log tokens or blindly retry. */ }
}
