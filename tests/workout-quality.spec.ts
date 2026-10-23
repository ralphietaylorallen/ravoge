import { test, expect, type Page, type Locator } from "@playwright/test";
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
async function nextOpenSet(player: Locator) {
  const visible = player.locator('form[aria-label]').filter({ visible: true }).first();
  const label = await visible.getAttribute("aria-label");
  const article = await visible.locator("xpath=ancestor::article").getAttribute("id");
  // Bind the exact set before saving. A successful save closes it; a live
  // `first visible form` locator would then point at a different, unsaved set.
  return player.locator(`#${article}`).getByRole("form", { name: label!, exact: true, includeHidden: true });
}
test("three-client quality generation, Owner programming review and mobile workout player", async ({ page, browser }, info) => {
  test.skip(process.env.RAVOGE_QUALITY_QA !== "yes" || info.project.name !== "desktop", "Explicit disposable Ravoge quality fixtures required");
  test.setTimeout(540_000);
  const intelligenceQa = process.env.RAVOGE_INTELLIGENCE_QA === "yes";
  const focuses = ["fat_loss_support", "muscle_growth", "running_5k"];
  const owner = accounts.find(a => a.role === "owner")!, coachAccount = accounts.find(a => a.role === "coach")!;
  const clients = accounts.filter(a => a.role === "client"); expect(clients).toHaveLength(3);
  const errors: string[] = []; page.on("pageerror", e => errors.push(`${new URL(page.url()).pathname}: ${e.message}`));
  await login(page, owner); await page.goto("/owner/equipment");
  const checklist = page.locator("form").filter({ has: page.getByRole("button", { name: "Save available equipment", exact: true }) });
  for (const label of ["Barbell", "Plates", "Squat rack", "Bench", "Dumbbells", "Bands", "Sled", "Medicine balls"]) await checklist.getByLabel(label, { exact: true }).check();
  await checklist.getByRole("button").click(); await expect(checklist.getByRole("status")).toContainText("preserved");
  for (const type of ["barbell", "plates"]) {
    const item = page.locator("li").filter({ has: page.locator(`select[name="equipmentType"] option[value="${type}"]:checked`) });
    await item.getByText("Edit inventory", { exact: true }).click();
    await item.getByLabel("Minimum weight (lb)").fill(type === "barbell" ? "35" : "2.5");
    await item.getByLabel("Maximum weight (lb)").fill("45");
    await item.getByLabel(type === "barbell" ? "Exact unloaded bar weights (lb)" : "Exact individual plate sizes (lb)").fill(type === "barbell" ? "45, 35, 45" : "45, 2.5, 5, 10, 25, 35");
    if (type === "plates") await item.getByRole("checkbox", { name: /I confirm at least one matching pair/ }).check();
    await item.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(item.getByRole("status")).toContainText("Saved"); await expect(item.getByLabel("Equipment type",{exact:true})).toHaveValue(type);
  }
  await page.reload(); await expect(page.getByText("Exact sizes: 35, 45 lb", { exact: true })).toBeVisible();
  for (const [width,height] of [[390,844],[768,1024],[1024,768]]) { await page.setViewportSize({width,height}); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await page.screenshot({path:info.outputPath(`equipment-lb-${width}.png`),fullPage:true}); }
  for (const [type, name] of [["rower", "Quality Rower"], ["ski_erg", "Quality SkiErg"]]) {
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Add equipment", exact: true }) });
    await form.getByLabel("Equipment type", { exact: true }).selectOption(type); await form.getByLabel("Name", { exact: true }).fill(name);
    await form.getByRole("button", { name: "Add equipment", exact: true }).click(); await expect(form.getByRole("status")).toContainText("Saved", { timeout: 15_000 });
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  }
  await page.getByText("Add turf or training space", { exact: true }).click();
  const turf = page.locator("form").filter({ has: page.getByRole("button", { name: "Add facility feature", exact: true }) });
  await turf.getByLabel("Name", { exact: true }).fill("Quality 25-yard turf"); await turf.getByLabel("Usable length").fill("25"); await turf.getByRole("button").click(); await expect(turf.getByRole("status")).toContainText("Saved");

  const sources = [
    { title: "Quality Circuit", goal: "fat_loss", duration: 11, format: "circuit", rows: [["Goblet Squat", "reps", "8"], ["Band Row", "reps", "8"], ["Dead Bug", "reps", "8"]], source: "Circuit A, 3 rounds: Goblet Squat 8, Band Row 8, Dead Bug 8. Rest 30s." },
    { title: "Quality Strength", goal: intelligenceQa ? "muscle_gain" : "strength", duration: 23, format: "straight", rows: [["Back Squat", "reps", "5"], ["Bench Press", "reps", "5"], ["Romanian Deadlift", "reps", "5"]], source: "Back Squat 3 x 5 at 95 lb\nBench Press 3 x 5\nRomanian Deadlift 3 x 5\nRest 120 seconds between sets." },
    { title: "Quality Stations", goal: "athletic_performance", duration: 18, format: "emom", rows: [["Rower Interval", "time", "1"], ["Sled Push", "distance", "1"], ["Medicine Ball Chest Pass", "reps", "5"]], source: "EMOM: Rower 30s; Sled Push 10m; Medicine Ball Chest Pass 5 reps. Six visits each in 60s slots." },
  ];
  await page.goto("/owner/training-library/import");
  const csv = "Title,Duration,Goal,Description\n" + sources.map(s => `${s.title},${s.duration},${s.goal},"${s.source.replaceAll('"', '""')}"`).join("\n") + '\nUnresolved source,,,"EMOM unknown percentages, missing per-side targets"\n';
  await page.getByLabel("Workout history file").setInputFiles({ buffer: Buffer.from(csv), name: "quality-programming.csv", mimeType: "text/csv" });
  await page.getByRole("button", { name: "Parse and preview" }).click(); await page.getByRole("button", { name: "Save import", exact: true }).click(); await expect(page.getByRole("status").filter({ hasText: "Added to your gym" })).toBeVisible();
  const api = await scoped(owner);
  for (const [type, sizes, quantity] of [...[20,25,30,35,40,50].map(n => ["dumbbells", [n], 2]), ["sled", [45], 1], ["medicine_balls", [8], 1]] as [string,number[],number][]) {
    expect((await api.rpc("save_gym_resource_lb", { target_id:null,resource_kind:"equipment",resource_type:type,resource_name:`Quality confirmed ${type} ${sizes[0]}`,resource_quantity:quantity,resource_length:null,resource_unit:"yards",available:true,resource_notes:null,minimum_lb:sizes[0],maximum_lb:sizes[0],exact_sizes_lb:sizes,matched_pairs:false })).error).toBeNull();
  }
  const { data: library } = await api.from("exercise_library").select("id,name,equipment_requirements").eq("is_active", true);
  const { data: loadRules, error: ruleError } = await api.from("exercise_load_rules").select("exercise_id,prescription_type").eq("active",true);
  expect(ruleError).toBeNull();
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
      if(source.title === "Quality Strength" && i === 0) await row.getByLabel("Load (lb), if specified").fill("95");
      await row.getByLabel("Rest seconds, if specified").fill(source.format === "emom" ? "0" : source.format === "circuit" ? "30" : "120");
    }
    await page.getByLabel("Review notes and unresolved issues").fill("Disposable QA Owner checked the original source and every mapped protocol; no missing values invented."); await page.getByRole("checkbox", { name: /I reviewed the original/ }).check();
    await page.getByRole("button", { name: "Publish reviewed workout" }).click(); await expect(page.getByRole("status")).toContainText("Published for your gym");
    if(source.title === "Quality Strength") { await page.reload(); await expect(page.getByRole("group",{name:"Exercise 1",exact:true}).getByLabel("Load (lb), if specified")).toHaveValue("95"); }
  }
  await page.goto("/owner/training-library"); await expect(page.getByRole('status').filter({hasText:/4 gym references enabled · 3 fully structured templates/})).toBeVisible();
  await expect(page.getByRole("link", { name: "Unresolved source", exact: true })).toBeVisible();
  const coachApi = await scoped(coachAccount);
  const { data: originalRows } = await api.from("training_library_items").select("id,normalized_content").order("id");
  expect(originalRows).toHaveLength(4);
  const coachContext = await browser.newContext(); const coach = await coachContext.newPage(); coach.on("pageerror", e => errors.push(`${new URL(coach.url()).pathname}: ${e.message}`)); await login(coach, coachAccount);
  const signatures = new Set<string>();
  for (const [index, account] of clients.entries()) {
    const goal = sources[index].goal;
    const { data: intake, error } = await coachApi.rpc("upsert_client_intake", { target_client_user_id: account.id, intake_payload: { trainingFrequencyGoal: index + 2, primaryGoal: goal, trainingYears: index === 0 ? 0 : 2, experienceLevel: index === 0 ? "beginner" : "intermediate", recentConsistency: "building", sessionDurationMinutes: 45, sleepQuality: 3, stressLevel: 3, recoveryPerception: 3, sorenessFatigue: 3, constraintTags: index === 0 ? ["impact"] : [], customFields: intelligenceQa ? { trainingFocus: focuses[index] } : {} } });
    expect(error).toBeNull(); expect((await coachApi.rpc("confirm_intake_generation_safety", { target_intake_id: intake })).error).toBeNull();
    if (index === 1) {
      await coach.goto(`/coach/clients/${account.id}?tab=intake`);
      if (intelligenceQa) await expect(coach.locator("#trainingFocus")).toHaveValue(focuses[index]);
      await coach.getByRole("button", { name: "Continue →", exact: true }).click();
      for(const [id,value] of Object.entries({squatLoadLb:"95",squatReps:"5",squatOneRmLb:"135",benchLoadLb:"65",benchReps:"5",benchOneRmLb:"95",pullupStrictReps:"0"})) await coach.locator(`#${id}`).fill(value);
      await coach.getByRole("button", {name:"Continue →",exact:true}).click(); await coach.locator("#rowerDistanceM").fill("500"); await coach.locator("#rowerTimeSeconds").fill("120");
      await coach.getByRole("button", {name:"Continue →",exact:true}).click(); await coach.getByLabel("Assessment status").selectOption("completed"); await coach.locator("#inbodyTestDate").fill(new Date().toISOString().slice(0,10));
      for(const [id,value] of Object.entries({weightLb:"190",skeletalMuscleMassLb:"80",bodyFatPercentage:"24",goalWeightLb:"180",goalSkeletalMuscleMassLb:"85",goalBodyFatPercentage:"18"})) await coach.locator(`#${id}`).fill(value);
      await coach.getByRole("button", {name:"Continue →",exact:true}).click(); await expect(coach.locator("body")).not.toContainText(/\bkg\b|kilograms/i);
      for(const [width,height] of [[390,844],[820,1180],[1024,768]]) { await coach.setViewportSize({width,height}); expect(await coach.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await coach.screenshot({path:info.outputPath(`intake-lb-${width}.png`),fullPage:true}); }
      await coach.getByRole("button",{name:"Save versioned intake & baseline"}).click(); await expect(coach.getByRole("status")).toContainText("Versioned intake and baseline saved");
      await coach.reload(); expect(Number(await coach.locator("#goalWeightLb").inputValue())).toBeCloseTo(180,7); expect(Number(await coach.locator("#goalSkeletalMuscleMassLb").inputValue())).toBeCloseTo(85,7);
      if (intelligenceQa) await expect(coach.locator("#trainingFocus")).toHaveValue(focuses[index]);
      const {data:latest}=await coachApi.from("client_intakes").select("id").eq("client_user_id",account.id).order("version",{ascending:false}).limit(1).single();
      expect((await coachApi.rpc("confirm_intake_generation_safety",{target_intake_id:latest!.id})).error).toBeNull();
      const {data:body}=await coachApi.from("client_body_composition_assessments").select("weight_kg,skeletal_muscle_mass_kg").eq("intake_id",latest!.id).single();
      expect(body!.weight_kg*2.20462262185).toBeCloseTo(190,2); expect(body!.skeletal_muscle_mass_kg*2.20462262185).toBeCloseTo(80,2);
      await coach.goto(`/coach/clients/${account.id}?tab=progress`); await expect(coach.locator("body")).not.toContainText(/\bkg\b|kilograms/i);
      await page.goto(`/owner/clients/${account.id}?tab=progress`); await expect(page.getByRole("columnheader",{name:"Weight (lb)"})).toBeVisible(); await expect(page.getByRole("cell",{name:"190.0",exact:true})).toBeVisible(); await expect(page.locator("body")).not.toContainText(/\bkg\b|kilograms/i);
      await page.goto("/owner/reports"); await expect(page.locator("body")).toContainText("190.0 lb"); await expect(page.locator("body")).not.toContainText(/\bkg\b|kilograms/i);
    }
    await coach.goto(`/coach/clients/${account.id}`); await coach.getByRole("button", { name: "Create workout", exact: true }).click(); await expect(coach).toHaveURL(/\/prescriptions\/[0-9a-f-]+(?:\?generationIssue=[^#]+)?$/, { timeout: 60_000 });
    if (!intelligenceQa) await expect(coach.getByRole("region", { name: "Generation evidence" })).toContainText(sources[index].title);
    await expect(coach.getByRole("region", { name: "Generation evidence" })).toContainText("Gym-profile version:");
    const prescriptionId = new URL(coach.url()).pathname.split("/").at(-1)!;
    const { data: draft } = await coachApi.from("generated_prescriptions").select("original_recommendation,status,generation_context").eq("id", prescriptionId).single(); expect(draft?.status).toBe("draft");
    if (process.env.RAVOGE_LIVE_WORKOUT_QA === "yes") await expect(coach.getByRole("region", { name: "Generation evidence" }).getByRole("status"), `Provider outcome: ${draft?.generation_context?.fallbackReason ?? "no fallback reason"}; notice: ${new URL(coach.url()).searchParams.get("generationIssue") ?? "none"}`).toContainText("OpenAI-assisted");
    else await expect(coach.getByRole("region", { name: "Generation evidence" }).getByRole("status")).toContainText("safe fallback");
    if (intelligenceQa) {
      const snapshot = draft!.generation_context.trainingSnapshot;
      expect(snapshot.trainingFocus).toBe(focuses[index]); expect(snapshot.knowledgeCatalog).toBeUndefined();
      expect(snapshot.knowledgeCounts).toMatchObject({ total: 4, approved: 3 });
      expect(snapshot.facilities.some((f: { type: string; length: number; unit: string }) => f.type === "turf" && f.length === 25 && f.unit === "yards")).toBe(true);
      expect(snapshot.intelligence.analysis.objectives).toContain(["fat_loss_support", "hypertrophy", "running_economy"][index]);
      expect(snapshot.references.length).toBeGreaterThan(0);
      expect(snapshot.references.some((r: { goal: string }) => r.goal === goal)).toBe(true);
      if (process.env.RAVOGE_LIVE_WORKOUT_QA === "yes") {
        expect(snapshot.intelligence.method).toBe("openai");
        expect(draft!.generation_context.sourceType).toBe("reviewed_organization_references");
        expect(draft!.generation_context.referenceVersions.map((r: { id: string }) => r.id)).toEqual(snapshot.references.map((r: { id: string }) => r.id));
        expect(draft!.original_recommendation.every((e: { protocol: { targetRpe: number } }) => e.protocol.targetRpe <= snapshot.intelligence.analysis.intensityCeiling)).toBe(true);
      }
    }
    signatures.add(JSON.stringify(draft?.original_recommendation.map((e: { libraryExerciseId: string; protocol: { format: string } }) => [e.libraryExerciseId, e.protocol.format])));
    const ordinary = await scoped(account); expect((await ordinary.from("generated_prescriptions").select("id")).data).toEqual([]); expect((await ordinary.from("workout_assignments").select("id")).data).toEqual([]);
    const durationField=coach.getByLabel("Workout duration (minutes)"); const estimated=Number(await durationField.inputValue()); expect(estimated).toBeGreaterThanOrEqual(15); expect(estimated).toBeLessThanOrEqual(45); await durationField.fill(String(Math.min(45,estimated+1))); await coach.getByLabel("Coach instructions", { exact: true }).fill("QA Coach reviewed technique, constraints, timing and load. Stop for pain.");
    for (const band of await coach.locator('input[name="bandResistance"]:not([type="hidden"])').all()) await band.fill("Light band — explicitly confirmed for QA");
    if (index === 1) {
      const row=coach.locator("fieldset").filter({has:coach.locator('select[name="libraryExerciseId"]')}).first();
      await row.getByLabel("Exercise",{exact:true}).selectOption(library!.find(e=>e.name==="Back Squat")!.id);
      await row.getByLabel("Target measurement").selectOption("reps"); await row.getByLabel("Reps",{exact:true}).fill("5"); await row.getByLabel("Load (lb)",{exact:true}).fill("95");
      await expect(coach.locator("body")).not.toContainText(/\bkg\b|kilograms/i);
      for(const [width,height] of [[390,844],[820,1180],[1024,768]]) { await coach.setViewportSize({width,height}); expect(await coach.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); await coach.screenshot({path:info.outputPath(`review-lb-${width}.png`),fullPage:true}); }
    }
    // The generator may correctly require technique calibration when the
    // calculated load is below this synthetic gym's smallest confirmed size.
    // Act as the reviewing Coach; never bypass the approval validation.
    for (const row of await coach.locator("fieldset").filter({has:coach.locator('select[name="libraryExerciseId"]')}).all()) {
      const id=await row.locator('select[name="libraryExerciseId"]').inputValue();
      const rule=loadRules!.find(r=>r.exercise_id===id);
      const load=row.locator('input[name="exerciseLoad"]');
      if (["weighted","carry","sled"].includes(rule?.prescription_type ?? "") && await load.inputValue()==="") {
        const equipment=library!.find(e=>e.id===id)!.equipment_requirements as string[];
        const confirmed=equipment.includes("dumbbells") ? 20 : equipment.includes("barbell") ? 35 : equipment.includes("sled") ? 45 : equipment.includes("medicine_balls") ? 8 : null;
        expect(confirmed,"Calibration must use an exact size explicitly saved in this QA gym").not.toBeNull();
        await load.fill(String(confirmed));
      }
    }
    await coach.getByRole("button", { name: "Approve & assign" }).click(); await expect(coach).toHaveURL(new RegExp(`/coach/clients/${account.id}\\?notice=prescription-assigned`),{timeout:15_000});
    const { data: assignments } = await ordinary.from("workout_assignments").select("id"); expect(assignments).toHaveLength(1);
    const context = await browser.newContext(); const client = await context.newPage(); client.on("pageerror", e => errors.push(`${new URL(client.url()).pathname}: ${e.message}`)); await login(client, account);
    await client.goto(`/client/workouts/${assignments![0].id}`); const player = client.getByRole("region", { name: "Ravoge workout player" }); await expect(player).toBeVisible();
    await expect(player.locator("details[open]")).toHaveCount(1);
    for (const [width, height] of [[390, 844], [768, 1024], [1024, 768]]) { await client.setViewportSize({ width, height }); expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await client.screenshot({ path: info.outputPath(`quality-${index}-${width}.png`), fullPage: true }); await player.getByRole("heading", { name: "Exercises", exact: true }).scrollIntoViewIfNeeded(); await client.screenshot({ path: info.outputPath(`quality-${index}-${width}-viewport.png`) }); }
    const start = player.getByRole("button", { name: "Start workout", exact: true }); await start.focus(); await expect(start).toBeFocused(); await client.keyboard.press("Enter"); await expect(player.getByRole("status")).toContainText("Workout started");
    const rest = player.getByRole("button", { name: /^Start rest timer/ }).first();
    if (await rest.count()) { await rest.click(); await expect(player.getByRole("timer").first()).not.toHaveText("Rest · 0:00"); }
    const workTimer = player.getByRole("button", { name: "Start interval timer", exact: true }).first();
    if (await workTimer.count()) { await workTimer.click(); await expect(player.getByRole("timer").filter({ hasText: /Work|Slot/ }).first()).toBeVisible(); }
    let form = await nextOpenSet(player);
    if(index===1) { await expect(form.getByLabel("Actual load (lb, optional)")).toHaveValue("95"); await form.getByLabel("Actual load (lb, optional)").fill("100"); await expect(client.locator("body")).not.toContainText(/\bkg\b|kilograms/i); }
    const completeSet = form.getByRole("button", { name: "Complete set", exact: true }); await completeSet.click(); await expect(completeSet).not.toBeVisible();
    form = await nextOpenSet(player);
    await form.getByLabel(/Pain or problem/).check(); await form.getByRole("textbox").fill("QA discomfort reported; stop and discuss with Coach."); const modified = form.getByRole("button", { name: "Modified", exact: true }); await modified.click(); await expect(modified).not.toBeVisible();
    while (await player.getByRole("button", { name: "Missed", exact: true }).count()) {
      const next = (await nextOpenSet(player)).getByRole("button", { name: "Missed", exact: true }); await next.click(); await expect(next).not.toBeVisible();
    }
    await player.getByLabel("How difficult was today’s workout?").selectOption("3"); await player.getByLabel("Short feedback (optional)").fill("Disposable QA workout completed with honest modified/missed results."); await player.getByRole("button", { name: "Complete workout", exact: true }).click(); await expect(player.getByRole("status")).toContainText("Workout recorded");
    expect((await ordinary.from("workout_assignments").select("status").eq("id", assignments![0].id).single()).data?.status).toBe("completed");
    if(index===1) {
      await coach.goto(`/coach/clients/${account.id}/workouts/${assignments![0].id}`);
      const first=coach.locator('details[id^="player-set-"]').first(); await first.locator("summary").click();
      await expect(first.getByLabel("Actual load (lb, optional)")).toHaveValue("100");
      await expect(coach.locator("body")).not.toContainText(/\bkg\b|kilograms/i);
      const {data:rows}=await coachApi.from("workout_exercises").select("load,load_unit,workout_sets(actual_load,actual_load_unit)").eq("workout_assignment_id",assignments![0].id).order("sort_order");
      expect(rows![0].load).toBe(95); expect(rows![0].load_unit).toBe("lb"); expect(rows![0].workout_sets.some(s=>s.actual_load===100&&s.actual_load_unit==="lb")).toBe(true);
    }
    await ordinary.auth.signOut(); await context.close();
  }
  expect(signatures.size).toBe(3); expect(errors).toEqual([]);
  expect((await api.from("training_library_items").select("id,normalized_content").order("id")).data).toEqual(originalRows);
  expect((await api.from("training_library_items").select("status").eq("title", "Unresolved source").single()).data?.status).not.toBe("published");
  await coachContext.close(); await coachApi.auth.signOut(); await api.auth.signOut();
});
