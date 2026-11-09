import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL("../../" + path, import.meta.url), "utf8");

test("Coach Plan Workouts supports client/date/time, paste, reps, weights and timed exercises", async () => {
  const [page, form, actions, navigation, migration] = await Promise.all([
    read("app/coach/plan-workouts/page.tsx"),
    read("components/plan-workout-form.tsx"),
    read("app/coach/actions.ts"),
    read("components/dashboard-shell.tsx"),
    read("supabase/migrations/20261109015139_coach_planned_workouts.sql"),
  ]);

  assert.match(navigation, /href: "\/coach\/plan-workouts", label: "Plan Workouts"/);
  assert.match(page, /PlanWorkoutForm/);
  assert.match(form, /name="clientId"/);
  assert.match(form, /name="scheduledDate"/);
  assert.match(form, /name="scheduledTime"/);
  assert.match(form, /Paste a workout/);
  assert.match(form, /name="exerciseSets"/);
  assert.match(form, /name="exerciseReps"/);
  assert.match(form, /name="exerciseLoad"/);
  assert.match(form, /name="exerciseDurationSeconds"/);
  assert.match(form, /Turn pasted workout into rows/);
  assert.match(form, /Save \+ Plan Another/);
  assert.match(actions, /create_planned_workout_assignment_lb/);
  assert.match(migration, /scheduled_time time without time zone/);
  assert.match(migration, /'measurement','time'/);
  assert.match(migration, /'workSeconds',exercise_duration_seconds/);
});

test("A saved workout opens after readiness instead of generating another draft", async () => {
  const [route, train] = await Promise.all([
    read("app/api/coach/clients/[clientId]/workouts/generate/route.ts"),
    read("components/train-session-form.tsx"),
  ]);

  assert.match(route, /scheduled_date", today/);
  assert.match(route, /existingWorkout/);
  assert.ok(route.indexOf("existingWorkout") < route.indexOf("createGeneratedWorkoutDraft"));
  assert.match(train, /Save readiness & open planned workout/);
});
