import Link from "next/link";
import { notFound } from "next/navigation";

import { OperationsTabs } from "@/components/operations-tabs";
import { CoachCheckin } from "@/components/coach-checkin";
import { ProgressChart } from "@/components/progress-chart";
import { localDateInTimeZone } from "@/lib/timezone";
import { generatePrescriptionAction } from "@/app/coach/actions";
import { BaselineSummary, type BaselineRecord } from "@/components/baseline-summary";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ProfilePhoto } from "@/components/profile-photo";
import { IntakeForm } from "@/components/intake-form";
import { WorkoutForm } from "@/components/workout-form";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";

type WorkoutExercise = { exercise_name: string; id: string; load: number | null; reps: number; sets: number; sort_order: number };
type WorkoutAssignment = { id: string; scheduled_date: string; status: string; title: string; workout_exercises: WorkoutExercise[] };
type ClientState = { confidence: { overall?: string }; constraint_tags: string[]; current_readiness: number; movement_tolerance: number; recovery_capacity: number; training_experience: number; volume_tolerance: number };
type IntakeRow = Record<string, unknown> & { primary_goal: string; version: number };
type DraftPrescription = { id: string; generated_at: string; status: string; title: string };

function level(score: number) {
  if (score < 0.4) return "Conservative";
  if (score < 0.7) return "Moderate";
  return "Developed";
}

const noticeMessages: Record<string, string> = {
  "prescription-assigned": "The reviewed workout is now assigned to this client.",
  "prescription-unavailable": "A recommendation could not be generated. Complete the intake and confirm at least three safe exercises are supported by available gym equipment.",
};

