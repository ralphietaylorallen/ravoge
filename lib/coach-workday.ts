import { localDateInTimeZone } from "./timezone.ts";

export type CoachBooking = {
  id: string;
  client_user_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: string;
  session_type: string;
};

export type CoachWorkout = {
  id: string;
  client_user_id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
};

type AgendaItem = {
  id: string;
  clientId: string;
  title: string;
  time: string;
  label: string;
  href: string;
  action: string;
  order: string;
  completed: boolean;
  active: boolean;
  upcoming: boolean;
};

export function bookingWorkoutSlot(booking: Pick<CoachBooking, "starts_at" | "timezone">) {
  return {
    date: localDateInTimeZone(booking.starts_at, booking.timezone),
    time: new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: booking.timezone,
    }).format(new Date(booking.starts_at)),
  };
}

export function selectTodayWorkout<T extends { status: string; scheduled_time: string | null }>(
  workouts: T[], now: Date, timezone: string,
) {
  const [hours, minutes] = bookingWorkoutSlot({ starts_at: now.toISOString(), timezone }).time.split(":").map(Number);
  const currentMinutes = hours * 60 + minutes;
  const closest = workouts.filter(workout => workout.status === "assigned" && workout.scheduled_time)
    .map(workout => {
      const [hour, minute] = workout.scheduled_time!.split(":").map(Number);
      return { workout, distance: Math.abs(hour * 60 + minute - currentMinutes) };
    })
    .sort((left, right) => left.distance - right.distance)[0]?.workout;
  return workouts.find(workout => workout.status === "in_progress")
    ?? closest
    ?? workouts.find(workout => workout.status === "assigned");
}

const clock = (time: string) => new Intl.DateTimeFormat("en-US", {
  hour: "numeric", minute: "2-digit", timeZone: "UTC",
}).format(new Date(`2000-01-01T${time.slice(0, 5)}:00Z`));

export function scheduledWorkoutTitle(date: string, time: string) {
  const label = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  return `Training · ${label} · ${clock(time)}`;
}

export function coachWorkday(bookings: CoachBooking[], workouts: CoachWorkout[], now: Date, timezone: string) {
  const today = localDateInTimeZone(now, timezone);
  const bySlot = new Map<string, CoachWorkout[]>();
  for (const workout of workouts) {
    if (!workout.scheduled_time || workout.status === "cancelled") continue;
    const key = `${workout.client_user_id}:${workout.scheduled_date}:${workout.scheduled_time.slice(0, 8)}`;
    bySlot.set(key, [...(bySlot.get(key) ?? []), workout]);
  }
  const linkedWorkouts = new Set<string>();
  const timing = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
  const nowTime = bookingWorkoutSlot({ starts_at: now.toISOString(), timezone }).time;
  const items: AgendaItem[] = [];
  for (const booking of bookings) {
    if (booking.status === "cancelled" || localDateInTimeZone(booking.starts_at, timezone) !== today) continue;
    const intake = booking.session_type.toLowerCase() === "intake";
    const slot = bookingWorkoutSlot(booking);
    const matches = !intake && booking.status === "scheduled"
      ? bySlot.get(`${booking.client_user_id}:${slot.date}:${slot.time}`) : undefined;
    const workout = matches?.length === 1 ? matches[0] : undefined;
    if (workout) linkedWorkouts.add(workout.id);
    const client = `/coach/clients/${booking.client_user_id}`;
    const started = Date.parse(booking.starts_at) <= now.getTime();
    const active = workout?.status === "in_progress";
    const completed = booking.status !== "scheduled" || workout?.status === "completed";
    const timingLabel = `${timing.format(new Date(booking.starts_at))} · ${Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000)} min`;
    items.push({
      id: `booking:${booking.id}`, clientId: booking.client_user_id, title: workout?.title ?? booking.session_type,
      time: timingLabel, label: workout?.status === "completed" ? "Completed" : active ? "In progress" :
        completed ? booking.status.replaceAll("_", " ") : started ? "Scheduled session" : workout ? "Workout ready" : "Scheduled",
      href: workout && (active || workout.status === "completed") ? `${client}/workouts/${workout.id}` : `${client}/sessions/${booking.id}`,
      action: active ? "Resume Workout" : workout?.status === "completed" ? "View Report" : completed ? "View Session" :
        intake ? "Open Intake" : started ? "Open Session" : workout ? "View Workout Plan" : "Prepare Session",
      order: bookingWorkoutSlot({ starts_at: booking.starts_at, timezone }).time,
      completed, active, upcoming: Date.parse(booking.ends_at) > now.getTime(),
    });
  }
  for (const workout of workouts) {
    const active = workout.status === "in_progress";
    if (linkedWorkouts.has(workout.id) || workout.status === "cancelled" || (!active && workout.scheduled_date !== today)) continue;
    const completed = workout.status === "completed";
    const client = `/coach/clients/${workout.client_user_id}`;
    items.push({
      id: `workout:${workout.id}`, clientId: workout.client_user_id, title: workout.title,
      time: workout.scheduled_time ? clock(workout.scheduled_time) : "Flexible time",
      label: active ? "In progress" : completed ? "Completed" : "Planned workout",
      href: active || completed ? `${client}/workouts/${workout.id}` :
        `/coach/workout-now?client=${workout.client_user_id}&workout=${workout.id}`,
      action: active ? "Resume Workout" : completed ? "View Report" : "Check Readiness",
      order: workout.scheduled_time || "24:00:00", completed, active,
      upcoming: !workout.scheduled_time || workout.scheduled_time >= nowTime,
    });
  }
  items.sort((a, b) => a.order.localeCompare(b.order));
  const actionable = items.filter(item => !item.completed);
  const focus = actionable.find(item => item.active) ?? actionable.find(item => item.upcoming) ?? actionable[0];
  return { focus, queued: actionable.filter(item => item.id !== focus?.id), completed: items.filter(item => item.completed) };
}
