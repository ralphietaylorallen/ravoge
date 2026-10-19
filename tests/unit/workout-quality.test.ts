import assert from "node:assert/strict";
import test from "node:test";
import { defaultProtocol, estimateWorkoutSeconds, protocolTarget, validateProtocol } from "../../lib/workout-protocol.ts";
import { deidentifiedGenerationInput, generateAssistedWorkout, type GenerationInput } from "../../lib/workout-generation.ts";
import { validateQualityWorkout } from "../../lib/workout-generation-quality.ts";

const candidates = [
  ["squat", "reps", "dumbbells"], ["hinge", "reps", "dumbbells"], ["horizontal_pull", "reps", "bands"],
  ["horizontal_push", "reps", "dumbbells"], ["conditioning", "time", "rower"], ["conditioning", "time", "ski_erg"],
  ["conditioning", "distance", "turf"], ["carry", "distance", "dumbbells"], ["carry", "reps", ""],
].map(([pattern, measurement, equipment], i) => ({ id: `private-id-${i}`, name: "PRIVATE NAME private@example.test", pattern,
  equipment: equipment ? [equipment] : [], difficulty: "beginner", quality: "general_fitness", measurement: measurement as "reps" | "time" | "distance", laterality: "bilateral", purposes: ["strength"] }));
