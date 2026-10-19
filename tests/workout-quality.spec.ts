import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

type Account = { id: string; role: string; email: string; password: string; name: string };
const accounts: Account[] = JSON.parse(process.env.BETA_QA_USERS ?? "[]");
test.use({ trace: "off", actionTimeout: 25_000 });
async function login(page: Page, account: Account) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(account.email); await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Login", exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/${account.role}$`), { timeout: 15_000 });
}
async function scoped(account: Account) {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  expect(error, "Disposable ordinary-user login failed").toBeNull(); return client;
}
test("three-client quality generation, Owner programming review and mobile workout player", async ({ page, browser }, info) => {
  test.skip(process.env.RAVOGE_QUALITY_QA !== "yes" || info.project.name !== "desktop", "Explicit disposable Ravoge quality fixtures required");
  test.setTimeout(540_000);
  const owner = accounts.find(a => a.role === "owner")!, coachAccount = accounts.find(a => a.role === "coach")!;
  const clients = accounts.filter(a => a.role === "client"); expect(clients).toHaveLength(3);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await login(page, owner); await page.goto("/owner/equipment");
  const checklist = page.locator("form").filter({ has: page.getByRole("button", { name: "Save available equipment", exact: true }) });
  for (const label of ["Barbell", "Plates", "Squat rack", "Bench", "Dumbbells", "Bands", "Sled", "Medicine balls"]) await checklist.getByLabel(label, { exact: true }).check();
  await checklist.getByRole("button").click(); await expect(checklist.getByRole("status")).toContainText("preserved");
  for (const [type, name] of [["rower", "Quality Rower"], ["ski_erg", "Quality SkiErg"]]) {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add equipment", exact: true }) });
    await form.getByLabel("Equipment type", { exact: true }).selectOption(type); await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByRole("button", { name: "Add equipment", exact: true }).click(); await expect(form.getByRole("status")).toContainText("Saved");
  }
  await page.getByText("Add turf or training space", { exact: true }).click();
  const turf = page.locator("form").filter({ has: page.getByRole("button", { name: "Add facility feature", exact: true }) });
  await turf.getByLabel("Name", { exact: true }).fill("Quality 25-yard turf"); await turf.getByLabel("Usable length").fill("25"); await turf.getByRole("button").click(); await expect(turf.getByRole("status")).toContainText("Saved");

  const sources = [
    { title: "Quality Circuit", goal: "fat_loss", duration: 11, format: "circuit", rows: [["Goblet Squat", "reps", "8"], ["Band Row", "reps", "8"], ["Dead Bug", "reps", "8"]], source: "Circuit A, 3 rounds: Goblet Squat 8, Band Row 8, Dead Bug 8. Rest 30s." },
    { title: "Quality Strength", goal: "strength", duration: 23, format: "straight", rows: [["Back Squat", "reps", "5"], ["Bench Press", "reps", "5"], ["Romanian Deadlift", "reps", "5"]], source: "Back Squat 3 x 5\nBench Press 3 x 5\nRomanian Deadlift 3 x 5\nRest 120 seconds between sets." },
    { title: "Quality Stations", goal: "athletic_performance", duration: 18, format: "emom", rows: [["Rower Interval", "time", "1"], ["Sled Push", "distance", "1"], ["Medicine Ball Chest Pass", "reps", "5"]], source: "EMOM: Rower 30s; Sled Push 10m; Medicine Ball Chest Pass 5 reps. Six visits each in 60s slots." },
  ];
  await page.goto("/owner/training-library/import");
  const csv = "Title,Duration,Goal,Description\n" + sources.map(s => `${s.title},${s.duration},${s.goal},"${s.source.replaceAll('"', '""')}"`).join("\n") + '\nUnresolved source,,,"EMOM unknown percentages, missing per-side targets"\n';
  await page.getByLabel("Workout history file").setInputFiles({ buffer: Buffer.from(csv), name: "quality-programming.csv", mimeType: "text/csv" });
  await page.getByRole("button", { name: "Parse and preview" }).click(); await page.getByRole("button", { name: "Save import", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "saved as draft" })).toBeVisible();
  const api = await scoped(owner);
  const { data: library } = await api.from("exercise_library").select("id,name").eq("is_active", true);
  for (const source of sources) {
    await page.goto("/owner/training-library"); await page.getByRole("link", { name: source.title, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Original imported row" })).toBeVisible();
    await page.getByLabel("Intended goal").selectOption(source.goal); await page.getByLabel("Session duration (minutes)").fill(String(source.duration));
    const existing = await page.getByRole("group", { name: /^Exercise \d+$/ }).count();
    for (let i = existing; i < 3; i++) await page.getByRole("button", { name: "Add reviewed exercise" }).click();
    for (const [i, [name, measurement, reps]] of source.rows.entries()) {
      const row = page.getByRole("group", { name: `Exercise ${i + 1}`, exact: true });
      const exercise = library?.find(e => e.name === name); expect(exercise, `Approved core exercise ${name}`).toBeTruthy();
      await row.getByLabel("Recognized exercise").selectOption(exercise!.id); await row.getByLabel("Sets", { exact: true }).fill(source.format === "emom" ? "6" : "3"); await row.getByLabel("Reps per set").fill(reps);
      await row.getByLabel("Source evidence / reviewed interpretation").fill(source.source); await row.getByLabel("Workout block").selectOption(source.format === "emom" ? "conditioning" : "strength"); await row.getByLabel("Format", { exact: true }).selectOption(source.format);
      await row.getByLabel("Group / circuit label").fill(source.format === "straight" ? "" : "A"); await row.getByLabel("Target measurement").selectOption(measurement);
      if (measurement === "time") await row.getByLabel("Work seconds", { exact: true }).fill("30");
      if (measurement === "distance") await row.getByLabel("Distance per length / set").fill("10");
      if (source.format === "emom") await row.getByLabel("EMOM slot seconds (work must fit)").fill("60");
      await row.getByLabel("Rest seconds, if specified").fill(source.format === "emom" ? "0" : source.format === "circuit" ? "30" : "120");
    }
    await page.getByLabel("Review notes and unresolved issues").fill("Disposable QA Owner checked the original source and every mapped protocol; no missing values invented."); await page.getByRole("checkbox", { name: /I reviewed the original/ }).check();
    await page.getByRole("button", { name: "Publish reviewed workout" }).click(); await expect(page.getByRole("status")).toContainText("Published for your gym");
  }
  await page.goto("/owner/training-library"); await expect(page.getByText(/3 reviewed, published sources available/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Unresolved source", exact: true })).toBeVisible();
  const coachApi = await scoped(coachAccount);
  const coachContext = await browser.newContext(); const coach = await coachContext.newPage(); coach.on("pageerror", e => errors.push(e.message)); await login(coach, coachAccount);
  const signatures = new Set<string>();
  for (const [index, account] of clients.entries()) {
    const goal = sources[index].goal;
    const { data: intake, error } = await coachApi.rpc("upsert_client_intake", { target_client_user_id: account.id, intake_payload: { trainingFrequencyGoal: index + 2, primaryGoal: goal, trainingYears: index === 0 ? 0 : 2, experienceLevel: index === 0 ? "beginner" : "intermediate", recentConsistency: "building", sessionDurationMinutes: 45, sleepQuality: 3, stressLevel: 3, recoveryPerception: 3, sorenessFatigue: 3, constraintTags: index === 0 ? ["impact"] : [], customFields: {} } });
    expect(error).toBeNull(); expect((await coachApi.rpc("confirm_intake_generation_safety", { target_intake_id: intake })).error).toBeNull();
    await coach.goto(`/coach/clients/${account.id}`); await coach.getByRole("button", { name: "Create workout", exact: true }).click(); await expect(coach).toHaveURL(/\/prescriptions\/[0-9a-f-]+$/, { timeout: 60_000 });
    await expect(coach.getByRole("region", { name: "Generation evidence" })).toContainText(sources[index].title); await expect(coach.getByRole("region", { name: "Generation evidence" })).toContainText("Gym-profile version:");
    if (process.env.RAVOGE_LIVE_WORKOUT_QA === "yes") await expect(coach.getByRole("region", { name: "Generation evidence" }).getByRole("status")).toContainText("OpenAI-assisted");
    else await expect(coach.getByRole("region", { name: "Generation evidence" }).getByRole("status")).toContainText("safe fallback");
    const prescriptionId = coach.url().split("/").at(-1)!;
    const { data: draft } = await coachApi.from("generated_prescriptions").select("original_recommendation,status,generation_context").eq("id", prescriptionId).single(); expect(draft?.status).toBe("draft");
    signatures.add(JSON.stringify(draft?.original_recommendation.map((e: { libraryExerciseId: string; protocol: { format: string } }) => [e.libraryExerciseId, e.protocol.format])));
    const ordinary = await scoped(account); expect((await ordinary.from("generated_prescriptions").select("id")).data).toEqual([]); expect((await ordinary.from("workout_assignments").select("id")).data).toEqual([]);
    const durationField=coach.getByLabel("Workout duration (minutes)"); const estimated=Number(await durationField.inputValue()); expect(estimated).toBeGreaterThanOrEqual(15); expect(estimated).toBeLessThanOrEqual(45); await durationField.fill(String(Math.min(45,estimated+1))); await coach.getByLabel("Coach instructions", { exact: true }).fill("QA Coach reviewed technique, constraints, timing and load. Stop for pain.");
    await coach.getByRole("button", { name: "Approve & assign" }).click(); await expect(coach).toHaveURL(new RegExp(`/coach/clients/${account.id}\\?notice=prescription-assigned`));
    const { data: assignments } = await ordinary.from("workout_assignments").select("id"); expect(assignments).toHaveLength(1);
    const context = await browser.newContext(); const client = await context.newPage(); client.on("pageerror", e => errors.push(e.message)); await login(client, account);
    await client.goto(`/client/workouts/${assignments![0].id}`); const player = client.getByRole("region", { name: "Ravoge workout player" }); await expect(player).toBeVisible();
    for (const [width, height] of [[390, 844], [768, 1024], [1024, 768]]) { await client.setViewportSize({ width, height }); expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await client.screenshot({ path: info.outputPath(`quality-${index}-${width}.png`), fullPage: true }); }
    const start = player.getByRole("button", { name: "Start workout", exact: true }); await start.focus(); await expect(start).toBeFocused(); await client.keyboard.press("Enter"); await expect(player.getByRole("status")).toContainText("Workout started");
    const rest = player.getByRole("button", { name: /^Start rest timer/ }).first();
    if (await rest.count()) { await rest.click(); await expect(player.getByRole("timer").first()).not.toHaveText("Rest · 0:00"); }
    const workTimer = player.getByRole("button", { name: "Start interval timer", exact: true }).first();
    if (await workTimer.count()) { await workTimer.click(); await expect(player.getByRole("timer").filter({ hasText: /Work|Slot/ }).first()).toBeVisible(); }
    let form = player.locator('form[aria-label]').filter({ has: client.getByRole("button", { name: "Complete set", exact: true }) }).first();
    const completeSet = form.getByRole("button", { name: "Complete set", exact: true }); await completeSet.click(); await expect(completeSet).not.toBeVisible();
    form = player.locator('form[aria-label]').filter({ has: client.getByRole("button", { name: "Modified", exact: true }) }).filter({ visible: true }).first();
    await form.getByLabel(/Pain or problem/).check(); await form.getByRole("textbox").fill("QA discomfort reported; stop and discuss with Coach."); const modified = form.getByRole("button", { name: "Modified", exact: true }); await modified.click(); await expect(modified).not.toBeVisible();
    while (await player.getByRole("button", { name: "Missed", exact: true }).count()) {
      const next = player.getByRole("button", { name: "Missed", exact: true }).first(); await next.click(); await expect(next).not.toBeVisible();
    }
    await player.getByLabel("How difficult was today’s workout?").selectOption("3"); await player.getByLabel("Short feedback (optional)").fill("Disposable QA workout completed with honest modified/missed results."); await player.getByRole("button", { name: "Complete workout", exact: true }).click(); await expect(player.getByRole("status")).toContainText("Workout recorded");
    expect((await ordinary.from("workout_assignments").select("status").eq("id", assignments![0].id).single()).data?.status).toBe("completed");
    await ordinary.auth.signOut(); await context.close();
  }
  expect(signatures.size).toBe(3); expect(errors).toEqual([]); await coachContext.close(); await coachApi.auth.signOut(); await api.auth.signOut();
});
