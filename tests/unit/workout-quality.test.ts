import assert from "node:assert/strict";
import test from "node:test";
import { defaultProtocol, estimateWorkoutSeconds, orderedPlayerSets, protocolTarget, validateProtocol } from "../../lib/workout-protocol.ts";
import { deidentifiedGenerationInput, generateAssistedWorkout, type GenerationInput } from "../../lib/workout-generation.ts";
import { QualityValidationError, validateQualityWorkout } from "../../lib/workout-generation-quality.ts";

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

test("player guidance preserves straight sets and round-by-round grouped movement order", () => {
  const exercise = (id: string, format: "straight" | "emom" | "circuit", group = "") => ({ id, prescription_details: { ...defaultProtocol(), format, group }, workout_sets: [2, 1].map(n => ({ id: `${id}${n}`, set_number: n })) });
  for (const format of ["emom", "circuit"] as const) {
    assert.deepEqual(orderedPlayerSets([exercise("warmup", "straight"), exercise("a", format, "A"), exercise("b", format, "A"), exercise("finish", "straight")]).map(s => s.set.id), ["warmup1", "warmup2", "a1", "b1", "a2", "b2", "finish1", "finish2"]);
  }
  assert.ok(protocolTarget(6, 1, { ...defaultProtocol("time"), format: "emom", group: "A", intervalSeconds: 60 }).startsWith("6 visits"));
});

test("quality rejection diagnostics identify constraints without relaxing them", () => {
  const numeric = proposal("strength"); numeric.exercises[0].notes = "Use 95 lb.";
  const protocol = proposal("strength"); protocol.exercises[0].protocol.workSeconds = 30;
  const duration = proposal("strength"); duration.exercises.forEach(r => { r.sets = 1; r.reps = 1; r.restSeconds = 0; });
  for (const [output, issue] of [[numeric, "numeric_load"], [protocol, "protocol"], [duration, "duration"]] as const) {
    assert.throws(() => validateQualityWorkout(JSON.stringify(output), input()), error => error instanceof QualityValidationError && error.message === "invalid_output" && error.issue === issue);
  }
});

test("one bounded repair receives only a fixed validation hint, never rejected output", async t => {
  const warnings: unknown[][] = []; t.mock.method(console, "warn", (...args: unknown[]) => warnings.push(args));
  const short = proposal("strength"); short.exercises.forEach(r => { r.sets = 1; r.reps = 1; r.restSeconds = 0; r.notes = "REJECTED PROSE MUST NOT BE ECHOED"; });
  let calls = 0;
  const sdk = { responses: { create: async (request: Record<string, unknown>) => {
    calls++; const body = JSON.stringify(request);
    assert.ok(!body.includes("REJECTED PROSE")); assert.ok(!body.includes("private@example.test"));
    if(calls === 2) { assert.ok(body.includes('\\"issue\\":\\"duration\\"')); assert.ok(body.includes("Do not just change the declared duration")); assert.ok(String(request.instructions).includes("duration constraint")); }
    return {status:"completed",output_text:JSON.stringify(calls === 1 ? short : proposal("strength"))};
  } } };
  const result = await generateAssistedWorkout(input(), sdk as never);
  assert.equal(calls,2); assert.ok(result.workout); assert.deepEqual(warnings,[["[Ravoge generation] rejected output",{issue:"duration",attempt:1}]]);
});

test("targeted repair never bypasses repeated invalid output or increases provider attempts", async t => {
  t.mock.method(console,"warn",()=>{}); let calls=0;
  const invalid=proposal("strength"); invalid.exercises[0].notes="Prescribe 95 lb.";
  const sdk={responses:{create:async()=>{calls++;return {status:"completed",output_text:JSON.stringify(invalid)};}}};
  assert.deepEqual(await generateAssistedWorkout(input(),sdk as never),{workout:null,reason:"invalid_output",issue:"numeric_load"}); assert.equal(calls,2);
});