const input = (goal = "strength"): GenerationInput => ({ schemaVersion: 2, snapshot: "private-snapshot", intakeId: "private-intake", goal, secondaryGoal: null,
  experience: goal === "fat_loss" ? "beginner" : "intermediate", frequency: 3, duration: 45, targets: {}, bodyComposition: {},
  restrictions: { tags: ["impact"], hasInjuries: true, hasPain: false, hasLimitations: true, hasAvoidedExercises: true, coachReviewed: true },
  equipment: ["dumbbells", "bands", "rower", "ski_erg", "turf"], candidates, facilities: [{ type: "turf", length: 25, unit: "yards" }],
  publishedCount: 1, gymProfile: { id: "private-profile", version: 2, summary: "PRIVATE NAME", statistics: { formats: { circuit: 3 } }, preferences: { formats: ["circuit"], emphasis: ["strength"] } },
  references: [{ id: "private-review", title: "PRIVATE NAME", revision: 2, goal, duration: 40, exercises: [{ libraryExerciseId: candidates[0].id, sets: 3, reps: 8, restSeconds: 90, protocol: { ...defaultProtocol(), format: "circuit", group: "PRIVATE NAME" } }] }], history: [],
});
function row(key: number, block = "strength", measurement: "reps" | "time" | "distance" = "reps") {
  return { exerciseKey: `exercise_${key}`, sets: 3, reps: measurement === "reps" ? 8 : 1, restSeconds: 90,
    notes: "Coach chooses load and confirms technique.", reason: "Approved goal-specific movement with recovery.", protocol: { ...defaultProtocol(measurement), block, workSeconds: measurement === "time" ? 45 : null, distance: measurement === "distance" ? 10 : null } };
}
function proposal(goal: string) {
  const exercises = goal === "fat_loss" ? [row(1), row(2), row(3), row(5, "conditioning", "time")]
    : goal === "conditioning" ? [row(1), row(3), row(5, "conditioning", "time"), row(6, "conditioning", "time"), row(7, "finisher", "distance")]
      : [row(1), row(2), row(3), row(4)];
  return { title: `${goal} foundation`, rationale: `Adapted to ${goal}, current intake, restrictions and compatible reviewed gym examples.`, durationMinutes: 40, exercises };
}
test("three deidentified goals select materially different supported draft structures and retain private references locally", async () => {
  const signatures = new Set<string>();
  for (const goal of ["fat_loss", "strength", "conditioning"]) {
    const context = input(goal), output = proposal(goal);
    if (goal === "fat_loss") for (const r of output.exercises.slice(0, 3)) Object.assign(r.protocol, { format: "circuit", group: "A" });
    const sdk = { responses: { create: async (request: Record<string, unknown>) => {
      const body = JSON.stringify(request);
      assert.ok(body.includes(goal)); assert.ok(!body.includes("PRIVATE NAME")); assert.ok(!body.includes("private-review"));
      return { status: "completed", output_text: JSON.stringify(output) };
    } } };
    const result = await generateAssistedWorkout(context, sdk as never);
    assert.ok(result.workout); signatures.add(JSON.stringify(result.workout.exercises.map(e => [e.libraryExerciseId, e.protocol?.format, e.protocol?.measurement])));
    assert.ok(estimateWorkoutSeconds(result.workout.exercises) <= context.duration * 60 + 180);
  }
  assert.equal(signatures.size, 3);
});
test("quality projection sends no raw source, group labels, personal names, IDs or profile summary", () => {
  const projected = JSON.stringify(deidentifiedGenerationInput(input()));
  for (const value of ["PRIVATE NAME", "private@example.test", "private-profile", "private-review", "private-id", "private-intake", "private-snapshot"]) assert.ok(!projected.includes(value));
  assert.ok(projected.includes("group_1")); assert.ok(projected.includes('"version":2'));
});
test("unsupported equipment, overlong turf lengths, wrong measurement and unsafe intensity are rejected", () => {
  const base = input("conditioning");
  const invalid = [proposal("conditioning"), proposal("conditioning"), proposal("conditioning"), proposal("conditioning")];
  invalid[0].exercises[4].protocol.distance = 100;
  invalid[1].exercises[4].reps = 10;
  invalid[2].exercises[0].protocol.targetRpe = 10;
  invalid[3].exercises[4].protocol.measurement = "reps";
  invalid[3].exercises[4].protocol.distance = null;
  for (const output of invalid) assert.throws(() => validateQualityWorkout(JSON.stringify(output), base));
  const unavailable = input("conditioning"); unavailable.equipment = ["dumbbells", "bands"];
  assert.throws(() => validateQualityWorkout(JSON.stringify(proposal("conditioning")), unavailable));
  const limited = input("strength"); limited.candidates = structuredClone(limited.candidates); limited.candidates[0].repMax = 6;
  assert.throws(() => validateQualityWorkout(JSON.stringify(proposal("strength")), limited));
});
test("circuits, EMOM slots, AMRAP duration, rounds, time, distance and per-side instructions retain exact units", () => {
  for (const format of ["superset", "circuit", "stations", "rounds", "emom", "amrap"] as const) {
    const p = validateProtocol({ ...defaultProtocol("time"), format, group: "A", intervalSeconds: format === "emom" ? 60 : null, blockDurationSeconds: format === "amrap" ? 480 : null, perSide: true });
    assert.ok(protocolTarget(format === "amrap" ? 1 : 3, 1, p).includes("30s work each side"));
  }
  assert.ok(protocolTarget(3, 1, defaultProtocol("distance")).includes("10 meters"));
  assert.throws(() => validateProtocol({ ...defaultProtocol("time"), format: "emom", group: "A", intervalSeconds: 30 }));
  assert.throws(() => validateProtocol({ ...defaultProtocol(), format: "amrap", group: "A" }));
});
test("shared AMRAP duration is counted once and conflicting group formats fail", () => {
  const p = { ...defaultProtocol(), format: "amrap" as const, group: "A", blockDurationSeconds: 600 };
  assert.equal(estimateWorkoutSeconds([1, 2, 3].map(() => ({ sets: 1, reps: 8, restSeconds: 0, protocol: p }))), 660);
  const output = proposal("strength"); output.exercises[0].protocol.group = "A"; output.exercises[1].protocol.group = "A"; output.exercises[1].protocol.format = "circuit";
  assert.throws(() => validateQualityWorkout(JSON.stringify(output), input()));
});
