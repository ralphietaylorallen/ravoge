import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { ProfilePhoto } from "@/components/profile-photo";
import { requireRole } from "@/lib/auth";
import { getProfileImageUrl } from "@/lib/profile-images";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";

type ClientWorkout = {
  completed_at: string | null;
  id: string;
  scheduled_date: string;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  title: string;
  workout_exercises: { completed_at: string | null; id: string }[];
};

function WorkoutList({ empty, workouts }: { empty: string; workouts: ClientWorkout[] }) {
  if (!workouts.length) return <p className={styles.empty}>{empty}</p>;
  return (
    <ul className={styles.clientWorkoutList}>
      {workouts.map((workout) => {
        const completedExercises = workout.workout_exercises.filter((exercise) => exercise.completed_at).length;
        return (
          <li key={workout.id}>
            <Link href={`/client/workouts/${workout.id}`}>
              <div>
                <strong>{workout.title}</strong>
                <time dateTime={workout.scheduled_date}>{workout.scheduled_date}</time>
              </div>
              <span>
                {workout.status.replaceAll("_", " ")} · {completedExercises}/{workout.workout_exercises.length}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function ClientPage() {
  const { membership, supabase, userId } = await requireRole("client");
  const [{ data: profile }, { data: organization }, { data: assignment }, { data: workoutRows }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("coach_client_assignments").select("coach_user_id").eq("organization_id", membership.organization_id).eq("status", "active").limit(1).maybeSingle(),
    supabase
      .from("workout_assignments")
      .select("id,title,scheduled_date,status,completed_at,workout_exercises(id,completed_at)")
      .eq("organization_id", membership.organization_id)
      .eq("client_user_id", userId)
      .neq("status", "cancelled")
      .order("scheduled_date", { ascending: true }),
  ]);
  const { data: coach } = assignment
    ? await supabase.from("profiles").select("full_name,preferred_name,avatar_path").eq("id", assignment.coach_user_id).maybeSingle()
    : { data: null };
  const coachName = coach?.preferred_name || coach?.full_name || "A coach has not been assigned yet.";
  const coachPhotoUrl = await getProfileImageUrl(supabase, coach?.avatar_path);
  const today = localDateInTimeZone(new Date(), organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE);
  const workouts = (workoutRows ?? []) as ClientWorkout[];
  const current = workouts.filter((workout) => workout.status === "in_progress" || (workout.status === "assigned" && workout.scheduled_date <= today));
  const upcoming = workouts.filter((workout) => workout.status === "assigned" && workout.scheduled_date > today);
  const completed = workouts.filter((workout) => workout.status === "completed").reverse().slice(0, 5);

  return (
    <DashboardShell gymName={organization?.name ?? "Ravoge gym"} name={profile?.full_name ?? "Client"} role="client">
      <div className={styles.clientMeta}>
        <ProfilePhoto name={coachName} size="small" url={coachPhotoUrl} />
        <span>Your coach</span>
        <strong>{coachName}</strong>
      </div>
      <div className={styles.grid}>
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <h2>Today &amp; current</h2>
          <WorkoutList empty="No workout is due right now." workouts={current} />
        </section>
        <section className={styles.panel}>
          <h2>Upcoming</h2>
          <WorkoutList empty="No upcoming workouts yet." workouts={upcoming} />
        </section>
        <section className={styles.panel}>
          <h2>Recently completed</h2>
          <WorkoutList empty="Completed workouts will appear here." workouts={completed} />
        </section>
      </div>
    </DashboardShell>
  );
}
