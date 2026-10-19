import assert from "node:assert/strict";
import test from "node:test";
import { deidentifiedGenerationInput, generateAssistedWorkout, validateAssistedWorkout, type GenerationInput } from "../../lib/workout-generation.ts";

const input: GenerationInput = {
  snapshot: "private-snapshot", intakeId: "private-intake-uuid", goal: "strength", secondaryGoal: null, experience: "beginner", frequency: 3, duration: 45,
  targets: { weightKg: 80, bodyFatPercentage: 18, skeletalMuscleMassKg: 35 }, bodyComposition: { weightKg: 85, bodyFatPercentage: 24, skeletalMuscleMassKg: 33 },
  restrictions: { tags: ["impact"], hasInjuries: true, hasPain: true, hasLimitations: true, hasAvoidedExercises: true, coachReviewed: true },
  equipment: ["dumbbell", "bodyweight"],
  candidates: ["squat", "hinge", "horizontal_pull"].map((pattern, index) => ({ id: `private-exercise-${index}`, name: "PERSONAL NAME private@example.test", pattern, equipment: ["dumbbell"], difficulty: "beginner", quality: "strength" })),
  references: [{ id: "private-review-id", title: "PERSONAL NAME private@example.test", revision: 2, goal: "strength", duration: 40, exercises: [{ libraryExerciseId: "private-exercise-0", sets: 3, reps: 8, restSeconds: 90 }] }],
  history: [{ status: "completed", exercises: [{ id: "private-exercise-1", sets: 3, reps: 8, restSeconds: 90, load: 20 }] }],
};
const output = () => ({ title: "Strength foundation", rationale: "Adapted to strength goals, reviewed restrictions and available dumbbells.", durationMinutes: 40,
  exercises: [1, 2, 3].map((index) => ({ exerciseKey: `exercise_${index}`, sets: 3, reps: 8, restSeconds: 90, targetRpe: 6, notes: "Coach selects a comfortable load.", reason: "Approved compatible movement for the goal." })) });

test("generation projection includes training context but excludes all identities, raw text and IDs", () => {
  const projected = deidentifiedGenerationInput(input);
  const serialized = JSON.stringify(projected);
  for (const forbidden of ["PERSONAL NAME", "private@example.test", "private-intake", "private-exercise", "private-review", "private-snapshot"]) assert.ok(!serialized.includes(forbidden));
  assert.deepEqual(projected.bodyComposition, { weightLb: 85 * 2.20462262185, bodyFatPercentage: 24, skeletalMuscleMassLb: 33 * 2.20462262185 });
  assert.deepEqual(projected.optionalTargets, { weightLb: 80 * 2.20462262185, bodyFatPercentage: 18, skeletalMuscleMassLb: 35 * 2.20462262185 });
  assert.equal(projected.gymReferences.length, 1);
  assert.equal(projected.priorWorkouts.length, 1);
  assert.equal(projected.restrictions.hasPain, true);
  assert.equal(projected.requestedDurationMinutes, 45);
});

test("strict workout validation permits only unique approved compatible exercise aliases and conservative programming", () => {
  const valid = validateAssistedWorkout(JSON.stringify(output()), input);
  assert.equal(valid.exercises[0].libraryExerciseId, input.candidates[0].id);
  assert.equal(valid.exercises[0].load, null);
  const invalid: unknown[] = [null, {}, [], { ...output(), durationMinutes: 60 }, { ...output(), title: "https://unsafe.test" }, { ...output(), extra: true }];
  for (const [key, value] of [["exerciseKey", "exercise_99"], ["sets", 4], ["reps", 100], ["restSeconds", 0], ["targetRpe", 8], ["load", 100], ["reason", ""]] as const) {
    const proposal = output(); Object.assign(proposal.exercises[0], { [key]: value }); invalid.push(proposal);
  }
  const duplicate = output(); duplicate.exercises[1].exerciseKey = "exercise_1"; invalid.push(duplicate);
  for (const proposal of invalid) assert.throws(() => validateAssistedWorkout(JSON.stringify(proposal), input));
  const unavailable = structuredClone(input); unavailable.equipment = ["bodyweight"];
  assert.throws(() => validateAssistedWorkout(JSON.stringify(output()), unavailable));
});

test("OpenAI request is stateless, server-only, tool-free and strict; one safe repair is allowed", async () => {
  let calls = 0;
  const client = { responses: { create: async (request: Record<string, unknown>) => {
    calls++;
    assert.equal(request.store, false); assert.deepEqual(request.tools, []);
    assert.equal((request.text as { format: { strict: boolean } }).format.strict, true);
    assert.ok(!JSON.stringify(request).includes("private@example.test"));
    assert.ok(!("previous_response_id" in request));
    return { status: "completed", output_text: calls === 1 ? "not json" : JSON.stringify(output()) };
  } } };
  const result = await generateAssistedWorkout(input, client as never);
  assert.equal(calls, 2); assert.ok(result.workout); assert.equal(result.workout.exercises.length, 3);
});

test("invalid output, provider failure and missing configuration terminate safely with a truthful fallback", async () => {
  for (const failure of ["invalid", "network"]) {
    let calls = 0;
    const client = { responses: { create: async () => { calls++; if (failure === "network") throw new Error("Do not expose private provider diagnostics"); return { status: "completed", output_text: "{}" }; } } };
    const result = await generateAssistedWorkout(input, client as never);
    assert.equal(calls, 2); assert.equal(result.workout, null); assert.equal(result.reason, failure === "invalid" ? "invalid_output" : "unavailable");
  }
  const before = process.env.OPENAI_API_KEY;
  try { delete process.env.OPENAI_API_KEY; assert.deepEqual(await generateAssistedWorkout(input), { workout: null, reason: "not_configured" }); }
  finally { if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before; }
});
