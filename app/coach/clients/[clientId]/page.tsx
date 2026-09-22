import Link from "next/link";
import { notFound } from "next/navigation";

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

export default async function CoachClientPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { clientId } = await params;
  const { notice } = await searchParams;
  const { membership, supabase, userId } = await requireRole("coach");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) notFound();
  const { data: relationship } = await supabase.from("coach_client_assignments").select("client_user_id,status").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).eq("status", "active").maybeSingle();
  if (!relationship) notFound();

  const [{ data: coachProfile }, { data: clientProfile }, { data: organization }, { data: workouts }, { data: intakeRows }, { data: stateRows }, { data: prescriptionRows }, { data: baselineRows }, { data: inbodyRows }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("profiles").select("full_name,preferred_name,bio,avatar_path,account_status").eq("id", clientId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase.from("workout_assignments").select("id,title,scheduled_date,status,workout_exercises(id,exercise_name,sets,reps,load,sort_order)").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).order("scheduled_date", { ascending: false }),
    supabase.from("client_intakes").select("*").eq("organization_id", membership.organization_id).eq("client_user_id", clientId).order("version", { ascending: false }),
    supabase.from("client_states").select("training_experience,recovery_capacity,current_readiness,movement_tolerance,volume_tolerance,constraint_tags,confidence").eq("organization_id", membership.organization_id).eq("client_user_id", clientId).order("calculated_at", { ascending: false }).limit(1),
    supabase.from("generated_prescriptions").select("id,title,status,generated_at").eq("organization_id", membership.organization_id).eq("coach_user_id", userId).eq("client_user_id", clientId).order("generated_at", { ascending: false }),
    supabase.from("client_intake_baselines").select("intake_id,squat_variation,squat_one_rm_kg,squat_one_rm_method,bench_variation,bench_one_rm_kg,bench_one_rm_method,pullup_strict_reps,pullup_mode,rower_distance_m,rower_time_seconds,versa_duration_seconds,versa_feet,inbody_status").eq("organization_id", membership.organization_id).eq("client_user_id", clientId),
    supabase.from("client_body_composition_assessments").select("intake_id,inbody_score,body_fat_percentage").eq("organization_id", membership.organization_id).eq("client_user_id", clientId).not("intake_id", "is", null),
  ]);
  if (!clientProfile) notFound();
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

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={coachProfile?.full_name ?? "Coach"} role="coach">
      <Link className={styles.backLink} href="/coach">← Back to clients</Link>
      <div className={styles.detailHeader}><div className={styles.profileHero}><ProfilePhoto name={clientName} url={clientImageUrl} /><div><p className={styles.eyebrow}>Active client</p><h2 className={styles.detailTitle}>{clientName}</h2><p className={styles.profileMeta}>{latestIntake ? String(latestIntake.primary_goal).replaceAll("_", " ") : "Intake pending"} · Assigned coach</p><p className={styles.empty}>{clientProfile.bio || "No client About section yet."}</p></div></div><span className={styles.statusPill}>{clientProfile.account_status}</span></div>
      <Link className={styles.action} href={`/coach/clients/${clientId}/book`}>Schedule session →</Link>
      <nav aria-label="Client profile sections" className={styles.tabs}><a href="#overview">Overview</a><a href="#intake">Intake</a><a href="#state">Assessment state</a><a href="#workouts">Workouts</a><a href="#history">History</a></nav>
      {notice && noticeMessages[notice] && <p className={`${styles.notice} ${notice === "prescription-unavailable" ? styles.error : ""}`} role="status">{noticeMessages[notice]}</p>}

      <section className={styles.profileOverview} id="overview">
        <article className={styles.metricCard}><span>Intake</span><strong>{latestIntake ? `Version ${latestIntake.version}` : "Pending"}</strong><small>{latestIntake ? "Structured and calculated" : "Complete before generation"}</small></article>
        <article className={styles.metricCard}><span>Primary goal</span><strong>{latestIntake ? String(latestIntake.primary_goal).replaceAll("_", " ") : "—"}</strong><small>Drives the first prescription</small></article>
        <article className={styles.metricCard}><span>Assignments</span><strong>{(workouts ?? []).length}</strong><small>Current workout history</small></article>
      </section>

      <section className={styles.workspaceSection} id="state">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Interpretable state</p><h3>Coach-readable readiness</h3></div>{latestIntake && <form action={generatePrescriptionAction.bind(null, clientId)}><button className={styles.action} type="submit">Generate Ravoge workout</button></form>}</div>
        {latestState ? <div className={styles.stateGrid}>
          <article><span>Training level</span><strong>{level(latestState.training_experience)}</strong></article>
          <article><span>Recovery</span><strong>{level(latestState.recovery_capacity)}</strong></article>
          <article><span>Current readiness</span><strong>{level(latestState.current_readiness)}</strong></article>
          <article><span>Volume tolerance</span><strong>{level(latestState.volume_tolerance)}</strong></article>
          <article><span>Movement tolerance</span><strong>{level(latestState.movement_tolerance)}</strong></article>
          <article><span>Confidence</span><strong>{latestState.confidence.overall ?? "Low"}</strong></article>
          <article className={styles.stateConstraints}><span>Movement constraints</span><strong>{latestState.constraint_tags.length ? latestState.constraint_tags.map((item) => item.replaceAll("_", " ")).join(", ") : "None recorded"}</strong></article>
        </div> : <p className={styles.empty}>Save the structured intake to calculate the first client state.</p>}
      </section>

      <section className={styles.workspaceSection} id="intake">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Structured intake</p><h3>{latestIntake ? "Review or create a new version" : "Build the client baseline"}</h3></div><p>Every save creates an auditable version and recalculates state.</p></div>
        <BaselineSummary records={baselineRecords} />
        <IntakeForm clientId={clientId} defaults={(latestIntake ?? {}) as never} />
      </section>

      <section className={styles.workspaceSection} id="workouts">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Prescriptions</p><h3>Recommendations &amp; assignments</h3></div></div>
        {prescriptions.some((item) => item.status === "draft") && <div className={styles.draftList}>{prescriptions.filter((item) => item.status === "draft").map((item) => <Link key={item.id} href={`/coach/clients/${clientId}/prescriptions/${item.id}`}><span>Draft recommendation</span><strong>{item.title}</strong><small>Review and assign →</small></Link>)}</div>}
        <div className={styles.detailGrid}>
          <section className={styles.panel} id="history"><h2>Workout history</h2>{(workouts ?? []).length ? <ul className={styles.workoutList}>{(workouts as WorkoutAssignment[]).map((workout) => <li key={workout.id}><div className={styles.workoutSummary}><div><strong>{workout.title}</strong><time dateTime={workout.scheduled_date}>{workout.scheduled_date}</time></div><span>{workout.status.replaceAll("_", " ")}</span></div><ol className={styles.compactExercises}>{[...workout.workout_exercises].sort((a, b) => a.sort_order - b.sort_order).map((exercise) => <li key={exercise.id}><span>{exercise.exercise_name}</span><small>{exercise.sets} × {exercise.reps}{exercise.load !== null ? ` · ${exercise.load}` : ""}</small></li>)}</ol></li>)}</ul> : <p className={styles.empty}>No workouts are assigned yet.</p>}</section>
          <section className={`${styles.panel} ${styles.createPanel}`}><h2>Manual workout</h2><p className={styles.empty}>Gate 2’s direct workflow remains available.</p><WorkoutForm clientId={clientId} /></section>
        </div>
      </section>
    </DashboardShell>
  );
}
