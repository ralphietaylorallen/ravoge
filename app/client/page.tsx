import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { requireRole } from "@/lib/auth";
import { clientDayLabel, clientWorkoutTitle } from "@/lib/client-display";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone } from "@/lib/timezone";
import ui from "./client-home.module.css";

type Workout = {
  completed_at: string | null;
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  title: string;
};

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
function scheduledLabel(workout: Workout) {
  const date = clientDayLabel(workout.scheduled_date, { weekday: "short" });
  return workout.scheduled_time
    ? `${date} · ${clock.format(new Date(`2000-01-01T${workout.scheduled_time.slice(0, 5)}:00Z`))}`
    : date;
}

function WorkoutList({ workouts, timezone }: { workouts: Workout[]; timezone: string }) {
  return <ul className={ui.list}>{workouts.map(workout => {
    const date = workout.completed_at ? localDateInTimeZone(new Date(workout.completed_at), timezone) : workout.scheduled_date;
    return <li key={workout.id}>
      <Link className={ui.row} href={`/client/workouts/${workout.id}`}>
        <span>
          <strong>{clientWorkoutTitle(workout.title)}</strong>
          <small>{workout.status === "completed" ? clientDayLabel(date, { year: "numeric" }) : scheduledLabel(workout)}</small>
        </span>
        <span aria-hidden="true">›</span>
      </Link>
    </li>;
  })}</ul>;
}

export default async function ClientPage() {
  const { membership, supabase, userId } = await requireRole("client");
  const [profile, organization, workouts, coaches] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", membership.organization_id).single(),
    supabase.from("workout_assignments").select("id,title,scheduled_date,scheduled_time,status,completed_at")
      .eq("organization_id", membership.organization_id).eq("client_user_id", userId)
      .neq("status", "cancelled").order("scheduled_date").order("scheduled_time"),
    supabase.rpc("get_my_assigned_coach"),
  ]);

  const name = profile.data?.preferred_name || profile.data?.full_name || "Client";
  const coach = coaches.data?.[0];
  const coachName = coach?.preferred_name || coach?.full_name;
  const timezone = organization.data?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const today = localDateInTimeZone(new Date(), timezone);
  const rows = workouts.data ?? [];
  const current = [
    ...rows.filter(workout => workout.status === "in_progress"),
    ...rows.filter(workout => workout.status === "assigned" && workout.scheduled_date === today),
    ...rows.filter(workout => workout.status === "assigned" && workout.scheduled_date < today).reverse(),
  ];
  const upcoming = rows.filter(workout => workout.status === "assigned" && workout.scheduled_date > today);
  const completed = rows.filter(workout => workout.status === "completed")
    .sort((a, b) => (b.completed_at ?? b.scheduled_date).localeCompare(a.completed_at ?? a.scheduled_date)).slice(0, 5);
  const featured = current[0] ?? upcoming[0];
  const remaining = current.length ? current.slice(1) : [];
  const later = current.length ? upcoming : upcoming.slice(1);

  return <DashboardShell compact gymName={organization.data?.name ?? "Ravoge gym"} name={name} role="client">
    <div className={ui.stack}>
      <header className={ui.heading}>
        <h1>Workouts</h1>
        <p className={ui.muted}>{clientDayLabel(today, { weekday: "long", month: "long" })}{coachName ? ` · Coach ${coachName}` : ""}</p>
      </header>
      {workouts.error ? <p role="alert">Workouts could not be loaded. Reload to try again.</p> : <>
        <section className={`${ui.surface} ${ui.featured}`} aria-labelledby="featured-workout">
          {featured ? <>
            <p className={styles.eyebrow}>{featured.status === "in_progress" ? "In progress" : current.length ? "Ready to train" : "Next workout"}</p>
            <h2 id="featured-workout">{clientWorkoutTitle(featured.title)}</h2>
            <p className={ui.muted}>{scheduledLabel(featured)}</p>
            <Link className={current.length ? styles.action : styles.secondaryAction} href={`/client/workouts/${featured.id}`}>
              {featured.status === "in_progress" ? "Resume workout" : "Open workout"}
            </Link>
          </> : <>
            <h2 id="featured-workout">No workouts scheduled</h2>
            <Link className={styles.action} href={coach ? "/client/book" : "/client/schedule"}>
              {coach ? "Book a session" : "View schedule"}
            </Link>
          </>}
        </section>
        {(remaining.length > 0 || later.length > 0 || completed.length > 0) && <div className={ui.layout}>
          {remaining.length > 0 && <section className={ui.surface}>
            <h2>Other active workouts</h2>
            <WorkoutList workouts={remaining} timezone={timezone} />
          </section>}
          {later.length > 0 && <section className={ui.surface}>
            <h2>Upcoming</h2>
            <WorkoutList workouts={later} timezone={timezone} />
          </section>}
          {completed.length > 0 && <section className={ui.surface}>
            <h2>Recently completed</h2>
            <WorkoutList workouts={completed} timezone={timezone} />
          </section>}
        </div>}
      </>}
      <Link className={ui.quietLink} href="/client/profile#workout-history">View workout history</Link>
    </div>
  </DashboardShell>;
}
