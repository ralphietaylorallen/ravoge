import { expect, test } from "@playwright/test";

const clientEmail = process.env.RAVOGE_E2E_CLIENT_EMAIL;
const clientPassword = process.env.RAVOGE_E2E_CLIENT_PASSWORD;
const workoutId = process.env.RAVOGE_E2E_CLIENT_WORKOUT_ID;
const otherWorkoutId = process.env.RAVOGE_E2E_OTHER_WORKOUT_ID;

test("client sees and completes only their assigned workout", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Run the authenticated flow once.");
  test.skip(
    !clientEmail || !clientPassword || !workoutId,
    "Runtime-only client fixture credentials are required.",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(clientEmail!);
  await page.getByLabel("Password").fill(clientPassword!);
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/client$/);
  await page.getByRole("link", { name: /E2E Client Workout/i }).click();
  await expect(page).toHaveURL(new RegExp(`/client/workouts/${workoutId}$`));
  await expect(page.getByRole("heading", { name: "E2E Client Workout" })).toBeVisible();
  await expect(page.getByText("Back Squat")).toBeVisible();

  while (await page.getByRole("button", { name: "Mark complete" }).count()) {
    await page.getByRole("button", { name: "Mark complete" }).first().click();
  }
  await page.getByRole("button", { name: "Complete workout" }).click();
  await expect(page.getByRole("button", { name: "Workout complete" })).toBeDisabled();

  if (otherWorkoutId) {
    await page.goto(`/client/workouts/${otherWorkoutId}`);
    await expect(page.getByText("This page could not be found")).toBeVisible();
  }
});
