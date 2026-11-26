import Link from "next/link";

import { dashboardStyles as styles } from "@/components/dashboard-shell";
import { clientDayLabel, clientWorkoutTitle } from "@/lib/client-display";
import { workoutSlot } from "@/lib/workout-agenda";

export type ScheduledWorkout = {
  id: string;
  coach_user_id: string;
  client_user_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  title: string;
};

export const SCHEDULED_WORKOUT_FIELDS = "id,coach_user_id,client_user_id,scheduled_date,scheduled_time,status,title";

const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", timeZone: "UTC" });

export function ScheduledWorkouts({ rows, error, perspective, names, bookingSlots = [], day }: {
  rows: ScheduledWorkout[];
  error?: boolean;
  perspective: "owner" | "coach" | "client";
  names?: Map<string, string>;
  bookingSlots?: (string | null)[];
  day?: string;
}) {
  const bookings = new Map<string, number>();
  const workouts = new Map<string, number>();
  for (const key of bookingSlots) if (key) bookings.set(key, (bookings.get(key) ?? 0) + 1);
  for (const row of rows) {
    const key = workoutSlot(row);
    if (key) workouts.set(key, (workouts.get(key) ?? 0) + 1);
  }
  return <section className={styles.operationCard} aria-labelledby="scheduled-workouts-heading">
    <div className={styles.sectionHeading}>
      <h3 id="scheduled-workouts-heading">{day ? `Workouts · ${clientDayLabel(day, { weekday: "short" })}` : "Workout plans"}</h3>
      {perspective === "coach" && <Link className={styles.inlineAction} href={day ? `/coach/plan-workouts?date=${day}` : "/coach/plan-workouts"}>Plan workouts →</Link>}
    </div>
    {error ? <p role="alert">Workout plans couldn’t be loaded. Reload to try again.</p>
      : !rows.length ? <p className={styles.empty}>{day ? "No workouts on this day." : "No workouts in this view."}</p>
        : <ul className={styles.workoutPlanList}>{rows.map(row => {
          const key = workoutSlot(row);
          const booked = key && bookings.get(key) === 1 && workouts.get(key) === 1;
          const title = perspective === "client" ? clientWorkoutTitle(row.title) : row.title;
          const time = row.scheduled_time ? clock.format(new Date(`2000-01-01T${row.scheduled_time.slice(0, 5)}:00Z`)) : "Flexible time";
          const base = perspective === "client" ? "/client" : `/${perspective}/clients/${row.client_user_id}`;
          const namesLabel = perspective === "owner" ? [names?.get(row.client_user_id) ?? "Client", names?.get(row.coach_user_id) ?? "Coach"]
            : perspective === "coach" ? [names?.get(row.client_user_id) ?? "Client"] : [];
          const status = row.status === "assigned" ? booked ? "Booked session" : "Assigned" : row.status.replaceAll("_", " ");
          return <li key={row.id}><Link href={`${base}/workouts/${row.id}`}>
            <div><strong>{title}</strong>
              <small>{[...namesLabel, ...(day ? [] : [clientDayLabel(row.scheduled_date, { weekday: "short" })]), time].join(" · ")}</small>
            </div>
            <span className={row.status === "completed" ? styles.successPill : styles.mutedPill}>{status}</span>
            <span aria-hidden="true">›</span>
          </Link></li>;
        })}</ul>}
  </section>;
}
