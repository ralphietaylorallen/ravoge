import { expect, test } from "@playwright/test";

const ownerEmail = process.env.RAVOGE_E2E_OWNER_EMAIL;
const ownerPassword = process.env.RAVOGE_E2E_OWNER_PASSWORD;
const signupEmail = process.env.RAVOGE_E2E_SIGNUP_EMAIL;
const signupPassword = process.env.RAVOGE_E2E_SIGNUP_PASSWORD;

test("owner signup creates an immediate authenticated Owner account", async ({ page }, testInfo) => {
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

  await expect(page).toHaveURL(/\/owner$/);
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

test("owner can open oversight and distribute role-specific app links", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Run the hosted owner flow once.");
  test.skip(!ownerEmail || !ownerPassword, "Runtime-only owner credentials are required.");

  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail!);
  await page.getByLabel("Password").fill(ownerPassword!);
  await page.getByRole("button", { name: "Login" }).click();
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await expect(page).toHaveURL(/\/owner\/clients$/);
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();

  await page.getByRole("link", { name: "Apps & access" }).click();
  await expect(page).toHaveURL(/\/owner\/apps$/);
  await expect(page.getByRole("heading", { name: "Apps & access" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Coach App$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Client App$/ })).toBeVisible();
  await expect(page.locator('[data-enrollment-card="coach"] [data-qr-value*="/enroll/coach?token="]')).toBeVisible();
  await expect(page.locator('[data-enrollment-card="client"] [data-qr-value*="/enroll/client?token="]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Download QR" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Print QR" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Rotate QR" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Disable" })).toHaveCount(2);

  await page.getByRole("link", { name: "Training library" }).click();
  await page.getByRole("link", { name: "Import workout history" }).click();
  await expect(page).toHaveURL(/\/owner\/training-library\/import$/);
  await page.getByLabel("Workout history file").setInputFiles({
    buffer: Buffer.from("Exercise,Sets,Reps\nBack Squat,5,5\nBench Press,3,8\n"),
    mimeType: "text/csv",
    name: "pitt-history.csv",
  });
  await page.getByRole("button", { name: "Parse and preview" }).click();
  await expect(page.getByRole("heading", { name: "pitt-history.csv" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Back Squat" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save import" })).toBeVisible();
});
