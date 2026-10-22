import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { defaultProtocol } from "../lib/workout-protocol";
type Account = { id: string; email: string; password: string; role: string };
const accounts: Account[] = JSON.parse(process.env.BETA_QA_USERS ?? "[]");
test.use({ trace: "off", video: "off" });
async function login(page: Page, account: Account) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(account.email); await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Login", exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/${account.role}$`));
}
async function scoped(account: Account) {
  const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await api.auth.signInWithPassword(account)).error).toBeNull(); return api;
}
test("independent Owner Coach Client: measured pounds, edit, final-set reduction and learned next draft", async ({ browser }, info) => {
  test.skip(process.env.RAVOGE_LOAD_QA !== "yes" || info.project.name !== "desktop", "Explicit disposable load QA required");
  test.setTimeout(360_000);
  const ownerAccount = accounts.find(a => a.role === "owner")!, coachAccount = accounts.find(a => a.role === "coach")!, clientAccount = accounts.find(a => a.role === "client")!;
  const ownerContext = await browser.newContext(), coachContext = await browser.newContext(), clientContext = await browser.newContext();
  const owner = await ownerContext.newPage(), coach = await coachContext.newPage(), client = await clientContext.newPage();
  const errors: string[] = []; for (const page of [owner, coach, client]) page.on("pageerror", () => errors.push("Browser runtime error"));
  const ownerApi = await scoped(ownerAccount), coachApi = await scoped(coachAccount), clientApi = await scoped(clientAccount);
  await login(owner, ownerAccount); await login(coach, coachAccount); await login(client, clientAccount);
  const { data: gym } = await ownerApi.from("organization_memberships").select("organization_id").eq("user_id", ownerAccount.id).single();
  expect((await ownerApi.rpc("add_equipment_checklist", { selected_types: ["bench", "squat_rack", "bands"] })).error).toBeNull();
  // Actual inventory is confirmed by the disposable Owner, never inferred.
  for (const [type, sizes, quantity] of [["barbell", [45], null], ["plates", [2.5, 5, 10, 25], null], ...[20, 25, 30, 35, 40, 45, 50].map(n => ["dumbbells", [n], 2])] as [string, number[], number | null][]) {
    expect((await ownerApi.rpc("save_gym_resource_lb", { target_id: null, resource_kind: "equipment", resource_type: type, resource_name: `Load QA ${type} ${sizes[0]}`, resource_quantity: quantity, resource_length: null, resource_unit: "yards", available: true, resource_notes: null, minimum_lb: Math.min(...sizes), maximum_lb: Math.max(...sizes), exact_sizes_lb: sizes, matched_pairs: type === "plates" })).error).toBeNull();
  }
  await owner.goto("/owner/training-library/load-rules"); await expect(owner.getByRole("heading", { name: "Starting-load rules" })).toBeVisible();
  // This is explicitly a synthetic QA source, never claimed as Pitt programming.
  const { data: library } = await ownerApi.from("exercise_library").select("id,name,slug,equipment_requirements").eq("is_active", true);
  const sourceIds = ["goblet-squat", "band-row", "dead-bug"].map(slug => library!.find(e => e.slug === slug)!);
  await owner.goto("/owner/training-library/import");
  const csv = 'Title,Duration,Description\nDisposable load QA source — NOT Pitt,16,"Goblet Squat 3 x 8\nBand Row 3 x 8\nDead Bug 3 x 8\nRest 60 seconds"\n';
  await owner.getByLabel("Workout history file").setInputFiles({ buffer: Buffer.from(csv), name: "disposable-load-qa.csv", mimeType: "text/csv" });
  await owner.getByRole("button", { name: "Parse and preview" }).click(); await owner.getByRole("button", { name: "Save import", exact: true }).click();
  await expect(owner.getByRole("status").filter({ hasText: "saved as draft" })).toBeVisible();
  const { data: source } = await ownerApi.from("training_library_items").select("id").eq("organization_id", gym!.organization_id).eq("title", "Disposable load QA source — NOT Pitt").single();
  expect(source).toBeTruthy();
  expect((await ownerApi.rpc("review_structured_training_item", { target_item_id: source!.id, review_title: "Disposable load QA source — NOT Pitt", review_status: "published", goal: "strength", duration_minutes: 16,
    review_exercises: sourceIds.map(e => ({ libraryExerciseId: e.id, sets: 3, reps: 8, load: null, loadUnit: "lb", restSeconds: 60, sourceText: "Explicit 3 x 8; 60 seconds rest, reviewed for synthetic QA only", notes: "Controlled technique", protocol: defaultProtocol() })), review_notes: "Synthetic source, not Pitt programming. Explicit Owner-confirmed review.", source_confirmed: true })).error).toBeNull();
  await coach.goto(`/coach/clients/${clientAccount.id}?tab=intake`);
  // Controlled QA profile: test a comparable source movement rather than
  // assuming an unconstrained generative model always selects one exact lift.
  // These explicit exercise exclusions go through the real saved intake and
  // Coach safety review; neither the provider nor DB checks are mocked.
  const excludedNames = library!.filter(e => !sourceIds.some(source => source.id === e.id)).map(e => e.name);
  // Both existing intake fields accept at most 30 entries; do not let their
  // intentional cap silently make the QA profile nondeterministic.
  await coach.locator("#avoidedExercises").fill(excludedNames.slice(0, 30).join(", "));
  await coach.locator("#movementsToAvoid").fill(excludedNames.slice(30).join(", "));
  for (const [id, value] of Object.entries({ primaryGoal: "strength", experienceLevel: "intermediate", recentConsistency: "building" })) await coach.locator(`#${id}`).selectOption(value);
  for (const [id, value] of Object.entries({ trainingFrequencyGoal: "3", trainingYears: "2", sessionDurationMinutes: "45" })) await coach.locator(`#${id}`).fill(value);
  for (const id of ["sleepQuality", "stressLevel", "recoveryPerception", "sorenessFatigue"]) await coach.locator(`#${id}`).selectOption("3");
  await coach.getByRole("button", { name: "Continue →", exact: true }).click();
  for (const [id, value] of Object.entries({ squatLoadLb: "150", squatReps: "5", squatOneRmLb: "200", benchLoadLb: "100", benchReps: "5", benchOneRmLb: "150", pullupStrictReps: "0" })) await coach.locator(`#${id}`).fill(value);
  await coach.getByRole("button", { name: "Continue →", exact: true }).click(); await coach.locator("#rowerDistanceM").fill("500"); await coach.locator("#rowerTimeSeconds").fill("120");
  await coach.getByRole("button", { name: "Continue →", exact: true }).click(); await coach.getByRole("button", { name: "Continue →", exact: true }).click();
  await coach.getByRole("button", { name: "Save versioned intake & baseline" }).click(); await expect(coach.getByRole("status")).toContainText("Versioned intake and baseline saved");
  const { data: intake } = await coachApi.from("client_intakes").select("id").eq("client_user_id", clientAccount.id).order("version", { ascending: false }).limit(1).single();
  expect((await coachApi.rpc("confirm_intake_generation_safety", { target_intake_id: intake!.id })).error).toBeNull();
  async function generate() {
    await coach.goto(`/coach/clients/${clientAccount.id}`); await coach.getByRole("button", { name: "Create workout", exact: true }).click(); await expect(coach).toHaveURL(/\/prescriptions\//, { timeout: 70_000 });
    const id = new URL(coach.url()).pathname.split("/").at(-1)!;
    const { data: draft } = await coachApi.from("generated_prescriptions").select("*").eq("id", id).single();
    expect(draft!.generation_context.loadEngine).toBe("deterministic-v1");
    if (process.env.RAVOGE_LIVE_WORKOUT_QA === "yes") expect(draft!.engine_version, `Provider outcome: ${new URL(coach.url()).searchParams.get("generationIssue") ?? draft!.generation_context.fallbackReason}`).toBe("prescription-v0.4-openai");
    return draft!;
  }
  const first = await generate();
  const gobletId = sourceIds[0].id;
  const goblet = first.original_recommendation.find((e: { libraryExerciseId: string }) => e.libraryExerciseId === gobletId);
  expect(goblet, "The real generation must select the reviewed weighted variation").toBeTruthy();
  expect(goblet.loadPrescription.basis).toBe("intake percentage"); expect(goblet.load).toBeGreaterThan(0); expect(goblet.load).toBeLessThanOrEqual(50);
  await expect(coach.getByText(/25(?:\.0+)?% of saved/)).toBeVisible(); await expect(coach.getByText(/Rounded down to confirmed equipment/).first()).toBeVisible();
  const rows = coach.locator('fieldset').filter({ has: coach.locator('select[name="libraryExerciseId"]') });
  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i), id = await row.locator('select[name="libraryExerciseId"]').inputValue();
    if (id === gobletId) { await row.locator('[name="exerciseLoad"]').fill("40"); await row.locator('[name="exerciseSets"]').fill("3"); await row.locator('[name="exerciseReps"]').fill("8"); }
    if (await row.locator('[name="bandResistance"]').getAttribute("type") !== "hidden") await row.locator('[name="bandResistance"]').fill("Light band — QA recorded level");
    if (!await row.locator('[name="exerciseLoad"]').inputValue() && library!.find(e => e.id === id)!.equipment_requirements.some((t: string) => ["barbell", "dumbbells"].includes(t))) await row.locator('[name="exerciseLoad"]').fill(library!.find(e => e.id === id)!.equipment_requirements.includes("barbell") ? "45" : "20");
  }
  for (const [width, height] of [[390,844],[820,1180],[1440,1000]]) { await coach.setViewportSize({ width, height }); expect(await coach.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await coach.screenshot({ path: info.outputPath(`load-review-${width}.png`), fullPage: true }); }
  expect((await clientApi.from("generated_prescriptions").select("id")).data).toEqual([]);
  await coach.getByRole("button", { name: "Approve & assign" }).click(); await expect(coach).toHaveURL(/notice=prescription-assigned/);
  const { data: assignment } = await clientApi.from("workout_assignments").select("id").eq("source_prescription_id", first.id).single();
  await client.goto(`/client/workouts/${assignment!.id}`); await expect(client.getByText("40.0 lb total", { exact: true })).toBeVisible();
  const { data: assigned } = await clientApi.from("workout_exercises").select("id,library_exercise_id,reps,load,load_unit,prescription_details,load_prescription,workout_sets(id,set_number)").eq("workout_assignment_id", assignment!.id);
  expect(assigned!.find(e => e.library_exercise_id === gobletId)!.load_prescription.basis).toBe("Coach override");
  for (const exercise of assigned!) for (const set of exercise.workout_sets) {
    const reduced = exercise.library_exercise_id === gobletId && set.set_number === 3;
    expect((await clientApi.rpc("record_quality_workout_set", { target_workout_id: assignment!.id, target_set_id: set.id, result: reduced ? "modified" : "complete", performance: { reps: exercise.reps, load: reduced ? 30 : exercise.load, loadUnit: "lb", rpe: 6, pain: false, seconds: exercise.prescription_details.workSeconds, distance: exercise.prescription_details.distance } })).error).toBeNull();
  }
  expect((await clientApi.rpc("manage_quality_workout", { target_workout_id: assignment!.id, intent: "finish", difficulty: 3, feedback: "Disposable load QA final-set reduction" })).error).toBeNull();
  const later = await generate();
  const learned = later.original_recommendation.find((e: { libraryExerciseId: string }) => e.libraryExerciseId === gobletId);
  expect(learned, "Later real generation must retain a comparable goblet movement").toBeTruthy(); expect(learned.load).toBe(30); expect(learned.loadPrescription.basis).toBe("same exercise history");
  expect(later.status).toBe("draft"); expect((await clientApi.from("workout_assignments").select("id")).data).toHaveLength(1);
  // Owners retain their approved organization oversight. Unassigned Coaches
  // and other Clients do not inherit that access.
  expect((await ownerApi.from("generated_prescriptions").select("id").eq("organization_id", gym!.organization_id)).data).toHaveLength(2);
  const unrelatedCoach = await scoped(accounts.filter(a => a.role === "coach")[1]);
  const unrelatedClient = await scoped(accounts.filter(a => a.role === "client")[1]);
  expect((await unrelatedCoach.from("generated_prescriptions").select("id")).data).toEqual([]);
  expect((await unrelatedClient.from("workout_assignments").select("id")).data).toEqual([]);
  await unrelatedCoach.auth.signOut(); await unrelatedClient.auth.signOut();
  for (const [width,height] of [[390,844],[768,1024],[1440,1000]]) { await client.setViewportSize({width,height}); expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await expect(client.locator("body")).not.toContainText(/\bkg\b|kilogram/i); }
  expect(errors).toEqual([]);
  await Promise.all([ownerApi.auth.signOut(),coachApi.auth.signOut(),clientApi.auth.signOut()]); await Promise.all([ownerContext.close(),coachContext.close(),clientContext.close()]);
});
