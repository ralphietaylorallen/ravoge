import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { validLocalDate } from "../../lib/coach-availability.ts";

const clientId = "fe000000-0000-4000-8000-000000000003";
function harness({ role = "coach", needsSafetyReview = false, workoutId }: { role?: string; needsSafetyReview?: boolean; workoutId?: string } = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const supabase = { async rpc(name: string, args: unknown) {
    calls.push({ name, args: [args] });
    return { data: name === "get_workout_generation_readiness" ? { needsSafetyReview, intakeId: "saved-intake" } : null, error: null };
  } };
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status: number }) => Response.json(body, options) } },
    "@/lib/auth": { getVerifiedUser: async () => ({ supabase, userId: "coach" }), getActiveMembership: async () => ({ role, organization_id: "gym" }) },
    "@/lib/coach-availability": { validLocalDate },
    "@/lib/create-workout-draft": { async createGeneratedWorkoutDraft(args: unknown) {
      calls.push({ name: "generate", args: [args] });
      return { ok: true, prescriptionId: "draft", workoutId, generationIssue: "" };
    } },
  };
  const exports: Record<string, unknown> = {};
  const source = readFileSync("app/api/coach/clients/[clientId]/workouts/plan/route.ts", "utf8");
  new Function("require", "exports", ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(
    (name: string) => { assert.ok(modules[name], name); return modules[name]; }, exports,
  );
  return { calls, run: (body: Record<string, unknown> = { date: "2027-01-05", time: "09:30" }, origin = "https://ravoge.com") =>
    (exports.POST as (request: Request, context: unknown) => Promise<Response>)(
      new Request("https://ravoge.com/api/plan", { method: "POST", headers: { host: "ravoge.com", origin }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ clientId }) },
    ) };
}

test("Plan generates for the selected client, date and time and returns to scheduled review", async () => {
  const h = harness();
  const response = await h.run();
  assert.equal(response.status, 201);
  assert.equal((await response.json()).url, `/coach/clients/${clientId}/prescriptions/draft?mode=plan`);
  const generation = h.calls.find(call => call.name === "generate")?.args[0] as { clientId: string; plannedFor: { organizationId: string; date: string; time: string } };
  assert.deepEqual(generation.plannedFor, { organizationId: "gym", date: "2027-01-05", time: "09:30" });
  assert.equal(generation.clientId, clientId);
  assert.ok(!h.calls.some(call => call.name.includes("training_readiness")));
});

test("Plan reopens an existing workout and requires an explicit updated intake review", async () => {
  const existing = harness({ workoutId: "existing" });
  assert.equal((await (await existing.run()).json()).url, `/coach/clients/${clientId}/workouts/existing`);
  const h = harness({ needsSafetyReview: true });
  assert.equal((await h.run()).status, 422);
  assert.ok(!h.calls.some(call => call.name === "generate"));
  assert.equal((await h.run({ date: "2027-01-05", time: "09:30", intakeReviewed: true })).status, 201);
  assert.ok(h.calls.some(call => call.name === "confirm_intake_generation_safety"));
});

test("Plan rejects other roles, foreign origins and invalid dates or times before generation", async () => {
  for (const role of ["client", "owner"]) assert.equal((await harness({ role }).run()).status, 403);
  const foreign = harness();
  assert.equal((await foreign.run(undefined, "https://other.example")).status, 403);
  assert.equal(foreign.calls.length, 0);
  for (const body of [{ date: "2027-02-30", time: "09:30" }, { date: "2027-01-05", time: "24:00" }]) {
    const h = harness();
    assert.equal((await h.run(body)).status, 400);
    assert.equal(h.calls.length, 0);
  }
});
