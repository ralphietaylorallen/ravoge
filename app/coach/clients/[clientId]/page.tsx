import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { WorkoutForm } from "@/components/workout-form";
import { requireRole } from "@/lib/auth";

type WorkoutExercise = {
  exercise_name: string;
  id: string;
  load: number | null;
  notes: string | null;
  reps: number;
  sets: number;
  sort_order: number;
};

type WorkoutAssignment = {
  id: string;
  instructions: string | null;
  scheduled_date: string;
  status: string;
  title: string;
  workout_exercises: WorkoutExercise[];
};

export default async function CoachClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const { membership, supabase, userId } = await requireRole("coach");
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) notFound();

  const { data: relationship } = await supabase
    .from("coach_client_assignments")
    .select("client_user_id, status")
    .eq("organization_id", membership.organization_id)
    .eq("coach_user_id", userId)
    .eq("client_user_id", clientId)
    .eq("status", "active")
    .maybeSingle();
  if (!relationship) notFound();

  const [{ data: coachProfile }, { data: clientProfile }, { data: organization }, { data: workouts }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("profiles").select("full_name").eq("id", clientId).single(),
    supabase.from("organizations").select("name").eq("id", membership.organization_id).single(),
    supabase
      .from("workout_assignments")
      .select("id,title,instructions,scheduled_date,status,workout_exercises(id,exercise_name,sets,reps,load,notes,sort_order)")
      .eq("organization_id", membership.organization_id)
      .eq("coach_user_id", userId)
      .eq("client_user_id", clientId)
      .order("scheduled_date", { ascending: false }),
  ]);
  if (!clientProfile) notFound();

  return (
    <DashboardShell
      gymName={organization?.name ?? "Ravoge gym"}
      name={coachProfile?.full_name ?? "Coach"}
      role="coach"
    >
      <Link className={styles.backLink} href="/coach">← Back to clients</Link>
      <div className={styles.detailHeader}>
        <div>
          <p className={styles.eyebrow}>Active client</p>
          <h2 className={styles.detailTitle}>{clientProfile.full_name}</h2>
        </div>
        <span className={styles.statusPill}>Assigned</span>
      </div>

      <div className={styles.detailGrid}>
        <section className={styles.panel}>
          <h2>Current assignments</h2>
          {(workouts ?? []).length ? (
            <ul className={styles.workoutList}>
              {(workouts as WorkoutAssignment[]).map((workout) => (
                <li key={workout.id}>
                  <div className={styles.workoutSummary}>
                    <div>
                      <strong>{workout.title}</strong>
                      <time dateTime={workout.scheduled_date}>{workout.scheduled_date}</time>
                    </div>
                    <span>{workout.status.replaceAll("_", " ")}</span>
                  </div>
                  {workout.instructions && <p>{workout.instructions}</p>}
                  <ol className={styles.compactExercises}>
                    {[...workout.workout_exercises]
                      .sort((a, b) => a.sort_order - b.sort_order)
                      .map((exercise) => (
                        <li key={exercise.id}>
                          <span>{exercise.exercise_name}</span>
                          <small>
                            {exercise.sets} × {exercise.reps}
                            {exercise.load !== null ? ` · ${exercise.load} weight` : ""}
                          </small>
                        </li>
                      ))}
                  </ol>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No workouts are assigned yet.</p>
          )}
        </section>

        <section className={`${styles.panel} ${styles.createPanel}`}>
          <h2>Create workout</h2>
          <p className={styles.empty}>Assign a structured session directly to this client.</p>
          <WorkoutForm clientId={clientId} />
        </section>
      </div>
    </DashboardShell>
  );
}
