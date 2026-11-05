import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportRecord, ReportExercise, SessionFacts, SessionScore, ReportBooking, SixWeekFacts, ProgressShare } from "./session-report.ts";
import type { RecoveryEntry } from "./client-logs.ts";
import { pendingScoreDisplay } from "./session-report.ts";

export type ReportWeek={start:string;end:string;bookings:ReportBooking[];completed:{id:string;date:string}[]};
export type SessionReportData=ReportRecord&{previous:SessionFacts[];historyUnavailable:boolean;recovery:RecoveryEntry[];recoveryUnavailable:boolean;week:ReportWeek|null;archivePending:boolean};
function verifiedFacts(facts:SessionFacts,organizationId:string,clientId:string,workoutId:string) {
 return facts?.workout?.id===workoutId&&facts.workout.organization_id===organizationId&&facts.workout.client_user_id===clientId&&facts.workout.status==="completed"&&Array.isArray(facts.exercises);
}
export async function loadSessionReport(supabase:SupabaseClient,organizationId:string,clientId:string,workoutId:string):Promise<SessionReportData|null> {
 const read=()=>supabase.from("workout_session_reports").select("workout_assignment_id,source_snapshot,score_snapshot").eq("organization_id",organizationId).eq("client_user_id",clientId).eq("workout_assignment_id",workoutId).maybeSingle();
 let row=await read();
 if(!row.error&&!row.data){const ensured=await supabase.rpc("ensure_completed_session_report",{target_workout_id:workoutId});if(!ensured.error)row=await read();}
 if(row.error||!row.data)return loadLiveFacts(supabase,organizationId,clientId,workoutId);
 const source=row.data.source_snapshot as SessionFacts,score=row.data.score_snapshot as SessionScore;
 if(!verifiedFacts(source,organizationId,clientId,workoutId))throw new Error("This saved report is unavailable. Your workout results are unchanged.");
 const [history,recovery,week]=await Promise.all([
  source.previous_report_ids?.length?supabase.from("workout_session_reports").select("source_snapshot").eq("organization_id",organizationId).eq("client_user_id",clientId).in("workout_assignment_id",source.previous_report_ids):Promise.resolve({data:[],error:null}),
  supabase.from("client_recovery_entries").select("id,log_date,workout_assignment_id,recovery_type,duration_minutes,water_temperature,temperature_unit,occurred_at,notes,felt_after").eq("organization_id",organizationId).eq("client_user_id",clientId).eq("workout_assignment_id",workoutId).is("deleted_at",null).order("log_date").order("occurred_at"),
  supabase.rpc("get_session_report_week",{target_workout_id:workoutId}),
 ]);
 return {id:workoutId,source,score,previous:history.error?[]:(history.data??[]).map(r=>r.source_snapshot as SessionFacts),historyUnavailable:!!history.error,recovery:(recovery.data??[]) as RecoveryEntry[],recoveryUnavailable:!!recovery.error,week:week.error?null:week.data as ReportWeek,archivePending:false};
}
async function loadLiveFacts(supabase:SupabaseClient,organizationId:string,clientId:string,workoutId:string):Promise<SessionReportData|null> {
 const {data:w,error}=await supabase.from("workout_assignments").select("*,workout_exercises(*,exercise_library(id,name,equipment_requirements,measurement,laterality),workout_sets(*))").eq("id",workoutId).eq("organization_id",organizationId).eq("client_user_id",clientId).eq("status","completed").maybeSingle();
 if(error)throw new Error("Saved workout results could not be loaded. Please reload; completion has not been changed.");if(!w)return null;
 const [organization,client,coach,recovery]=await Promise.all([supabase.from("organizations").select("name,timezone").eq("id",organizationId).single(),supabase.from("profiles").select("full_name,preferred_name").eq("id",clientId).single(),supabase.from("profiles").select("full_name").eq("id",w.coach_user_id).maybeSingle(),supabase.from("client_recovery_entries").select("*").eq("workout_assignment_id",workoutId).eq("organization_id",organizationId).eq("client_user_id",clientId).is("deleted_at",null)]);
 if(organization.error||client.error)throw new Error("Saved report context could not be loaded. Please reload.");
 const source:SessionFacts={workout:w,timezone:organization.data.timezone,gymName:organization.data.name,clientName:client.data.preferred_name||client.data.full_name,coachName:coach.data?.full_name??null,previous_report_ids:[],exercises:w.workout_exercises.map((e:ReportExercise)=>({...e,exercise_library:Array.isArray(e.exercise_library)?e.exercise_library[0]??null:e.exercise_library}))};
 return {id:workoutId,source,score:pendingScoreDisplay(source),previous:[],historyUnavailable:true,recovery:(recovery.data??[]) as RecoveryEntry[],recoveryUnavailable:!!recovery.error,week:null,archivePending:true};
}
export async function loadProgressContext(supabase:SupabaseClient,organizationId:string,clientId:string,end:string) {
 const result=await supabase.rpc("get_six_week_report_context",{target_organization_id:organizationId,target_client_id:clientId,end_date:end});
 if(result.error||!result.data)throw new Error("This progress period could not be loaded. Choose an end date today or earlier, then try again.");
 const facts=result.data as SixWeekFacts;
 if(facts.organizationId!==organizationId||facts.clientId!==clientId||facts.periodEnd!==end)throw new Error("Progress report unavailable.");
 return facts;
}
export async function loadProgressShares(supabase:SupabaseClient,organizationId:string,clientId:string) {
 const result=await supabase.from("client_progress_report_shares").select("id,period_start,period_end,revision,shared_at,coach_summary,next_priorities,source_snapshot").eq("organization_id",organizationId).eq("client_user_id",clientId).order("shared_at",{ascending:false}).limit(30);
 if(result.error)throw new Error("Shared reports could not be loaded. Please reload before publishing.");
 return (result.data??[]) as ProgressShare[];
}
