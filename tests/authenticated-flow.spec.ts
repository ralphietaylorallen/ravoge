import { expect, test } from "@playwright/test";

const ownerEmail = process.env.RAVOGE_E2E_OWNER_EMAIL;
const ownerPassword = process.env.RAVOGE_E2E_OWNER_PASSWORD;
const signupEmail = process.env.RAVOGE_E2E_SIGNUP_EMAIL;
const signupPassword = process.env.RAVOGE_E2E_SIGNUP_PASSWORD;

test("owner signup creates a confirmation-pending account", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Run the hosted auth flow once.");
  test.skip(
    !signupEmail || !signupPassword,
    "Runtime-only signup credentials are required.",
  );

  await page.goto("/signup/owner");
  await page.getByLabel("Full name").fill("Ravoge Signup Test");
  await page.getByLabel("Gym name").fill("Ravoge Test Gym");
  await page.getByLabel("Email").fill(signupEmail!);
  await page.getByLabel("Password", { exact: true }).fill(signupPassword!);
  await page.getByLabel("Confirm password").fill(signupPassword!);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(
    page.getByText("Check your email to confirm your account"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/signup\/owner$/);
});

test("owner login persists, rejects wrong-role URLs, and logs out", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Run the hosted auth flow once.");
  test.skip(
    !ownerEmail || !ownerPassword,
    "Runtime-only owner credentials are required.",
  );

  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail!);
  await page.getByLabel("Password").fill(ownerPassword!);
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/owner$/);
  await expect(
    page.getByRole("heading", { name: "Welcome, Ravoge E2E Owner." }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/owner$/);

  await page.goto("/coach");
  await expect(page).toHaveURL(/\/owner$/);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/owner");
  await expect(page).toHaveURL(/\/login\?next=\/owner$/);
});
