import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { WorkoutExecution, SessionCompletionForm, type ExecutionExercise } from "@/components/workout-execution";
import { requireRole } from "@/lib/auth";
import { ClientWorkoutPlayer, type PlayerExercise } from "@/components/client-workout-player";
import { TrainingReadinessHistory } from "@/components/training-readiness-history";

export default async function WorkoutExecutionPage({params}:{params:Promise<{clientId:string;workoutId:string}>}) {
  const {clientId,workoutId}=await params;
  if(![clientId,workoutId].every((id)=>/^[0-9a-f-]{36}$/i.test(id))) notFound();
  const {membership,supabase,userId}=await requireRole("coach");
  const [{data:workout},{data:client},{data:actor},{data:org},{data:states},{data:recent}]=await Promise.all([
    supabase.from("workout_assignments").select("*,workout_exercises(*,exercise_library(coach_cue,equipment_requirements),workout_sets(*))").eq("id",workoutId).eq("client_user_id",clientId).eq("coach_user_id",userId).eq("organization_id",membership.organization_id).maybeSingle(),
    supabase.from("profiles").select("full_name,preferred_name").eq("id",clientId).maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id",userId).single(),
    supabase.from("organizations").select("name").eq("id",membership.organization_id).single(),
    supabase.from("client_states").select("current_readiness,calculated_at").eq("organization_id",membership.organization_id).eq("client_user_id",clientId).order("calculated_at",{ascending:false}).limit(1),
    supabase.from("workout_assignments").select("id,title,scheduled_date,status").eq("organization_id",membership.organization_id).eq("client_user_id",clientId).eq("coach_user_id",userId).neq("id",workoutId).order("scheduled_date",{ascending:false}).limit(4),
  ]);
  if(!workout||!client) notFound();
  const exercises=[...workout.workout_exercises].sort((a,b)=>a.sort_order-b.sort_order) as ExecutionExercise[];
  const sets=exercises.flatMap((exercise)=>exercise.workout_sets);
  const locked=workout.status==="completed"||workout.status==="cancelled";
  const name=client.preferred_name||client.full_name;
  const playerExercises = [...workout.workout_exercises].sort((a,b)=>a.sort_order-b.sort_order).map(e=>({...e,exercise_library:Array.isArray(e.exercise_library)?e.exercise_library[0]??null:e.exercise_library})) as PlayerExercise[];
  const structured=playerExercises.some(e=>e.prescription_details);
  const substitutionIds=[...new Set(playerExercises.flatMap(e=>e.prescription_details?.substitutionIds??[]))];
  const {data:substitutions}=substitutionIds.length?await supabase.from("exercise_library").select("id,name").in("id",substitutionIds).eq("is_active",true):{data:[]};
  return <DashboardShell compact gymName={org?.name??"Gym"} name={actor?.full_name??"Coach"} role="coach">
    <Link className={styles.backLink} href={`/coach/clients/${clientId}`}>← {name} · Workout plan</Link>
    <div className={styles.pageHeading}><div><p className={styles.eyebrow}>Workout Plan</p><h2>{workout.title}</h2><p className={styles.profileMeta}>{name} · {workout.scheduled_date}</p></div><span className={locked?styles.successPill:styles.mutedPill}>{workout.status.replaceAll("_"," ")}</span></div>
    {workout.instructions&&<p className={styles.notice}>{workout.instructions}</p>}
    <TrainingReadinessHistory clientId={clientId}/>
    {structured&&<ClientWorkoutPlayer role="coach" workoutId={workoutId} title={workout.title} goal={workout.objective} duration={workout.estimated_duration_minutes} status={workout.status} exercises={playerExercises} substitutions={substitutions??[]}/>}
    {!structured&&<>
    {workout.status==="completed"&&<section className={styles.completedSummary}><h3>Workout complete</h3><div className={styles.summaryNumbers}><span><strong>{sets.filter(s=>["complete","exceeded"].includes(s.execution_result??"")).length}</strong>Completed sets</span><span><strong>{sets.filter(s=>s.execution_result==="failed").length}</strong>Failed sets</span><span><strong>{sets.filter(s=>s.execution_result==="exceeded").length}</strong>Exceeded sets</span><span><strong>{workout.execution_duration_minutes??"—"}</strong>Minutes</span></div><p>{workout.execution_coach_notes}</p></section>}
    <div className={styles.executionLayout}><WorkoutExecution clientId={clientId} exercises={exercises} locked={locked} workoutId={workoutId} /><aside className={styles.executionSidebar}><section className={styles.operationCard}><h3>Workout overview</h3><dl className={styles.factList}><div><dt>Exercises</dt><dd>{exercises.length}</dd></div><div><dt>Sets</dt><dd>{sets.length}</dd></div><div><dt>Recorded duration</dt><dd>{workout.execution_duration_minutes ? `${workout.execution_duration_minutes} minutes` : "Not recorded"}</dd></div></dl><SessionCompletionForm clientId={clientId} duration={workout.execution_duration_minutes} locked={locked} notes={workout.execution_coach_notes} workoutId={workoutId} /></section><section className={styles.operationCard}><h3>Latest intake readiness</h3>{states?.[0]?<><p className={styles.readinessValue}>{Math.round(Number(states[0].current_readiness)*10)}<small>/10</small></p><p className={styles.formHint}>From intake on {new Date(states[0].calculated_at).toLocaleDateString("en-US")}. Session check-in answers are stored separately.</p></>:<p className={styles.empty}>No readiness assessment yet.</p>}</section><section className={styles.operationCard}><h3>Recent workouts</h3><ul className={styles.activityList}>{recent?.map((item)=><li key={item.id}><Link href={`/coach/clients/${clientId}/workouts/${item.id}`}>{item.title}<small>{item.scheduled_date}</small></Link></li>)}</ul><h3>Quick actions</h3><div className={styles.quickActions}><Link href={`/coach/clients/${clientId}?tab=workouts`}>Client plan →</Link><Link href={`/coach/clients/${clientId}/book`}>Schedule session →</Link><Link href={`/coach/clients/${clientId}?tab=progress`}>View progress →</Link></div></section></aside></div>
    </>}
  </DashboardShell>;
}
