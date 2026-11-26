import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ProfilePhoto } from "./profile-photo";
import { NavigationIcon } from "./icons";
import { coachWorkday, type CoachBooking } from "@/lib/coach-workday";
import { localDateInTimeZone, localDateStartIso } from "@/lib/timezone";
import styles from "./coach-workspace.module.css";

type Client = { id: string; full_name: string; preferred_name: string | null };
type Agenda = ReturnType<typeof coachWorkday>;

export function CoachToday({ jobs, upcoming, upcomingWorkouts, clients, photos, now, timezone, bookingFailed, workoutFailed, clientError }: {
  jobs: Agenda;
  upcoming: CoachBooking[];
  upcomingWorkouts: { id: string; client_user_id: string; title: string; scheduled_date: string }[];
  clients: Client[];
  photos: Map<string, string | null>;
  now: Date;
  timezone: string;
  bookingFailed: boolean;
  workoutFailed: boolean;
  clientError: boolean;
}) {
  const names = new Map(clients.map(client => [client.id, client.preferred_name || client.full_name]));
  const clientName = (id: string) => names.get(id) ?? "Client";
  const timestamp = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: timezone });
  const calendarDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const focus = jobs.focus;
  const agendaRow = (item: Agenda["queued"][number]) => <li key={item.id}>
    <Link className={styles.agendaRow} href={item.href}>
      <span className={styles.agendaTime}>{item.time}</span>
      <span className={styles.rowDetails}><strong>{clientName(item.clientId)}</strong><small>{item.title} · {item.label}</small></span>
      <span className={styles.rowAction}>{item.action} <span aria-hidden="true">›</span></span>
    </Link>
  </li>;

  return <div className={styles.workday}>
    <header className={styles.workdayHeading}>
      <div><p className={styles.kicker}>{date.format(now)}</p><h1>Today</h1></div>
      <Link className={styles.secondaryButton} href="/coach/schedule"><NavigationIcon href="/coach/schedule" /> Schedule</Link>
    </header>

    {focus ? <section className={styles.focusCard} aria-labelledby="coach-focus">
      <div><p className={styles.kicker}>{focus.active ? "In progress" : "Next action"}</p>
        <div className={styles.focusClient}><ProfilePhoto name={clientName(focus.clientId)} size="small" url={photos.get(focus.clientId)} />
          <h2 id="coach-focus">{clientName(focus.clientId)}</h2>
        </div>
        <p className={styles.focusSubtitle}>{focus.title} · {focus.time}</p>
      </div>
      <Link className={styles.primaryButton} href={focus.href}>{focus.action} <span aria-hidden="true">→</span></Link>
    </section> : <section className={styles.focusCard} aria-labelledby="coach-focus">
      <div><h2 id="coach-focus">{bookingFailed || workoutFailed ? "Check your schedule" : "Your schedule is clear"}</h2>
      <p className={styles.focusSubtitle}>{bookingFailed || workoutFailed ? "Some activity couldn’t be loaded. Open Schedule or reload Today." : "Ready to train with a client? Start a workout anytime."}</p></div>
      <Link className={styles.primaryButton} href={bookingFailed || workoutFailed ? "/coach/schedule" : "/coach/workout-now"}>{bookingFailed || workoutFailed ? "Open Schedule" : "Workout Now"} <span aria-hidden="true">→</span></Link>
    </section>}

    <div className={styles.dayColumns}>
      <section className={styles.agenda} aria-labelledby="coach-agenda-heading">
        <h2 id="coach-agenda-heading">Today’s schedule</h2>
        {(bookingFailed || workoutFailed) && <p role="alert" className={styles.muted}>Some of today’s activity couldn’t be loaded. Reload to check for updates.</p>}
        {jobs.queued.length ? <ul className={styles.agendaList}>{jobs.queued.map(agendaRow)}</ul> :
          !bookingFailed && !workoutFailed && <p className={styles.muted}>{focus ? "No other sessions or workouts on today’s schedule." : "No sessions or workouts scheduled today."}</p>}
        {jobs.completed.length > 0 && <details className={styles.disclosure}>
          <summary>Finished today <span>{jobs.completed.length}</span></summary>
          <ul className={styles.agendaList}>{jobs.completed.map(agendaRow)}</ul>
        </details>}
      </section>
      <aside className={styles.dayTools} aria-label="Coach shortcuts">
        <h2>Quick actions</h2>
        {[
          { href: "/coach/workout-now", label: "Workout Now", note: "Train without a booking" },
          { href: "/coach/clients", label: "My Clients", note: "Open a client profile" },
          { href: "/coach/plan-workouts", label: "Plan Workouts", note: "Build a client’s week" },
        ].map(item => <Link className={styles.shortcut} href={item.href} key={item.href}>
          <NavigationIcon href={item.href} />
          <span><strong>{item.label}</strong><small>{item.note}</small></span><span aria-hidden="true">›</span>
        </Link>)}
        {clientError && <p role="alert" className={styles.muted}>Client names couldn’t be loaded.</p>}
      </aside>
    </div>

    <details className={styles.disclosure}>
      <summary>Upcoming sessions and workouts</summary>
      {!!upcoming.length && <ul className={styles.agendaList}>{upcoming.map(booking => <li key={booking.id}>
        <Link className={styles.agendaRow} href={`/coach/clients/${booking.client_user_id}/sessions/${booking.id}`}>
          <span className={styles.agendaTime}>{timestamp.format(new Date(booking.starts_at))}</span>
          <span className={styles.rowDetails}><strong>{clientName(booking.client_user_id)}</strong><small>{booking.session_type}</small></span>
          <span className={styles.rowAction}>{booking.session_type === "Intake" ? "Open Intake" : "Prepare Session"} <span aria-hidden="true">›</span></span>
        </Link>
      </li>)}</ul>}
      {!!upcomingWorkouts.length && <ul aria-label="Upcoming workouts" className={styles.agendaList}>{upcomingWorkouts.map(workout => <li key={workout.id}>
        <Link className={styles.agendaRow} href={`/coach/clients/${workout.client_user_id}/workouts/${workout.id}`}>
          <span className={styles.agendaTime}>{calendarDate.format(new Date(`${workout.scheduled_date}T12:00:00Z`))}</span>
          <span className={styles.rowDetails}><strong>{clientName(workout.client_user_id)}</strong><small>{workout.title}</small></span>
          <span className={styles.rowAction}>View Workout <span aria-hidden="true">›</span></span>
        </Link>
      </li>)}</ul>}
      {!upcoming.length && !upcomingWorkouts.length && <p className={styles.muted}>{bookingFailed || workoutFailed ? "Upcoming activity couldn’t be loaded." : "No upcoming activity scheduled."}</p>}
    </details>
  </div>;
}

