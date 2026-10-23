import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { completeGoalsPage } from "./helpers/intake";

test.use({ trace: "off", actionTimeout: 25_000 });
type Account = { email: string; password: string; name: string; id: string; role: string };
const accounts: Account[] = JSON.parse(process.env.BETA_QA_USERS ?? "[]");
const newCoachEmail = process.env.BETA_QA_NEW_COACH_EMAIL!;
const newClientEmail = process.env.BETA_QA_NEW_CLIENT_EMAIL!;
const password = process.env.BETA_QA_PASSWORD!;
const path = (url: string) => { const value = new URL(url); return value.pathname + value.search; };
async function login(page: Page, account: Account, destination: string) {
  await page.goto("/login"); await page.getByLabel("Email", { exact: true }).fill(account.email); await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Login", exact: true }).click(); await expect(page).toHaveURL(new RegExp(`${destination.replaceAll("/", "\\/")}$`), { timeout: 15_000 });
}
async function signup(page: Page, name: string, email: string, role: string) {
  await page.getByLabel("Full name", { exact: true }).fill(name);
  const emailField = page.getByLabel("Email", { exact: true });
  if (await emailField.isEditable()) await emailField.fill(email);
  else expect(await emailField.inputValue() === email).toBe(true);
  await page.getByLabel("Password", { exact: true }).fill(password); await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click(); await expect(page).toHaveURL(new RegExp(`/${role}$`), { timeout: 15_000 });
  await page.reload();
  await expect(page.getByRole("navigation", { name: `${role} navigation` }), await page.locator("body").innerText()).toBeVisible();
}
async function launchEnrollment(page: Page, url: string) {
  await page.goto(path(url));
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(Boolean(href?.startsWith("/api/enrollment/"))).toBe(true);
  const manifest = await (await page.request.get(href!)).json();
  await expect(page.getByRole("link", { name: "Continue without installing" })).toHaveAttribute("href", manifest.start_url);
  // Netlify may canonicalize enrollment to a preview alias. Navigate as a real
  // same-origin link would, rather than jumping back to Playwright's baseURL.
  await page.goto(new URL(manifest.start_url, page.url()).href);
}
async function responsive(page: Page, label: string, testInfo: import("@playwright/test").TestInfo) {
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} overflow at ${width}`).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${label}-${width}.png`), fullPage: true });
  }
}

