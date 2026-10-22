import { loadLabel, poundsInText } from "@/lib/weight-units";
import Link from "next/link";
import { notFound } from "next/navigation";

import { completeWorkoutAction, setExerciseCompletionAction } from "@/app/client/actions";
import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PreworkoutCheckin } from "@/components/preworkout-checkin";
import { requireRole } from "@/lib/auth";
import { ClientWorkoutPlayer, type PlayerExercise } from "@/components/client-workout-player";
import { TrainingReadinessForm } from "@/components/training-readiness";

type ClientExercise = {
  completed_at: string | null;
  exercise_name: string;
  id: string;
  load: number | null;
  load_unit: string | null;
  notes: string | null;
  reps: number;
  sets: number;
  sort_order: number;
};

type ClientWorkout = {
  coach_user_id: string;
  completed_at: string | null;
  id: string;
  instructions: string | null;
  scheduled_date: string;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  title: string;
  objective: string | null;
  estimated_duration_minutes: number | null;
  workout_exercises: (ClientExercise & PlayerExercise)[];
};

const noticeMessages: Record<string, string> = {
  "finish-exercises": "Complete every exercise before finishing the workout.",
  "not-available": "That completion change is not available.",
};

export default async function ClientWorkoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ workoutId: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { workoutId } = await params;
  const { notice } = await searchParams;
  const { membership, supabase, userId } = await requireRole("client");
  if (!/^[0-9a-f-]{36}$/i.test(workoutId)) notFound();

  const [{ data: profile }, { data: organization }, { data: workoutRow }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase
      .from("workout_assignments")
      .select("id,coach_user_id,title,instructions,scheduled_date,status,completed_at,objective,estimated_duration_minutes,workout_exercises(id,exercise_name,sets,reps,load,load_unit,load_prescription,notes,rest_seconds,sort_order,completed_at,prescription_details,exercise_library(coach_cue,equipment_requirements),workout_sets(id,set_number,actual_reps,actual_load,actual_load_unit,actual_work_seconds,actual_distance,actual_rpe,client_result,completed_at,pain_reported,failure_notes))")
      .eq("id", workoutId)
      .eq("organization_id", membership.organization_id)
      .eq("client_user_id", userId)
      .maybeSingle(),
  ]);
  if (!workoutRow) notFound();
  const workout = { ...workoutRow, workout_exercises: workoutRow.workout_exercises.map(e => ({ ...e, exercise_library: Array.isArray(e.exercise_library) ? e.exercise_library[0] ?? null : e.exercise_library })) } as ClientWorkout;
  const { data: coach } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", workout.coach_user_id)
    .maybeSingle();
  const exercises = [...workout.workout_exercises].sort((a, b) => a.sort_order - b.sort_order);
  const allComplete = exercises.length > 0 && exercises.every((exercise) => exercise.completed_at);
  const structured = exercises.some(e => e.prescription_details);
  const substituteIds = [...new Set(exercises.flatMap(e => e.prescription_details?.substitutionIds ?? []))];
  const { data: substitutions } = substituteIds.length ? await supabase.from("exercise_library").select("id,name").in("id", substituteIds).eq("is_active", true) : { data: [] };
  const [{ data: questions }, { count: previousCheckins }] = await Promise.all([
    supabase.from("organization_preworkout_questions").select("position,question_text,scale_min,scale_max").eq("organization_id", membership.organization_id).order("position"),
    supabase.from("preworkout_checkins").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("client_user_id", userId).eq("workout_assignment_id", workoutId),
  ]);

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Client"} role="client">
      <Link className={styles.backLink} href="/client">← Back to workouts</Link>
      <div className={styles.detailHeader}>
        <div>
          <p className={styles.eyebrow}>{workout.scheduled_date}</p>
          <h2 className={styles.detailTitle}>{workout.title}</h2>
        </div>
        <span className={styles.statusPill}>{workout.status.replaceAll("_", " ")}</span>
      </div>

      {notice && noticeMessages[notice] && (
        <p className={`${styles.notice} ${styles.error}`} role="alert">{noticeMessages[notice]}</p>
      )}

      <div className={styles.workoutMeta}>
        <div><span>Coach</span><strong>{coach?.full_name ?? "Ravoge coach"}</strong></div>
        <div><span>Instructions</span><strong>{workout.instructions ?? "No additional instructions."}</strong></div>
      </div>

      {workout.status !== "completed" && workout.status !== "cancelled" && <TrainingReadinessForm role="client" clientId={userId} workoutId={workoutId}/>}
      {structured ? <ClientWorkoutPlayer workoutId={workout.id} title={workout.title} goal={workout.objective} duration={workout.estimated_duration_minutes} status={workout.status} exercises={exercises} substitutions={substitutions ?? []}/> : <section className={`${styles.panel} ${styles.clientWorkoutPanel}`}>
        <h2>Exercises</h2>
        <ol className={styles.clientExerciseList}>
          {exercises.map((exercise, index) => {
            const isComplete = Boolean(exercise.completed_at);
            const action = setExerciseCompletionAction.bind(null, workout.id, exercise.id, !isComplete);
            return (
              <li className={isComplete ? styles.exerciseComplete : ""} key={exercise.id}>
                <div className={styles.exerciseNumber}>{String(index + 1).padStart(2, "0")}</div>
                <div className={styles.exercisePrescription}>
                  <strong>{exercise.exercise_name}</strong>
                  <span>
                    {exercise.sets} sets × {exercise.reps} reps
                    {exercise.load !== null ? ` · ${loadLabel(exercise.load, exercise.load_unit)}` : ""}
                  </span>
                  {exercise.notes && <p>{poundsInText(exercise.notes)}</p>}
                </div>
                <form action={action}>
                  <button className={styles.completionAction} type="submit">
                    {isComplete ? "✓ Complete" : "Mark complete"}
                  </button>
                </form>
              </li>
            );
          })}
        </ol>
        <form action={completeWorkoutAction.bind(null, workout.id)} className={styles.finishForm}>
          <button className={styles.action} disabled={!allComplete || workout.status === "completed"} type="submit">
            {workout.status === "completed" ? "Workout complete" : "Complete workout"}
          </button>
        </form>
      </section>}
      <PreworkoutCheckin questions={questions ?? []} previousCount={previousCheckins ?? 0} workoutId={workoutId} />
    </DashboardShell>
  );
}