export async function CoachDashboardSummary({ supabase, organizationId, userId, timezone, clients, photos, clientError }: {
  supabase: SupabaseClient; organizationId: string; userId: string; timezone: string; clients: Client[];
  photos: Map<string, string | null>; clientError: boolean;
}) {
  const now = new Date();
  const today = localDateInTimeZone(now, timezone);
  const start = localDateStartIso(today, timezone)!;
  const coachWorkouts = () => supabase.from("workout_assignments")
    .select("id,client_user_id,title,scheduled_date,scheduled_time,status")
    .eq("organization_id", organizationId).eq("coach_user_id", userId);
  const [bookings, workouts, inProgress, future] = await Promise.all([
    supabase.from("bookings").select("id,client_user_id,starts_at,ends_at,timezone,status,session_type")
      .eq("organization_id", organizationId).eq("coach_user_id", userId).gte("starts_at", start)
      .neq("status", "cancelled").order("starts_at").limit(64),
    coachWorkouts().eq("scheduled_date", today).in("status", ["assigned", "in_progress", "completed"]).order("scheduled_time").limit(64),
    coachWorkouts().neq("scheduled_date", today).eq("status", "in_progress").order("scheduled_date", { ascending: false }).limit(12),
    coachWorkouts().gt("scheduled_date", today).eq("status", "assigned").order("scheduled_date").order("scheduled_time").limit(6),
  ]);
  const items = bookings.data ?? [];
  const jobs = coachWorkday(items, [...(workouts.data ?? []), ...(inProgress.data ?? [])], now, timezone);
  const upcoming = items.filter(item => item.status === "scheduled" && localDateInTimeZone(item.starts_at, timezone) > today).slice(0, 4);

  return <CoachToday jobs={jobs} upcoming={upcoming} upcomingWorkouts={future.data ?? []}
    clients={clients} photos={photos} now={now} timezone={timezone} clientError={clientError}
    bookingFailed={!!bookings.error} workoutFailed={!!(workouts.error || inProgress.error || future.error)} />;
}