export default async function CoachClientPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ notice?: string; tab?: string }> }) {
  const { clientId } = await params;
  const { notice, tab: requestedTab } = await searchParams;
  const tab=["workouts","progress","intake","metrics","notes"].includes(requestedTab??"")?requestedTab!:"workouts";
  const { membership, supabase, userId } = await requireRole("coach");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) notFound();
  const { data: relationship } = await supabase.from("coach_client_assignments").select("client_user_id,status").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).eq("status", "active").maybeSingle();
  if (!relationship) notFound();

  const [{ data: coachProfile }, { data: clientProfile }, { data: organization }, { data: workouts }, { data: intakeRows }, { data: stateRows }, { data: prescriptionRows }, { data: baselineRows }, { data: inbodyRows }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("profiles").select("full_name,preferred_name,bio,avatar_path,account_status").eq("id", clientId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("workout_assignments").select("id,title,scheduled_date,status,workout_exercises(id,exercise_name,sets,reps,load,sort_order)").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).order("scheduled_date", { ascending: false }),
    supabase.from("client_intakes").select("*").eq("organization_id", membership.organization_id).eq("client_user_id", clientId).order("version", { ascending: false }),
    supabase.from("client_states").select("training_experience,recovery_capacity,current_readiness,movement_tolerance,volume_tolerance,constraint_tags,confidence").eq("organization_id", membership.organization_id).eq("client_user_id", clientId).order("calculated_at", { ascending: false }).limit(1),
    supabase.from("generated_prescriptions").select("id,title,status,generated_at").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).order("generated_at", { ascending: false }),
    supabase.from("client_intake_baselines").select("intake_id,squat_variation,squat_one_rm_kg,squat_one_rm_method,bench_variation,bench_one_rm_kg,bench_one_rm_method,pullup_strict_reps,pullup_mode,rower_distance_m,rower_time_seconds,versa_duration_seconds,versa_feet,inbody_status").eq("organization_id", membership.organization_id).eq("client_user_id", clientId),
    supabase.from("client_body_composition_assessments").select("intake_id,inbody_score,body_fat_percentage,weight_kg,skeletal_muscle_mass_kg,measured_at").eq("organization_id", membership.organization_id).eq("client_user_id", clientId),
  ]);
  if (!clientProfile) notFound();
  const [{data:bookings},{data:questions}]=await Promise.all([
    supabase.from("bookings").select("id,starts_at,timezone,status").eq("organization_id",membership.organization_id).eq("client_user_id",clientId).eq("coach_user_id",userId).eq("status","scheduled").gte("starts_at",new Date().toISOString()).order("starts_at"),
    supabase.from("organization_preworkout_questions").select("position,question_text,scale_min,scale_max").eq("organization_id",membership.organization_id).order("position"),
  ]);
  const latestIntake = (intakeRows?.[0] ?? null) as IntakeRow | null;
  const baselineByIntake = new Map((baselineRows ?? []).map((row) => [row.intake_id, row]));
  const baselineRecords = (intakeRows ?? []).flatMap((intake) => {
    const baseline = baselineByIntake.get(intake.id);
    const inbody = (inbodyRows ?? []).find((row) => row.intake_id === intake.id);
    return baseline ? [{ ...baseline, version: intake.version, completed_at: intake.completed_at, inbody_score: inbody?.inbody_score, body_fat_percentage: inbody?.body_fat_percentage } as BaselineRecord] : [];
  });
  const latestState = (stateRows?.[0] ?? null) as ClientState | null;
  const prescriptions = (prescriptionRows ?? []) as DraftPrescription[];
  const clientName = clientProfile.preferred_name || clientProfile.full_name;
  const clientImageUrl = await getProfileImageUrl(supabase, clientProfile.avatar_path);


  const basePath=`/coach/clients/${clientId}`;
  const assignedWorkouts=(workouts??[]) as WorkoutAssignment[];
  const today=localDateInTimeZone(new Date(),organization?.timezone??"America/Denver");
  const todayWorkout=assignedWorkouts.find(workout=>workout.scheduled_date===today&&workout.status!=="cancelled");
  const contexts=[...(bookings??[]).map(booking=>({id:`booking:${booking.id}`,label:`Session · ${new Date(booking.starts_at).toLocaleString("en-US",{timeZone:booking.timezone})}`})),...assignedWorkouts.filter(workout=>["assigned","in_progress"].includes(workout.status)).map(workout=>({id:`workout:${workout.id}`,label:`${workout.title} · ${workout.scheduled_date}`}))];
  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={coachProfile?.full_name ?? "Coach"} role="coach">
    <Link className={styles.backLink} href="/coach">← My Clients</Link>
    <div className={styles.detailHeader}><div className={styles.profileHero}><ProfilePhoto name={clientName} url={clientImageUrl}/><div><p className={styles.eyebrow}>Client · {organization?.name}</p><h2 className={styles.detailTitle}>{clientName}</h2><p className={styles.profileMeta}>{latestIntake?String(latestIntake.primary_goal).replaceAll("_"," "):"Intake pending"}</p></div></div><Link className={styles.action} href={`${basePath}/book`}>Schedule session</Link></div>
    <OperationsTabs active={tab} basePath={basePath} tabs={[{id:"workouts",label:"Workout Plan"},{id:"progress",label:"Progress"},{id:"intake",label:"Intake"},{id:"metrics",label:"Metrics"},{id:"notes",label:"Notes"}]}/>
    {notice&&noticeMessages[notice]&&<p className={styles.notice} role="status">{noticeMessages[notice]}</p>}
    {tab==="workouts"&&<>
      <div className={styles.summaryNumbers}><span><small>Today’s workout</small><strong>{todayWorkout?.title??"Not scheduled"}</strong></span><span><small>Next session</small><strong>{bookings?.[0]?new Date(bookings[0].starts_at).toLocaleString("en-US",{timeZone:bookings[0].timezone,month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):"Not booked"}</strong></span><span><small>Current phase</small><strong>{prescriptions.length?"Foundation":"Not started"}</strong></span><span><small>Latest readiness</small><strong>{latestState?`${Math.round(latestState.current_readiness*10)}/10`:"Not assessed"}</strong></span></div>
      {todayWorkout&&<Link className={styles.todayWorkout} href={`${basePath}/workouts/${todayWorkout.id}`}><span><small>TODAY’S WORKOUT</small><strong>{todayWorkout.title}</strong></span><span>Open workout →</span></Link>}
      <section className={styles.operationCard}><div className={styles.sectionHeading}><h3>Workout plan</h3>{latestIntake&&<form action={generatePrescriptionAction.bind(null,clientId)}><button className={styles.action} type="submit">Generate Ravoge workout</button></form>}</div>
      {prescriptions.filter(item=>item.status==="draft").map(item=><Link className={styles.todayWorkout} key={item.id} href={`${basePath}/prescriptions/${item.id}`}><strong>{item.title}</strong><span>Review draft →</span></Link>)}
      {assignedWorkouts.length?<ul className={styles.workoutPlanList}>{assignedWorkouts.map(workout=><li key={workout.id}><Link href={`${basePath}/workouts/${workout.id}`}><div><strong>{workout.title}</strong><small>{workout.scheduled_date} · {workout.workout_exercises.length} exercises</small></div><span className={workout.status==="completed"?styles.successPill:styles.mutedPill}>{workout.status.replaceAll("_"," ")}</span><span aria-hidden="true">→</span></Link></li>)}</ul>:<p className={styles.empty}>No workouts assigned yet. Complete intake or create a plan below.</p>}
      </section><details className={styles.operationCard}><summary>Create a workout</summary><WorkoutForm clientId={clientId}/></details>
    </>}
    {tab==="intake"&&<><div className={styles.sectionHeading}><div><h3>Intake evaluation</h3><p className={styles.profileMeta}>{latestIntake?`New assessment · previous version ${latestIntake.version}`:"Build the Client’s first baseline"}</p></div></div><IntakeForm clientId={clientId} defaults={(latestIntake??{}) as never} checkin={<CoachCheckin clientId={clientId} contexts={contexts} questions={questions??[]}/>}/><details className={styles.operationCard}><summary>Previous assessments</summary><BaselineSummary records={baselineRecords}/></details></>}
    {tab==="progress"&&<><ProgressChart metrics={[{label:"Weight",unit:"kg",points:(inbodyRows??[]).filter(row=>row.weight_kg!==null).map(row=>({date:row.measured_at,value:Number(row.weight_kg)}))},{label:"Body fat",unit:"%",points:(inbodyRows??[]).filter(row=>row.body_fat_percentage!==null).map(row=>({date:row.measured_at,value:Number(row.body_fat_percentage)}))}]}/><BaselineSummary records={baselineRecords}/></>}
    {tab==="metrics"&&<><section className={styles.operationCard}><h3>Latest assessment state</h3>{latestState?<div className={styles.stateGrid}><article><span>Training level</span><strong>{level(latestState.training_experience)}</strong></article><article><span>Recovery</span><strong>{level(latestState.recovery_capacity)}</strong></article><article><span>Readiness</span><strong>{level(latestState.current_readiness)}</strong></article><article><span>Movement tolerance</span><strong>{level(latestState.movement_tolerance)}</strong></article><article><span>Volume tolerance</span><strong>{level(latestState.volume_tolerance)}</strong></article><article><span>Confidence</span><strong>{latestState.confidence.overall??"Low"}</strong></article></div>:<p className={styles.empty}>Complete the intake to establish the Client’s state.</p>}</section><BaselineSummary records={baselineRecords}/></>}
    {tab==="notes"&&<section className={styles.operationCard}><h3>Coach notes</h3><p className={styles.empty}>{String(latestIntake?.coach_notes||"No intake notes recorded.")}</p><h3>About the Client</h3><p className={styles.empty}>{clientProfile.bio||"No About section yet."}</p><p className={styles.formHint}>Session notes are recorded within each workout.</p></section>}
  </DashboardShell>;
}