test("complete beta intake, published gym generation, approval, Client visibility and independent accounts", async ({ page, browser }, testInfo) => {
  test.skip(!accounts.length || testInfo.project.name !== "desktop", "Explicit isolated Ravoge beta fixture required.");
  test.setTimeout(360_000);
  const owner = accounts.find(account => account.role === "owner")!;
  const existingCoach = accounts.find(account => account.role === "invited_coach")!;
  const existingClient = accounts.find(account => account.role === "existing_client")!;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, owner, "/owner");
  await page.goto("/owner/equipment");
  const equipment = page.locator("form").filter({ has: page.getByRole("button", { name: "Save available equipment" }) });
  await equipment.getByLabel("Dumbbells", { exact: true }).check(); await equipment.getByLabel("Bands", { exact: true }).check();
  await equipment.getByRole("button", { name: "Save available equipment" }).click(); await expect(equipment.getByRole("status")).toContainText("preserved");
  await responsive(page, "equipment", testInfo);
  await page.goto("/owner/training-library/import");
  const csv = 'Title,Description\nBeta Gym Strength,"Goblet Squat 3 x 8\nDumbbell RDL 3 x 8\nBand Row 3 x 8"\nComplex EMOM,"EMOM 15 Minutes\nGoblet Squat x8 @ 50-60% Each"\n';
  await page.getByLabel("Workout history file").setInputFiles({ buffer: Buffer.from(csv), name: "beta-safe-and-complex.csv", mimeType: "text/csv" });
  await page.getByRole("button", { name: "Upload workouts", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added to your gym" })).toBeVisible();
  await page.goto("/owner/training-library");
  await page.getByRole("link", { name: "Complex EMOM", exact: true }).click();
  await expect(page.getByRole("button", { name: "Publish reviewed workout" })).toBeDisabled();
  await expect(page.getByText(/stays in review until/)).toBeVisible();
  await page.getByRole("button", { name: "Save as Needs review" }).click(); await expect(page.getByRole("status")).toContainText("revision saved");
  await page.goto("/owner/training-library"); await page.getByRole("link", { name: "Beta Gym Strength", exact: true }).click();
  await page.getByLabel("Intended goal").selectOption("strength"); await page.getByLabel("Session duration (minutes)").fill("45");
  await page.getByLabel("Review notes and unresolved issues").fill("Verified explicit fixed sets and reps against the original source.");
  await page.getByRole("checkbox", { name: /I reviewed the original source/ }).check();
  await page.getByRole("button", { name: "Publish reviewed workout" }).click(); await expect(page.getByRole("status")).toContainText("Published for your gym");
  await responsive(page, "training-review", testInfo);
  await page.goto("/owner/team");
  const bulk = page.locator("form").filter({ has: page.getByLabel("Email addresses — one per line") });
  await bulk.getByLabel("Email addresses — one per line").fill(`${newCoachEmail.toUpperCase()}\n${existingCoach.email}\n${newCoachEmail}`);
  await bulk.getByRole("button", { name: "Create invitations" }).click();
  await expect(bulk.getByRole("status")).toContainText("1 duplicate(s) skipped");
  await expect(bulk.getByText("Email not configured — share the secure link")).toHaveCount(2);
  const newInvite = await bulk.locator("li").filter({ hasText: newCoachEmail }).getByRole("link", { name: "Open secure invitation" }).getAttribute("href");
  let existingInvite = await bulk.locator("li").filter({ hasText: existingCoach.email }).getByRole("link", { name: "Open secure invitation" }).getAttribute("href");
  expect(Boolean(newInvite && existingInvite)).toBe(true);
  await responsive(page, "team", testInfo);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await bulk.locator("li").filter({ hasText: newCoachEmail }).getByRole("button", { name: "Copy secure invitation link" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText()) === newInvite).toBe(true);
  await page.reload();
  const pendingInvite = page.locator("li").filter({ has: page.getByText(existingCoach.email, { exact: true }) });
  await pendingInvite.getByRole("button", { name: "Resend invitation" }).click();
  await expect(pendingInvite.getByRole("status")).toContainText("Email is not configured");
  await pendingInvite.getByRole("button", { name: "Copy secure invitation link" }).click();
  const renewed = await page.evaluate(() => navigator.clipboard.readText());
  expect(renewed !== existingInvite && new URL(renewed).pathname === "/enroll/coach").toBe(true);
  existingInvite = renewed;
  const coachContext = await browser.newContext({ viewport: { width: 768, height: 1024 } }); const coach = await coachContext.newPage();
  coach.on("pageerror", error => errors.push(error.message));
  await launchEnrollment(coach, newInvite!); await signup(coach, "Beta New Coach", newCoachEmail, "coach");
  const existingContext = await browser.newContext(); const existing = await existingContext.newPage();
  await launchEnrollment(existing, existingInvite!);
  await expect.poll(() => new URL(existing.url()).pathname).toBe("/login");
  await expect(existing.getByLabel("Email", { exact: true })).toHaveValue(existingCoach.email);
  await existing.getByLabel("Password", { exact: true }).fill(existingCoach.password);
  await existing.getByRole("button", { name: "Login", exact: true }).click(); await expect(existing).toHaveURL(/\/coach$/);
  await page.goto("/owner/apps");
  expect(await page.locator('[data-app-access-card="coach"] [data-qr-value]').getAttribute("data-qr-value")).toBe("https://ravoge.com/coach/install");
  await expect(page.locator('[data-enrollment-card="coach"]')).toHaveCount(0);
  const clientQr = await page.locator('[data-enrollment-card="client"] [data-qr-value]').getAttribute("data-qr-value");
  await responsive(page, "apps", testInfo);
  const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const client = await clientContext.newPage();
  await launchEnrollment(client, clientQr!); await signup(client, "Beta New Client", newClientEmail, "client");
  await page.goto("/owner/clients"); await page.getByRole("link", { name: "Open Client: Beta New Client", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Beta New Client", exact: true })).toBeVisible();
  const actualClientId = new URL(page.url()).pathname.split("/").pop()!;
  expect(/^[0-9a-f-]{36}$/i.test(actualClientId)).toBe(true);
  await page.getByRole("button", { name: "Assign Coach", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByRole("radio", { name: /Beta New Coach/ }).check(); await dialog.getByRole("button", { name: "Confirm assignment" }).click(); await expect(dialog).not.toBeVisible();
  await coach.goto(new URL(`/coach/clients/${actualClientId}`, coach.url()).href);
  // No gym hours, session settings or Coach windows exist in this new gym.
  await coach.getByRole("link", { name: "Schedule intake", exact: true }).click();
  await expect(coach.getByRole("heading", { name: "Schedule intake", exact: true })).toBeVisible();
  const future = new Date(); future.setUTCDate(future.getUTCDate() + 1);
  let offset = 1; if (future.getUTCDay() === 0) { future.setUTCDate(future.getUTCDate() + 1); offset++; }
  const bookingDate = future.toISOString().slice(0, 10);
  await coach.locator('[aria-label="Choose a session date"] button').nth(offset).click();
  await expect(coach.locator('[aria-label="Choose a session date"] button').nth(offset)).toHaveAttribute("aria-pressed", "true");
  await expect(coach.getByRole("radio")).toHaveCount(15);
  await expect(coach.getByRole("radio", { name: "5:00 AM", exact: true })).toBeEnabled();
  await expect(coach.getByRole("radio", { name: "7:00 PM", exact: true })).toBeEnabled();
  await expect(coach.getByRole("radio", { name: "8:00 PM", exact: true })).toHaveCount(0);
  await coach.getByRole("radio", { name: "5:00 AM", exact: true }).check();
  await coach.getByRole("button", { name: "Book session for Beta New Client" }).click();
  await expect(coach.getByRole("status")).toContainText("Intake booked");
  await page.goto("/owner/schedule"); await expect(page.getByText(/with Beta New Client/)).toBeVisible(); await expect(page.getByText(/Intake · scheduled/)).toBeVisible();
  await client.goto(new URL("/client/schedule", client.url()).href);
  const sessionQuestions = client.locator("section").filter({ has: client.getByRole("heading", { name: "Your gym’s intake-session questions", exact: true }) });
  for (let position = 1; position <= 8; position++) await sessionQuestions.getByRole("button", { name: `QA session question ${position}: 5`, exact: true }).click();
  await sessionQuestions.getByRole("button", { name: "Save check-in", exact: true }).click();
  await expect(sessionQuestions.getByText("Your responses were saved securely for this intake session.", { exact: true })).toBeVisible();
  await client.reload(); await expect(sessionQuestions).toContainText("1 previous check-in saved for this session.");
  await client.goto(new URL(`/client/book?date=${bookingDate}`, client.url()).href);
  await expect(client.getByRole("radio")).toHaveCount(15);
  await expect(client.getByRole("radio", { name: /5:00 AM.*Full/ })).toBeDisabled();
  await expect(client.getByText("Full", { exact: true })).toHaveCount(1);
  await responsive(client, "fallback-calendar", testInfo);
  await coach.goto(new URL(`/coach/clients/${actualClientId}/book?date=${bookingDate}`, coach.url()).href);
  await coach.getByRole("radio", { name: "6:00 AM", exact: true }).check(); await coach.getByRole("button", { name: "Book session for Beta New Client" }).click();
  await expect(coach.getByRole("status")).toContainText("Session booked");
  await client.reload(); await expect(client.getByText("Full", { exact: true })).toHaveCount(2);
  // Race two ordinary authenticated requests. The database exclusion constraint
  // must allow exactly one, independent of stale UI on two devices.
  const ordinary = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signedIn = await ordinary.auth.signInWithPassword({ email: newClientEmail, password }); expect(signedIn.error === null).toBe(true);
  const raced = await Promise.all([1, 2].map(() => ordinary.rpc("create_client_booking", { target_starts_at: `${bookingDate}T07:00:00Z`, target_duration: 60, client_notes: null })));
  expect(raced.filter((result) => !result.error && result.data)).toHaveLength(1); expect(raced.filter((result) => result.error)).toHaveLength(1);
  const raceBooking = raced.find((result) => !result.error)!.data;
  expect((await ordinary.rpc("cancel_client_booking", { target_booking_id: raceBooking, reason: "Disposable QA cancellation" })).error === null).toBe(true);
  await client.reload(); await expect(client.getByRole("radio", { name: "7:00 AM", exact: true })).toBeEnabled();
  const sunday = new Date(future); let sundayOffset = offset; while (sunday.getUTCDay() !== 0) { sunday.setUTCDate(sunday.getUTCDate() + 1); sundayOffset++; }
  await coach.goto(new URL(`/coach/clients/${actualClientId}/book`, coach.url()).href); await coach.locator('[aria-label="Choose a session date"] button').nth(sundayOffset).click();
  await expect(coach.getByRole("radio")).toHaveCount(0);
  await coach.goto(new URL(`/coach/clients/${actualClientId}`, coach.url()).href);
  const photo = coach.locator(`[data-profile-photo-editor="${actualClientId}"]`);
  const bytes = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: "#97835d" } }).jpeg().toBuffer();
  const photoChooser = coach.waitForEvent("filechooser");
  await photo.getByRole("button", { name: /^Change .*profile photo$/ }).click();
  await (await photoChooser).setFiles({ buffer: bytes, name: "non-personal-qa.jpg", mimeType: "image/jpeg" });
  await expect(photo.getByRole("img", { name: "Cropped profile photo preview" })).toBeVisible();
  await photo.getByRole("dialog").getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(photo.getByRole("status")).toContainText("Profile photo updated"); await expect(photo.locator("button img")).toBeVisible();
  await coach.getByRole("link", { name: "Start intake now", exact: true }).click();
  await expect(coach.getByRole("heading", { name: "Beta New Client", exact: true }), await coach.locator("body").innerText()).toBeVisible();
  await completeGoalsPage(coach,{targetWeight:"80"});
  await coach.getByRole("button", { name: "Continue →", exact: true }).click();
  for (const [id, value] of Object.entries({ squatLoadLb: "40", squatReps: "5", squatOneRmLb: "45", benchLoadLb: "25", benchReps: "5", benchOneRmLb: "30", pullupStrictReps: "0" })) await coach.locator(`#${id}`).fill(value);
  await coach.getByRole("button", { name: "Continue →", exact: true }).click(); await coach.locator("#rowerDistanceM").fill("500"); await coach.locator("#rowerTimeSeconds").fill("120");
  await coach.getByRole("button", { name: "Continue →", exact: true }).click();
  await coach.getByLabel("Assessment status").selectOption("completed"); await coach.locator("#inbodyTestDate").fill(new Date().toISOString().slice(0, 10));
  for (const [id, value] of Object.entries({ weightLb: "85", bodyFatPercentage: "24", skeletalMuscleMassLb: "33", goalBodyFatPercentage: "18" })) await coach.locator(`#${id}`).fill(value);
  await coach.getByRole("button", { name: "Continue →", exact: true }).click();
  await coach.getByRole("button", { name: "Save intake", exact: true }).click(); await expect(coach.getByRole("status").filter({ hasText: "Intake saved" })).toBeVisible();
  await coach.goto(new URL(`/coach/clients/${actualClientId}`, coach.url()).href);
  await coach.getByRole("checkbox", { name: /I reviewed the latest intake/ }).check(); await coach.getByRole("button", { name: "Confirm intake safety review" }).click();
  await expect(coach.getByRole("button", { name: "Create workout", exact: true })).toBeEnabled();
  await coach.getByRole("button", { name: "Create workout", exact: true }).click();
  await expect(coach).toHaveURL(/\/prescriptions\/[0-9a-f-]+$/, { timeout: 50_000 });
  await coach.getByText("Advanced: programming details and evidence", { exact: true }).click();
  await expect(coach.getByText("Source: reviewed_organization_references.", { exact: true })).toBeVisible();
  await expect(coach.getByRole("region", { name: "Generation evidence" })).toBeVisible();
  const generatedTitle = await coach.getByLabel("Workout name", { exact: true }).inputValue();
  await expect(coach.getByRole("region", { name: "Generation evidence" }).getByRole("status")).toHaveText("OpenAI-assisted draft, validated against approved exercises and current gym equipment.");
  await client.goto(new URL("/client", client.url()).href); await expect(client).toHaveURL(/\/client$/);
  await client.screenshot({ path: testInfo.outputPath("client-before-approval.png"), fullPage: true });
  await expect(client.getByRole("navigation", { name: "client navigation" }), await client.locator("body").innerText()).toBeVisible();
  await expect(client.getByRole("link", { name: generatedTitle, exact: false })).toHaveCount(0);
  await responsive(coach, "prescription", testInfo);
  await coach.getByRole("button", { name: "Assign", exact: true }).click(); await expect(coach.getByRole("status")).toContainText("now assigned");
  await client.reload(); await expect(client).toHaveURL(/\/client$/);
  await client.screenshot({ path: testInfo.outputPath("client-after-approval.png"), fullPage: true });
  await expect(client.getByRole("link", { name: generatedTitle, exact: false })).toBeVisible();
  await client.getByRole("link", { name: generatedTitle, exact: false }).click();
  await expect(client.getByRole("heading", { name: generatedTitle, exact: true })).toBeVisible(); await expect(client.getByRole("heading", { name: "Exercises", exact: true })).toBeVisible(); await responsive(client, "client-workout", testInfo);
  await ordinary.auth.signOut();
  // An existing Client uses the same gym QR without creating a second identity.
  const existingClientContext = await browser.newContext(); const existingClientPage = await existingClientContext.newPage();
  await launchEnrollment(existingClientPage, clientQr!);
  await existingClientPage.getByRole("link", { name: /Sign in to continue this enrollment/ }).click();
  await expect(existingClientPage).toHaveURL(/\/login\?enrollment=/);
  await expect(existingClientPage.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();
  if (await existingClientPage.getByLabel("Email", { exact: true }).isEditable()) await existingClientPage.getByLabel("Email", { exact: true }).fill(existingClient.email);
  await expect(existingClientPage.getByLabel("Email", { exact: true })).toHaveValue(existingClient.email);
  await existingClientPage.getByLabel("Password", { exact: true }).fill(existingClient.password);
  await existingClientPage.getByRole("button", { name: "Login", exact: true }).click();
  try { await expect(existingClientPage).toHaveURL(/\/client$/); }
  catch {
    await existingClientPage.screenshot({ path: testInfo.outputPath("existing-client-acceptance.png"), fullPage: true });
    throw new Error(`Existing Client acceptance did not complete: ${await existingClientPage.locator("body").innerText()}`);
  }
  // Six distinct Coach sessions remain authenticated at the same time.
  const extraContexts = [];
  for (const account of accounts.filter(account => account.role === "coach")) { const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } }); const actor = await ctx.newPage(); await login(actor, account, "/coach"); extraContexts.push(ctx); }
  await coach.reload(); await expect(coach).toHaveURL(new RegExp(`/coach/clients/${actualClientId}`));
  await existing.reload(); await expect(existing).toHaveURL(/\/coach$/);
  for (const ctx of extraContexts) { const actor = ctx.pages()[0]; await actor.reload(); await expect(actor).toHaveURL(/\/coach$/); await actor.goto(`/coach/clients/${actualClientId}`); await expect(actor.getByText("404 · Route not found", { exact: true })).toBeVisible(); await expect(actor.getByRole("heading", { name: "Beta New Client", exact: true })).toHaveCount(0); }
  // Account switching clears the prior Owner session and private page cache.
  await page.getByRole("button", { name: "Log out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  await page.goto("/owner/team"); await expect(page).toHaveURL(/\/login/);
  await login(page, existingCoach, "/coach"); await page.goto("/owner"); await expect(page).toHaveURL(/\/coach$/);
  expect(errors).toEqual([]);
  for (const ctx of [...extraContexts, coachContext, existingContext, clientContext, existingClientContext]) await ctx.close();
});
