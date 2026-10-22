import assert from "node:assert/strict";
import test from "node:test";
import { CALIBRATION_REQUIRED, optionalStrengthAnchors, startingLoadLabel } from "../../lib/starting-load.ts";
import { poundsToKilograms } from "../../lib/weight-units.ts";

test("pound display distinguishes total, each hand, added weight, sled and calibration", () => {
  assert.equal(startingLoadLabel(25, { semantics: "each_hand" }), "25.0 lb per hand — 50.0 lb total");
  assert.equal(startingLoadLabel(50, { semantics: "total" }), "50.0 lb total");
  assert.equal(startingLoadLabel(10, { semantics: "added" }), "10.0 lb added weight");
  assert.equal(startingLoadLabel(90, { semantics: "sled" }), "90.0 lb sled load");
  assert.equal(startingLoadLabel(null, { calibrationRequired: true }), CALIBRATION_REQUIRED);
  assert.equal(startingLoadLabel(null, { explanation: "Bodyweight" }), "Bodyweight");
  assert.notEqual(startingLoadLabel(null), "Bodyweight");
  assert.doesNotMatch(startingLoadLabel(25, { semantics: "each_hand" }), /kg|kilogram/i);
});
test("optional measured anchors never fabricate untested results and convert pounds once", () => {
  const form = new FormData();
  assert.deepEqual(optionalStrengthAnchors(form), { deadlift: { method: "not_tested" }, overhead_press: { method: "not_tested" } });
  for (const [key, value] of Object.entries({ deadliftMethod: "estimated", deadliftVariation: "romanian_deadlift", deadliftLoadLb: "100", deadliftReps: "5", deadliftOneRmLb: "120" })) form.set(key, value);
  const result = optionalStrengthAnchors(form).deadlift;
  assert.equal(result.loadKg, poundsToKilograms(100));
  assert.equal(result.oneRmKg, poundsToKilograms(120));
  assert.equal(result.variation, "romanian_deadlift");
  form.set("deadliftLoadLb", ""); assert.throws(() => optionalStrengthAnchors(form));
  form.set("deadliftMethod", "not_tested"); assert.deepEqual(optionalStrengthAnchors(form).deadlift, { method: "not_tested" });
});
