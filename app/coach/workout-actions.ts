"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

export type ExecutionState = { status: "idle" | "success" | "error"; message?: string };
const UUID = /^[0-9a-f-]{36}$/i;
const reasons = new Set(["failed_reps","too_heavy","form_breakdown","pain_discomfort","fatigue","coach_stopped","other"]);
function refresh(clientId: string, workoutId: string) {
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath(`/coach/clients/${clientId}/workouts/${workoutId}`);
  revalidatePath(`/owner/clients/${clientId}`);
  revalidatePath(`/client/workouts/${workoutId}`);
}
export async function recordSetAction(clientId: string, workoutId: string, setId: string, _state: ExecutionState, form: FormData): Promise<ExecutionState> {
  const { supabase } = await requireRole("coach");
  const result = String(form.get("result") ?? "");
  const reps = form.get("actualReps") === "" ? null : Number(form.get("actualReps"));
  const load = form.get("actualLoad") === "" ? null : Number(form.get("actualLoad"));
  const reason = String(form.get("reason") ?? "");
  const notes = String(form.get("notes") ?? "").trim();
  if (![clientId,workoutId,setId].every((id)=>UUID.test(id)) || !["complete","failed","not_completed"].includes(result) || (result === "failed" && !reasons.has(reason)) || notes.length>1000 || (reps!==null && (!Number.isInteger(reps)||reps<0||reps>1000)) || (load!==null && (!Number.isFinite(load)||load<0||load>100000))) return {status:"error",message:"Check the actual reps, weight, and result."};
  const { data, error } = await supabase.rpc("record_coach_workout_set", {target_set_id:setId,result,performed_reps:reps,performed_load:load,reason:result==="failed"?reason:null,notes:notes||null});
  if(error) return {status:"error",message:"Set could not be saved. Check the values and that this workout is still open."};
  refresh(clientId,workoutId);
  return {status:"success",message:data === "exceeded" ? "Saved · exceeded target" : "Set saved"};
}
export async function saveSessionAction(clientId: string, workoutId: string, _state: ExecutionState, form: FormData): Promise<ExecutionState> {
  const {supabase}=await requireRole("coach");
  const finish=form.get("intent")==="finish";
  const duration=Number(form.get("duration"));
  const notes=String(form.get("coachNotes")??"").trim();
  if(!UUID.test(workoutId)||!UUID.test(clientId)||notes.length>4000||(finish&&(!Number.isInteger(duration)||duration<1||duration>480))) return {status:"error",message:"Enter a duration between 1 and 480 minutes."};
  const {error}=await supabase.rpc("save_coach_workout_session",{target_workout_id:workoutId,coach_notes:notes||null,duration_minutes:finish?duration:null,finish});
  if(error) return {status:"error",message:"Record every set as complete, failed, or not completed before finishing the workout."};
  refresh(clientId,workoutId);
  return {status:"success",message:finish?"Workout complete":"Coach notes saved"};
}
export async function coachCheckinAction(clientId: string,_state: ExecutionState,form: FormData): Promise<ExecutionState> {
  const {supabase}=await requireRole("coach");
  const [kind,id]=String(form.get("context")??"").split(":");
  const answers=Array.from({length:8},(_,i)=>({position:i+1,answer:Number(form.get(`answer-${i+1}`))}));
  if(!UUID.test(clientId)||!UUID.test(id??"")||!["booking","workout"].includes(kind)||answers.some((a)=>!Number.isFinite(a.answer)||a.answer<1||a.answer>10)) return {status:"error",message:"Choose a session or workout and answer all eight questions."};
  const {error}=await supabase.rpc("record_coach_preworkout_checkin",{target_client_user_id:clientId,target_booking_id:kind==="booking"?id:null,target_workout_assignment_id:kind==="workout"?id:null,submitted_answers:answers});
  if(error) return {status:"error",message:"Check-in could not be saved. Confirm the session and Client assignment are active."};
  revalidatePath(`/coach/clients/${clientId}`);
  return {status:"success",message:"All eight responses saved for this session."};
}
