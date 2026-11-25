import assert from "node:assert/strict";
import test from "node:test";
import { bookingWorkoutSlot, coachWorkday, scheduledWorkoutTitle, selectTodayWorkout } from "../../lib/coach-workday.ts";

const zone = "America/Denver";
const now = new Date("2026-11-19T17:00:00Z");
const workout = (id: string, scheduled_time: string | null, status = "assigned") => ({
  id, client_user_id: "client", title: `Training ${id}`, scheduled_date: "2026-11-19", scheduled_time, status,
});
const booking = (id: string, hour: number, session_type = "Personal Training", status = "scheduled") => ({
  id, client_user_id: "client", starts_at: `2026-11-19T${hour}:00:00Z`, ends_at: `2026-11-19T${hour}:45:00Z`,
  timezone: zone, status, session_type,
});

test("the coach agenda resumes ongoing work and links each booked and standalone workout once", () => {
  const day = coachWorkday(
    [booking("cancelled", 21, "Personal Training", "cancelled"), booking("next", 18), booking("intake", 20, "Intake"), booking("finished", 16, "Intake", "completed")],
    [workout("active", "09:00:00", "in_progress"), workout("ready", "11:00:00"), workout("standalone", "12:00:00")],
    now, zone,
  );
  assert.equal(day.focus?.action, "Resume Workout");
  assert.deepEqual(day.queued.map(item => item.id), ["booking:next", "workout:standalone", "booking:intake"]);
  assert.equal(day.queued[0].href, "/coach/clients/client/sessions/next");
  assert.equal(day.queued[0].label, "Workout ready");
  assert.equal(day.queued[1].href, "/coach/workout-now?client=client&workout=standalone");
  assert.equal(day.queued[2].action, "Open Intake");
  assert.deepEqual(day.completed.map(item => item.id), ["booking:finished"]);
});

test("Workout Now chooses the same plan for display and start", () => {
  const earlier = workout("earlier", "08:00:00");
  const closest = workout("closest", "10:15:00");
  const inProgress = workout("in-progress", "08:30:00", "in_progress");
  assert.equal(selectTodayWorkout([earlier, closest], now, zone), closest);
  assert.equal(selectTodayWorkout([earlier, closest, inProgress], now, zone), inProgress);
});

test("automatic workout titles use the appointment date and local time", () => {
  const slot = bookingWorkoutSlot({ starts_at: "2026-11-20T01:30:00Z", timezone: zone });
  assert.deepEqual(slot, { date: "2026-11-19", time: "18:30:00" });
  assert.equal(scheduledWorkoutTitle(slot.date, slot.time), "Training · Nov 19 · 6:30 PM");
});
