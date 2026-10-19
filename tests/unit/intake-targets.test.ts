import assert from "node:assert/strict";
import test from "node:test";
import { parseBodyCompositionGoals } from "../../lib/intake-targets.ts";

test("body-composition targets are optional, structured and use kg for muscle mass", () => {
  assert.deepEqual(parseBodyCompositionGoals(new FormData()), {});
  const form = new FormData();
  form.set("goalWeightKg", "80"); form.set("goalBodyFatPercentage", "18.5"); form.set("goalSkeletalMuscleMassKg", "36.2");
  assert.deepEqual(parseBodyCompositionGoals(form), { weightKg: 80, bodyFatPercentage: 18.5, skeletalMuscleMassKg: 36.2 });
});

test("invalid targets and muscle mass greater than body weight fail validation", () => {
  for (const [key, value] of [["goalWeightKg", "0"], ["goalWeightKg", "Infinity"], ["goalBodyFatPercentage", "76"], ["goalSkeletalMuscleMassKg", "-1"], ["goalWeightKg", " "]]) {
    const form = new FormData(); form.set(key, value); assert.equal(parseBodyCompositionGoals(form), null);
  }
  const form = new FormData(); form.set("goalWeightKg", "60"); form.set("goalSkeletalMuscleMassKg", "80");
  assert.equal(parseBodyCompositionGoals(form), null);
});
