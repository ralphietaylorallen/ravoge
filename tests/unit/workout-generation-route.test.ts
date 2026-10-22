import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Create workout uses a stable authenticated route instead of a deployment-specific Server Action", async () => {
  const component = await readFile(new URL("../../components/generate-workout-form.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../../app/api/coach/clients/[clientId]/workouts/generate/route.ts", import.meta.url), "utf8");

  assert.match(component, /fetch\(`\/api\/coach\/clients\/\$\{clientId\}\/workouts\/generate`/);
  assert.doesNotMatch(component, /generatePrescriptionAction|useActionState/);
  assert.match(route, /getVerifiedUser\(\)/);
  assert.match(route, /membership\.role !== "coach"/);
  assert.match(route, /createGeneratedWorkoutDraft/);
  assert.match(route, /"Cache-Control": "no-store"/);
});
