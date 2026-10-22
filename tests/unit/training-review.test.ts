import assert from "node:assert/strict";
import test from "node:test";
import { suggestTrainingReview } from "../../lib/training-review.ts";
const library = [{ id: "bench", name: "Bench Press" }];
const source = (values: Record<string, string>) => ({ cells: Object.entries(values).map(([header, raw]) => ({ header, raw })) });

test("normalization retains exact source evidence for explicit prescriptions", () => {
  const row = source({ Exercise: "Bench Press", Sets: "3", Reps: "10" });
  const original = JSON.stringify(row);
  const result = suggestTrainingReview(row, library);
  assert.equal(result.exercises[0].sets, 3);
  assert.equal(result.exercises[0].reps, 10);
  assert.equal(result.exercises[0].libraryExerciseId, "bench");
  assert.equal(JSON.stringify(row), original);
  assert.equal(result.status, "draft");
});
test("normalization does not fabricate timed, range, percentage or unknown prescriptions", () => {
  const result = suggestTrainingReview(source({ Description: "EMOM 15 Minutes\\n- Bench Press x8 @ 50-60%\\n- Unknown lift 3x10" }), library);
  assert.equal(result.status, "needs_review");
  assert.equal(result.exercises.length, 1);
  assert.equal(result.exercises[0].sets, null);
  assert.equal(result.exercises[0].reps, null);
  assert.equal(result.exercises[0].sourceText, "- Bench Press x8 @ 50-60%");
  assert.ok(result.issues.length >= 3);
});
test("fixed-set description recognition leaves other source lines visibly unresolved", () => {
  const result = suggestTrainingReview(source({ Title: "Upper", Description: "Bench Press 3 x 8\nRest as needed" }), library);
  assert.equal(result.exercises.length, 1);
  assert.equal(result.exercises[0].sourceText, "Bench Press 3 x 8");
  assert.equal(result.status, "needs_review");
});
