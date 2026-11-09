import { expect, test } from "@playwright/test";

const coachEmail = process.env.RAVOGE_E2E_COACH_EMAIL;
const coachPassword = process.env.RAVOGE_E2E_COACH_PASSWORD;
const assignedClientId = process.env.RAVOGE_E2E_ASSIGNED_CLIENT_ID;
const unassignedClientId = process.env.RAVOGE_E2E_UNASSIGNED_CLIENT_ID;

test("coach opens an assigned client and saves a workout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Run the authenticated flow once.");
  test.skip(
    !coachEmail || !coachPassword || !assignedClientId,
    "Runtime-only coach fixture credentials are required.",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(coachEmail!);
  await page.getByLabel("Password").fill(coachPassword!);
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/coach$/);
  await page.getByRole("link", { name: "Plan Workouts" }).click();
  await expect(page).toHaveURL(/\/coach\/plan-workouts$/);

  const clientSelect = page.getByLabel("Client");
  await clientSelect.selectOption(assignedClientId!);
  const uniqueMinute = String((new Date().getUTCMinutes() + 7) % 60).padStart(2, "0");
  await page.getByLabel("Workout name").fill("E2E Strength Session");
  await page.getByLabel("Date").fill("2027-09-21");
  await page.getByLabel("Time").fill(`14:${uniqueMinute}`);
  await page.getByLabel("Coach instructions / workout notes").fill("Controlled tempo throughout.");
  await page.getByLabel("Exercise", { exact: true }).fill("Back Squat");
  await page.getByLabel("Sets").fill("4");
  await page.getByLabel("Reps").fill("6");
  await page.getByLabel("Weight (lb)").fill("100");
  await page.getByLabel("Notes").fill("RPE 7");
  await page.getByRole("button", { name: "Save Planned Workout" }).click();

  await expect(page.getByRole("status")).toContainText("Workout planned");
  await expect(page.getByText("E2E Strength Session")).toBeVisible();
  await page.getByRole("link", { name: "Open workout →" }).first().click();
  await expect(page.getByText("Back Squat", { exact: true })).toBeVisible();

  if (unassignedClientId) {
    await page.goto(`/coach/clients/${unassignedClientId}`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  }
});
