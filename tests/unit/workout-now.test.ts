import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { selectTodayWorkout } from "../../lib/coach-workday.ts";

type Workout = { id: string; status: string; scheduled_time: string | null; scheduled_date?: string };
type Booking = { starts_at: string; timezone: string; status: string; session_type: string };
type Options = { role?: string; workouts?: Workout[]; workout?: Workout; booking?: Booking; lookupError?: boolean; preparationError?: boolean };

const clientId = "ab100000-0000-4000-8000-000000000003";
const workoutId = "ab100000-0000-4000-8000-000000000004";
const bookingId = "ab100000-0000-4000-8000-000000000005";

function harness({ role = "coach", workouts = [], workout, booking, lookupError = false, preparationError = false }: Options = {}) {
  const calls: { name: string; args: unknown[] }[] = [];
  const supabase = {
    from(table: string) {
      const q = {
        select() { return q; },
        eq(...args: unknown[]) { calls.push({ name: `${table}.eq`, args }); return q; },
        in() { return q; },
        order() { return q; },
        async limit() { return { data: workouts, error: lookupError ? { message: "connection" } : null }; },
        async maybeSingle() {
          const data = table === "bookings" ? booking : table === "workout_assignments" ? workout : { timezone: "America/Denver" };
          return { data, error: null };
        },
      };
      return q;
    },
  };
  const exports: Record<string, unknown> = {};
  const modules: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (body: unknown, options: { status: number }) => Response.json(body, options) } },
    "@/lib/auth": { getVerifiedUser: async () => ({ supabase, userId: "trainer" }), getActiveMembership: async () => ({ role, organization_id: "gym" }) },
    "@/lib/coach-workday": { selectTodayWorkout },
    "@/lib/create-workout-draft": {
      createGeneratedWorkoutDraft: async (args: unknown) => {
        calls.push({ name: "generate", args: [args] });
        return { ok: true, prescriptionId: "draft", generationIssue: "" };
      },
    },
    "@/lib/training-session": {
      prepareTrainingSession: async (...args: unknown[]) => {
        calls.push({ name: "readiness", args });
        if (preparationError) throw new Error("Client access denied");
      },
    },
    "@/lib/timezone": { DEFAULT_ORGANIZATION_TIMEZONE: "America/Denver", localDateInTimeZone: () => "2026-11-16" },
  };
  const source = readFileSync("app/api/coach/clients/[clientId]/workouts/generate/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "exports", compiled)((name: string) => { assert.ok(modules[name], name); return modules[name]; }, exports);
  return {
    calls,
    run: (context: Record<string, string> = {}) => (exports.POST as (request: Request, context: unknown) => Promise<Response>)(
      new Request("https://ravoge.com/api/workout", {
        method: "POST", headers: { host: "ravoge.com", origin: "https://ravoge.com", "content-type": "application/json" },
        body: JSON.stringify({ readiness: [4, 4, 4, 4, 4], ...context }),
      }),
      { params: Promise.resolve({ clientId }) },
    ),
  };
}
for(const role of ['owner','coach'])test(`${role} can create an unscheduled draft and stays in the correct role workspace`,async()=>{const h=harness({role});const response=await h.run();assert.equal(response.status,201);assert.equal((await response.json()).url,`/${role}/clients/ab100000-0000-4000-8000-000000000003/prescriptions/draft`);assert.equal(h.calls.filter(c=>c.name==='generate').length,1);assert.ok(h.calls.some(c=>c.name==='workout_assignments.eq'&&c.args[0]==='organization_id'&&c.args[1]==='gym'));assert.ok(h.calls.some(c=>c.name==='workout_assignments.eq'&&c.args[0]==='coach_user_id'&&c.args[1]==='trainer'));});
test('Workout Now reopens the in-progress workout instead of generating another',async()=>{const h=harness({workouts:[{id:'existing',status:'in_progress',scheduled_time:null}]});const response=await h.run();assert.equal(response.status,200);assert.match((await response.json()).url,/workouts\/existing$/);assert.equal(h.calls.filter(c=>c.name==='generate').length,0);});
test('failed saved-workout lookup cannot accidentally create a duplicate',async()=>{const h=harness({lookupError:true});assert.equal((await h.run()).status,503);assert.equal(h.calls.filter(c=>c.name==='generate').length,0);});
test('Client role and a failed assigned-client/readiness check cannot generate',async()=>{const client=harness({role:'client'});assert.equal((await client.run()).status,403);assert.equal(client.calls.length,0);const forbidden=harness({preparationError:true});assert.equal((await forbidden.run()).status,422);assert.equal(forbidden.calls.filter(c=>c.name==='generate').length,0);});


test("starting a selected plan saves readiness for that workout and opens it without generating", async () => {
  const h = harness({ workout: { id: workoutId, status: "assigned", scheduled_date: "2026-11-16", scheduled_time: "08:00:00" } });
  const response = await h.run({ workoutId });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).url, `/coach/clients/${clientId}/workouts/${workoutId}`);
  assert.equal(h.calls.find(call => call.name === "readiness")?.args[3], workoutId);
  assert.ok(h.calls.some(call => call.name === "workout_assignments.eq" && call.args[0] === "client_user_id" && call.args[1] === clientId));
  assert.ok(!h.calls.some(call => call.name === "generate"));
});

test("unavailable and future plans are rejected before saving readiness", async () => {
  const missing = harness();
  const future = harness({ workout: { id: workoutId, status: "assigned", scheduled_date: "2026-11-17", scheduled_time: "08:00:00" } });
  for (const h of [missing, future]) {
    assert.equal((await h.run({ workoutId })).status, 409);
    assert.ok(!h.calls.some(call => ["readiness", "generate"].includes(call.name)));
  }
});

test("starting a booked training session keeps the check-in and draft attached to the booking", async () => {
  const booking = { starts_at: "2026-11-16T15:00:00Z", timezone: "America/Denver", status: "scheduled", session_type: "Personal Training" };
  const h = harness({ booking });
  const response = await h.run({ bookingId });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).url, `/coach/clients/${clientId}/prescriptions/draft`);
  assert.ok(h.calls.some(call => call.name === "bookings.eq" && call.args[0] === "coach_user_id" && call.args[1] === "trainer"));
  assert.deepEqual(h.calls.filter(call => ["readiness", "generate"].includes(call.name)).map(call => call.name), ["readiness", "generate"]);
  assert.equal((h.calls.find(call => call.name === "generate")?.args[0] as { bookingId: string }).bookingId, bookingId);
  assert.equal((h.calls.find(call => call.name === "generate")?.args[0] as { dayOfSession: boolean }).dayOfSession, true);
  const intake = harness({ booking: { ...booking, session_type: "Intake" } });
  assert.equal((await intake.run({ bookingId })).status, 409);
  assert.ok(!intake.calls.some(call => call.name === "readiness"));
});
