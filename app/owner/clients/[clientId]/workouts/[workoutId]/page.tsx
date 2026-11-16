import {TrainerWorkoutPage} from "@/components/trainer-workout-page";
import {SessionReportPage} from "@/components/session-report-page";
import {requireRole} from "@/lib/auth";
export default async function Page(props:{params:Promise<{clientId:string;workoutId:string}>}) {
 const {clientId,workoutId}=await props.params;
 const {membership,supabase,userId}=await requireRole("owner");
 const {data:workout}=await supabase.from("workout_assignments").select("coach_user_id").eq("id",workoutId).eq("client_user_id",clientId).eq("organization_id",membership.organization_id).maybeSingle();
 if(workout&&workout.coach_user_id!==userId)return <SessionReportPage role="owner" clientId={clientId} workoutId={workoutId}/>;
 return <TrainerWorkoutPage {...props} role="owner"/>;
}
