import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PlanWorkoutForm } from "@/components/plan-workout-form";
import { requireRole } from "@/lib/auth";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone, localWeekStartDate, shiftLocalDate } from "@/lib/timezone";

const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const timeLabel = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" });
const asDate = (date: string) => new Date(`${date}T12:00:00Z`);
const validDate = (date: string) => /^[2-9]\d{3}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(asDate(date).getTime()) && asDate(date).toISOString().slice(0, 10) === date;
export default async function CoachPlanWorkoutsPage({ searchParams }: {
  searchParams: Promise<{ client?: string; date?: string }>;
}) {
  const query = await searchParams;
  const { membership, supabase, userId } = await requireRole("coach");
  const gym = membership.organization_id;
  const [{ data: profile }, { data: organization }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", gym).single(),
    supabase.from("coach_client_assignments").select("client_user_id").eq("organization_id", gym)
      .eq("coach_user_id", userId).eq("status", "active"),
  ]);
  const clientIds = (assignments ?? []).map(row => row.client_user_id);
  const { data: clients, error: clientError } = clientIds.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name").in("id", clientIds)
      .eq("account_status", "active").order("full_name")
    : { data: [], error: null };
  const options = (clients ?? []).map(client => ({ id: client.id, name: client.preferred_name || client.full_name }));
  const selected = options.find(option => option.id === query.client) ?? options[0];
  const timezone = organization?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const today = localDateInTimeZone(new Date(), timezone);
  const date = query.date && validDate(query.date) ? query.date : today;
  const start = localWeekStartDate(asDate(date), "UTC") ?? date;
  const days = Array.from({ length: 7 }, (_, i) => shiftLocalDate(start, i)!);
  const href = (day: string) => `/coach/plan-workouts?client=${selected?.id ?? ""}&date=${day}`;
  const { data: workouts, error: weekError } = selected
    ? await supabase.from("workout_assignments")
      .select("id,title,scheduled_date,scheduled_time,status,paired_workout_group_id")
      .eq("organization_id", gym).eq("coach_user_id", userId).eq("client_user_id", selected.id)
      .gte("scheduled_date", start).lte("scheduled_date", days[6]).neq("status", "cancelled").order("scheduled_time")
    : { data: [], error: null };

  return <DashboardShell compact gymName={organization?.name ?? "Ravoge gym"} name={profile?.preferred_name || profile?.full_name || "Coach"} role="coach">
    <div className={styles.pageHeading}>
      <div><p className={styles.eyebrow}>Coach programming</p><h2>Plan Workouts</h2></div>
      <p>Choose a client and plan their week. Saved workouts appear on the client’s dashboard.</p>
    </div>
    {assignmentError || clientError ? <p className={styles.notice} role="alert">Client assignments could not be loaded. Refresh to try again.</p>
      : !selected ? <p className={styles.empty}>Assign a client to yourself before planning workouts.</p> : <>
      <section className={styles.panel}>
        <form method="get" className={styles.formColumns}>
          <input type="hidden" name="date" value={date} />
          <label className={styles.field}>Client<select name="client" defaultValue={selected.id}>
            {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></label>
          <button className={styles.secondaryAction}>View client plan</button>
        </form>
        <div className={styles.quickActions}>
          <Link href={`/coach/clients/${selected.id}?tab=progress`}>Review workout results →</Link>
          <Link href={`/coach/workout-now?client=${selected.id}`}>Workout Now →</Link>
        </div>
      </section>
      <section className={styles.panel} aria-label="Weekly workout plan">
        <div className={styles.sectionHeading}><h3>{selected.name}’s week</h3>
          <nav className={styles.quickActions} aria-label="Plan week">
            <Link href={href(shiftLocalDate(start, -7)!)}>← Previous week</Link>
            <Link href={href(today)}>This week</Link>
            <Link href={href(shiftLocalDate(start, 7)!)}>Next week →</Link>
          </nav>
        </div>
        {weekError ? <p role="alert" className={styles.notice}>This week could not be loaded. Refresh before adding a workout.</p> :
          <ul className={styles.planWeek}>
            {days.map(day => <li key={day} className={day === date ? styles.planDaySelected : styles.planDay}>
              <h4><time dateTime={day}>{dateLabel.format(asDate(day))}</time></h4>
              {(workouts ?? []).filter(workout => workout.scheduled_date === day).map(workout => <div key={workout.id} className={styles.planEntry}>
                <Link href={`/coach/clients/${selected.id}/workouts/${workout.id}`}>{workout.title}</Link>
                <small>{workout.scheduled_time ? `${timeLabel.format(new Date(`2000-01-01T${workout.scheduled_time.slice(0, 5)}:00Z`))} · ` : ""}{workout.status.replaceAll("_", " ")}{workout.paired_workout_group_id ? " · Paired" : ""}</small>
              </div>)}
              <Link className={styles.inlineAction} href={`${href(day)}#workout-editor`}>+ Plan workout<span className={styles.planScreenReader}> for {dateLabel.format(asDate(day))}</span></Link>
            </li>)}
          </ul>}
      </section>
      {!weekError && <section className={styles.panel} id="workout-editor">
        <h2>Plan a workout for {dateLabel.format(asDate(date))}</h2>
        <PlanWorkoutForm key={`${selected.id}-${date}`} clients={options} defaultClientId={selected.id} defaultDate={date} />
      </section>}
    </>}
  </DashboardShell>;
}
