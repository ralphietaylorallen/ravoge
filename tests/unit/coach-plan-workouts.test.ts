import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { equipmentForLocation, isPlannedWorkoutLocation, WORKOUT_EQUIPMENT_LIMIT } from "../../lib/planned-workout-location.ts";

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
  assert.match(form, /ExerciseSets/);
  assert.match(form, /ExerciseReps/);
  assert.match(form, /ExerciseLoad/);
  assert.match(form, /ExerciseDurationSeconds/);
  assert.match(form, /Turn pasted workout into rows/);
  assert.match(form, /Assign workout/);
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
  assert.match(route, /selectTodayWorkout\(existingWorkouts/);
  assert.match(route, /existingWorkout/);
  assert.ok(route.indexOf("if (existingWorkout)") < route.lastIndexOf("createGeneratedWorkoutDraft"));
  assert.match(train, /Save readiness & open planned workout/);
});

test("Paired workouts share structure but keep each client's prescription separate", async () => {
  const [form, actions, workoutPage, planPage, migration] = await Promise.all([
    read("components/plan-workout-form.tsx"),
    read("app/coach/actions.ts"),
    read("components/trainer-workout-page.tsx"),
    read("app/coach/plan-workouts/page.tsx"),
    read("supabase/migrations/20261109020815_paired_planned_workouts.sql"),
  ]);

  assert.match(form, /Add a training partner/);
  assert.match(form, /name="secondaryClientId"/);
  assert.match(form, /role="tab"/);
  assert.match(form, /Client B’s weight starts blank/);
  assert.match(actions, /create_paired_planned_workout_assignments_lb/);
  assert.match(actions, /primary_exercises: primary\.exercises/);
  assert.match(actions, /secondary_exercises: secondary\.exercises/);
  assert.match(migration, /paired_workout_group_id uuid/);
  assert.match(migration, /primary_name <> secondary_name/);
  assert.match(migration, /primary_mode <> secondary_mode/);
  assert.match(workoutPage, /paired_workout_group_id/);
  assert.match(workoutPage, /Paired session clients/);
  assert.match(planPage, /paired_workout_group_id \? " · Paired"/);
});

test("Coach location presets provide editable equipment starting points without requiring gym inventory", () => {
  assert.equal(equipmentForLocation("home", ["Gym rack"]), "Bodyweight");
  assert.equal(equipmentForLocation("hotel", ["Gym rack"]), "Dumbbells, cable machine, treadmill");
  assert.equal(equipmentForLocation("gym", ["Gym rack", "Rower"]), "Gym rack, Rower");
  assert.equal(equipmentForLocation("gym", ["Rower", "x".repeat(WORKOUT_EQUIPMENT_LIMIT)]), "Rower");
  assert.equal(equipmentForLocation("gym", []), "");
  assert.equal(isPlannedWorkoutLocation("constructor"), false);
});
