"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { activityInput, dailyInput, LOG_UUID, recoveryInput } from "@/lib/client-logs";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";

export type LogState = { status: "idle" | "success" | "error"; message: string };
const failure = (message: string): LogState => ({status:"error",message});
function refreshLogs(clientId: string,workoutId?: string) {
  revalidatePath("/client/my-day");
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath(`/owner/clients/${clientId}`);
  if(workoutId) revalidatePath(`/client/workouts/${workoutId}`);
}
async function checkDate(supabase: Awaited<ReturnType<typeof requireRole>>["supabase"],org: string,date: string) {
  const {data,error}=await supabase.from("organizations").select("timezone").eq("id",org).single();
  if(error) throw new Error("The gym date could not be checked. Please reload and try again.");
  if(date>localDateInTimeZone(new Date(),data.timezone??DEFAULT_ORGANIZATION_TIMEZONE)) throw new Error("Record completed activity using today or an earlier date.");
}
export async function saveDailyTotalsAction(_previous: LogState,data: FormData): Promise<LogState> {
  const {membership,supabase,userId}=await requireRole("client");
  let input: ReturnType<typeof dailyInput>;
  try {input=dailyInput(data);await checkDate(supabase,membership.organization_id,input.date);} catch(e) {return failure(e instanceof Error?e.message:"Review the daily total.");}
  const {error}=await supabase.rpc("save_client_daily_totals",{target_organization_id:membership.organization_id,target_date:input.date,total_calories:input.calories,total_protein:input.protein});
  if(error) return failure("Daily total could not be saved. Reload and try again.");
  refreshLogs(userId);
  return {status:"success",message:"Daily total saved."};
}
export async function saveActivityAction(id: string,_previous: LogState,data: FormData): Promise<LogState> {
  const {membership,supabase,userId}=await requireRole("client");
  if(!LOG_UUID.test(id)) return failure("Activity is unavailable. Reload and try again.");
  let input: ReturnType<typeof activityInput>;
  try {input=activityInput(data);await checkDate(supabase,membership.organization_id,input.date);} catch(e) {return failure(e instanceof Error?e.message:"Review the activity.");}
  const {data:saved,error}=await supabase.rpc("save_client_activity",{target_id:id,target_organization_id:membership.organization_id,target_date:input.date,activity:input.activity,minutes:input.minutes,activity_distance:input.distance,unit:input.unit,activity_effort:input.effort});
  if(error||!saved) return failure("Activity could not be saved. Check your access, reload and try again.");
  refreshLogs(userId);
  return {status:"success",message:"Activity saved."};
}
export async function deleteActivityAction(id: string,_previous: LogState,_data: FormData): Promise<LogState> {
  const {membership,supabase,userId}=await requireRole("client");
  if(!LOG_UUID.test(id)||_data.get("confirmed")!=="yes") return failure("Confirm the activity to delete.");
  const {data,error}=await supabase.from("client_activity_entries").delete().eq("id",id).eq("organization_id",membership.organization_id).eq("client_user_id",userId).select("id").maybeSingle();
  if(error||!data) return failure("Activity could not be deleted. Reload and try again.");
  refreshLogs(userId);
  return {status:"success",message:"Activity deleted."};
}
export async function saveRecoveryAction(workoutId: string,_previous: LogState,data: FormData): Promise<LogState> {
  const {membership,supabase,userId}=await requireRole("client");
  if(!LOG_UUID.test(workoutId)) return failure("Workout is unavailable.");
  let input: ReturnType<typeof recoveryInput>;
  try {input=recoveryInput(data);await checkDate(supabase,membership.organization_id,input.date);} catch(e) {return failure(e instanceof Error?e.message:"Review recovery.");}
  const {data:workout,error:workoutError}=await supabase.from("workout_assignments").select("id").eq("id",workoutId).eq("organization_id",membership.organization_id).eq("client_user_id",userId).eq("status","completed").maybeSingle();
  if(workoutError||!workout) return failure("Recovery can be added to your completed workouts only.");
  const {error}=await supabase.rpc("save_client_recovery",{target_organization_id:membership.organization_id,target_workout_id:workoutId,target_date:input.date,recovery:input.recovery,minutes:input.minutes,temperature:input.temperature,unit:input.unit});
  if(error) return failure("Recovery could not be saved. Reload and try again.");
  refreshLogs(userId,workoutId);
  return {status:"success",message:"Recovery saved. Training results are unchanged."};
}
