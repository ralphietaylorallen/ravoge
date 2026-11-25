import Link from "next/link";

import { DashboardShell, dashboardStyles as styles } from "@/components/dashboard-shell";
import { PlanWorkoutForm } from "@/components/plan-workout-form";
import { GeneratePlannedWorkoutForm } from "@/components/generate-planned-workout-form";
import { requireRole } from "@/lib/auth";
import { bookingWorkoutSlot, scheduledWorkoutTitle } from "@/lib/coach-workday";
import { DEFAULT_ORGANIZATION_TIMEZONE, localDateInTimeZone, localDateStartIso, localWeekStartDate, shiftLocalDate } from "@/lib/timezone";
import workspace from "@/components/coach-workspace.module.css";

const dateLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const timeLabel = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" });
const asDate = (date: string) => new Date(`${date}T12:00:00Z`);
const validDate = (date: string) => /^[2-9]\d{3}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(asDate(date).getTime()) && asDate(date).toISOString().slice(0, 10) === date;
export default async function CoachPlanWorkoutsPage({ searchParams }: {
  searchParams: Promise<{ client?: string; date?: string; time?: string; edit?: string }>;
}) {
  const query = await searchParams;
  const { membership, supabase, userId } = await requireRole("coach");
  const gym = membership.organization_id;
  const [profile, organization, assignments] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name").eq("id", userId).single(),
    supabase.from("organizations").select("name,timezone").eq("id", gym).single(),
    supabase.from("coach_client_assignments").select("client_user_id").eq("organization_id", gym)
      .eq("coach_user_id", userId).eq("status", "active"),
  ]);
  const clientIds = (assignments.data ?? []).map(row => row.client_user_id);
  const { data: clients, error: clientError } = clientIds.length
    ? await supabase.from("profiles").select("id,full_name,preferred_name").in("id", clientIds)
      .eq("account_status", "active").order("full_name")
    : { data: [], error: null };
  const options = (clients ?? []).map(client => ({ id: client.id, name: client.preferred_name || client.full_name }));
  const selected = query.client ? options.find(option => option.id === query.client) : options[0];
  const timezone = organization.data?.timezone ?? DEFAULT_ORGANIZATION_TIMEZONE;
  const today = localDateInTimeZone(new Date(), timezone);
  const date = query.date && validDate(query.date) ? query.date : today;
  const start = localWeekStartDate(asDate(date), "UTC") ?? date;
  const days = Array.from({ length: 7 }, (_, i) => shiftLocalDate(start, i)!);
  const href = (day: string) => `/coach/plan-workouts?client=${selected?.id ?? ""}&date=${day}`;
  const [workouts, bookings, drafts, equipment] = selected ? await Promise.all([
    supabase.from("workout_assignments").select("id,title,scheduled_date,scheduled_time,status,paired_workout_group_id")
      .eq("organization_id", gym).eq("coach_user_id", userId).eq("client_user_id", selected.id)
      .gte("scheduled_date", start).lte("scheduled_date", days[6]).neq("status", "cancelled").order("scheduled_time"),
    supabase.from("bookings").select("id,starts_at,timezone,session_type,status")
      .eq("organization_id", gym).eq("coach_user_id", userId).eq("client_user_id", selected.id)
      .gte("starts_at", localDateStartIso(start, timezone)!).lt("starts_at", localDateStartIso(shiftLocalDate(start, 7)!, timezone)!)
      .eq("status", "scheduled").order("starts_at"),
    supabase.from("generated_prescriptions").select("id,title,generation_context")
      .eq("organization_id", gym).eq("coach_user_id", userId).eq("client_user_id", selected.id).eq("status", "draft")
      .neq("engine_version", "prescription-v0.2")
      .gte("generation_context->>plannedDate", start).lte("generation_context->>plannedDate", days[6]).order("generated_at"),
    supabase.from("organization_equipment").select("name")
      .eq("organization_id", gym).eq("is_available", true).order("name"),
  ]) : [null, null, null, null];
  const gymEquipment = [...new Set((equipment?.data ?? []).map(item => item.name.trim()).filter(Boolean))];
  const weekError = workouts?.error || bookings?.error || drafts?.error;
  const booked = (bookings?.data ?? []).map(booking => ({ ...booking, slot: bookingWorkoutSlot(booking), day: localDateInTimeZone(booking.starts_at, timezone) }));
  const gymClock = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: timezone });
  const time = query.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(query.time) ? query.time : undefined;
  const base = `/coach/clients/${selected?.id ?? ""}`;

  return <DashboardShell compact gymName={organization.data?.name ?? "Ravoge gym"} name={profile.data?.preferred_name || profile.data?.full_name || "Coach"} role="coach">
    <div className={workspace.workday}>
      <header className={workspace.workdayHeading}><div>{selected && <p className={workspace.kicker}>{selected.name}</p>}<h1>Plan Workouts</h1></div>
        {selected && <Link className={workspace.secondaryButton} href={base}>Client Profile</Link>}
      </header>
      {assignments.error || clientError ? <p className={styles.notice} role="alert">Client assignments could not be loaded. Refresh to try again.</p> : <>
        {!selected && <form method="get" className={workspace.clientPicker} aria-label="Choose a client plan">
          <input type="hidden" name="date" value={date} />
          <label className={styles.field}>Client<select name="client" required defaultValue="">
            <option value="" disabled>Choose an assigned client</option>
            {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select></label>
          <button className={workspace.secondaryButton} disabled={!options.length}>View Plan</button>
        </form>}
        {!selected ? <p className={workspace.muted}>{options.length ? "Choose an assigned client to open their plan." : "Assign a client to yourself before planning workouts."}</p> : <>
          <section className={workspace.agenda} aria-label="Weekly workout plan">
            <div className={styles.sectionHeading}><h2>{selected.name}’s week</h2>
              <nav className={workspace.actionStrip} aria-label="Plan week">
                <Link className={workspace.secondaryButton} href={href(shiftLocalDate(start, -7)!)}>← Previous week</Link>
                <Link className={workspace.secondaryButton} href={href(today)}>This week</Link>
                <Link className={workspace.secondaryButton} href={href(shiftLocalDate(start, 7)!)}>Next week →</Link>
              </nav>
            </div>
            {weekError ? <p role="alert" className={styles.notice}>This week couldn’t be loaded. Refresh before adding a workout.</p> :
              <ul className={workspace.planCalendar}>{days.map(day => {
                const appointments = booked.filter(booking => booking.day === day);
                const dailyWorkouts = (workouts?.data ?? []).filter(workout => workout.scheduled_date === day);
                const dailyDrafts = (drafts?.data ?? []).filter(draft => draft.generation_context?.plannedDate === day && typeof draft.generation_context?.plannedTime === "string");
                const bookingPlans = new Map(appointments.map(booking => {
                  const matching = booking.session_type === "Intake" ? [] : dailyWorkouts.filter(workout =>
                    booking.slot.date === workout.scheduled_date && booking.slot.time === workout.scheduled_time?.slice(0, 8));
                  return [booking.id, matching.length === 1 ? matching[0] : undefined];
                }));
                const linkedPlans = new Set(Array.from(bookingPlans.values(), workout => workout?.id));
                const unbooked = dailyWorkouts.filter(workout => !linkedPlans.has(workout.id));
                return <li key={day} className={workspace.planDay} data-selected={day === date || undefined} data-empty={!appointments.length && !unbooked.length && !dailyDrafts.length || undefined}>
                  <h3><time dateTime={day}>{dateLabel.format(asDate(day))}</time>{day === today && <small>Today</small>}</h3>
                  {appointments.map(booking => {
                    const planned = bookingPlans.get(booking.id);
                    const title = planned?.title ?? booking.session_type;
                    return <Link className={workspace.planSlot} key={booking.id} href={`${base}/sessions/${booking.id}?mode=prepare`}>
                      <span><time dateTime={booking.starts_at}>{gymClock.format(new Date(booking.starts_at))}</time><strong>{title}</strong></span>
                      <small>{booking.session_type === "Intake" ? "Open intake" : planned ? "View workout" : "Prepare workout"} <span aria-hidden="true">›</span></small>
                    </Link>;
                  })}
                  {unbooked.map(workout => <Link className={workspace.planSlot} key={workout.id} href={`${base}/workouts/${workout.id}`}>
                    <span><time>{workout.scheduled_time ? timeLabel.format(new Date(`2000-01-01T${workout.scheduled_time.slice(0, 5)}:00Z`)) : "Flexible time"}</time><strong>{workout.title}</strong></span>
                    <small>{workout.status.replaceAll("_", " ")}{workout.paired_workout_group_id ? " · Paired" : ""} <span aria-hidden="true">›</span></small>
                  </Link>)}
                  {dailyDrafts.map(draft => <Link className={workspace.planSlot} key={draft.id} href={`${base}/prescriptions/${draft.id}?mode=plan`}>
                    <strong>{scheduledWorkoutTitle(day, draft.generation_context.plannedTime)}</strong><small>Review draft ›</small>
                  </Link>)}
                  {!appointments.length && !unbooked.length && !dailyDrafts.length && <p className={workspace.muted}>No sessions</p>}
                  <Link className={workspace.manualSlot} href={`${href(day)}&edit=manual#workout-editor`}>+ Add workout<span className={styles.planScreenReader}> for {dateLabel.format(asDate(day))}</span></Link>
                </li>;
              })}</ul>}
          </section>
          <div className={workspace.actionStrip}>
            <Link className={workspace.secondaryButton} href={`${base}/book`}>Book a Session</Link>
            <Link className={workspace.secondaryButton} href={`${base}?tab=progress`}>View Progress</Link>
            <Link className={workspace.secondaryButton} href={`/coach/workout-now?client=${selected.id}`}>Workout Now</Link>
          </div>
          {!weekError && <details className={workspace.disclosure} id="workout-editor" open={query.edit === "manual"}>
            <summary>Add a coach-built workout</summary>
            <p className={workspace.muted}>{dateLabel.format(asDate(date))}</p>
            <PlanWorkoutForm key={`${selected.id}-${date}-${time || ""}`} clients={options} defaultClientId={selected.id} defaultDate={date} defaultTime={time} gymEquipment={gymEquipment} gymEquipmentUnavailable={Boolean(equipment?.error)} />
          </details>}
          {!weekError && <details className={workspace.disclosure}>
            <summary>AI draft (optional)</summary>
            <GeneratePlannedWorkoutForm key={`${selected.id}:${date}:${time ?? ""}`} clients={options} clientId={selected.id} date={date} time={time} today={today} timezone={timezone} />
          </details>}
        </>}
      </>}
    </div>
  </DashboardShell>;
}
