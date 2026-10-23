import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
export function parseTrainingSession(raw:unknown){
  const body=raw as {readiness?:unknown;painNote?:unknown;painReviewed?:unknown};
  if(!body||!Array.isArray(body.readiness)||body.readiness.length!==5||body.readiness.some(n=>!Number.isInteger(n)||n<1||n>5))throw new Error("Answer today’s five questions before generating.");
  const painNote=typeof body.painNote==="string"?body.painNote.trim():"";
  if(painNote.length>1000)throw new Error("Keep the pain update under 1,000 characters.");
  if((painNote||body.readiness[2]<=2)&&body.painReviewed!==true)throw new Error("Review today’s discomfort and update any needed intake restrictions.");
  return {answers:body.readiness as number[],painNote};
}
export async function prepareTrainingSession(supabase:SupabaseClient,clientId:string,raw:unknown){
  const session=parseTrainingSession(raw);
  const acknowledged=(raw as {intakeReviewed?:unknown}).intakeReviewed===true;
  const {data:readiness,error:readinessError}=await supabase.rpc("get_workout_generation_readiness",{target_client_user_id:clientId});
  if(readinessError)throw new Error("The saved intake could not be loaded.");
  if(readiness?.needsSafetyReview&&!acknowledged)throw new Error("Review the updated intake and confirm its restrictions below.");
  const {data:id,error}=await supabase.rpc("submit_training_readiness",{target_client_user_id:clientId,target_workout_id:null,responses:session.answers,pain_note:session.painNote||null});
  if(error||typeof id!=="string")throw new Error("Today’s answers could not be saved. Refresh and try again.");
  const {error:reviewError}=await supabase.rpc("review_training_readiness",{target_checkin_id:id,decision:"accepted",response:"Coach requested a new draft after entering today’s five readiness answers. Adapt to current readiness; all intake and injury restrictions remain enforced."});
  if(reviewError)throw new Error("Today’s check-in could not be confirmed. Try again.");
  if(readiness?.needsSafetyReview&&readiness.intakeId){
    const {error:safetyError}=await supabase.rpc("confirm_intake_generation_safety",{target_intake_id:readiness.intakeId});
    if(safetyError)throw new Error("Review the updated intake restrictions before generating.");
  }
}
