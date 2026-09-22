import { expect, test } from "@playwright/test";

const runLiveJourney = process.env.RAVOGE_E2E_ENROLLMENT_RUN === "true";
const runId = Date.now().toString(36);
const password = `RavogeE2E!${runId}9`;
const gymName = `Ravoge Enrollment E2E ${runId}`;

async function createAccount(page: import("@playwright/test").Page, role: "coach" | "client", email: string) {
  await expect(page).toHaveURL(new RegExp(`/signup/${role}$`));
  await page.getByLabel("Full name").fill(`Enrollment ${role} ${runId}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect.poll(
    () => new URL(page.url()).pathname,
    { timeout: 20_000 },
  ).toBe(`/${role}`);
}

test("real organization QRs preserve install-first context and enforce lifecycle controls", async ({ browser, page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "desktop", "Run the stateful hosted enrollment journey once.");
  test.skip(!runLiveJourney, "Explicit stateful enrollment test opt-in is required.");

  const ownerEmail = `ravoge-enroll-e2e-owner-${runId}@example.test`;
  const clientEmail = `ravoge-enroll-e2e-client-${runId}@example.test`;
  const coachEmail = `ravoge-enroll-e2e-coach-${runId}@example.test`;

  await page.goto("/signup/owner");
  await page.getByLabel("Full name").fill(`Enrollment Owner ${runId}`);
  await page.getByLabel("Gym name").fill(gymName);
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect.poll(
    () => new URL(page.url()).pathname,
    { timeout: 20_000 },
  ).toBe("/owner");
  await expect(page.getByRole("heading", { name: /Welcome/i })).toBeVisible();

  await page.goto("/owner/apps");
  const clientCard = page.locator('[data-enrollment-card="client"]');
  const coachCard = page.locator('[data-enrollment-card="coach"]');
  await expect(clientCard.getByText(gymName)).toBeVisible();
  await expect(coachCard.getByText(/Staff only/i)).toBeVisible();
  const initialClientUrl = await clientCard.locator("[data-qr-value]").getAttribute("data-qr-value");
  const coachUrl = await coachCard.locator("[data-qr-value]").getAttribute("data-qr-value");
  expect(initialClientUrl).toMatch(/^https:\/\/ravoge\.com\/enroll\/client\?token=[A-Za-z0-9_-]{43}$/);
  expect(coachUrl).toMatch(/^https:\/\/ravoge\.com\/enroll\/coach\?token=[A-Za-z0-9_-]{43}$/);
  expect(initialClientUrl).not.toContain(encodeURIComponent(gymName));
  const initialClientPath = `${new URL(initialClientUrl!).pathname}${new URL(initialClientUrl!).search}`;
  const coachPath = `${new URL(coachUrl!).pathname}${new URL(coachUrl!).search}`;

  const mobileContext = await browser.newContext({ viewport: { height: 844, width: 390 } });
  const installPage = await mobileContext.newPage();
  await installPage.goto(initialClientPath);
  await expect(installPage).toHaveURL(/\/client\/install\?enrollment=/);
  await expect(installPage.getByText(gymName)).toBeVisible();
  await expect(installPage.getByRole("button", { name: "Install Ravoge" })).toBeVisible();
  await expect(installPage.getByRole("link", { name: /Create Client account/i })).toHaveCount(0);
  const manifestHref = await installPage.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toMatch(/^\/api\/enrollment\/[A-Za-z0-9_-]{43}\/manifest$/);
  const manifestResponse = await installPage.request.get(manifestHref!);
  expect(manifestResponse.ok()).toBe(true);
  const enrollmentManifest = await manifestResponse.json();
  expect(enrollmentManifest.start_url).toMatch(/^\/launch\?enrollment=[A-Za-z0-9_-]{43}$/);

  // A fresh, cookieless context emulates opening the newly installed PWA.
  const installedClientContext = await browser.newContext({ viewport: { height: 844, width: 390 } });
  const installedClient = await installedClientContext.newPage();
  await installedClient.goto(enrollmentManifest.start_url);
  await createAccount(installedClient, "client", clientEmail);

  const tamperedContext = await browser.newContext();
  const tampered = await tamperedContext.newPage();
  await tampered.goto(initialClientPath.replace("/enroll/client", "/enroll/coach"));
  await expect(tampered).toHaveURL(/\/coach\/install\?status=invalid-invitation$/);
  await expect(tampered.getByText(/invalid, expired, revoked, or already used/i)).toBeVisible();
  await tamperedContext.close();

  const coachContext = await browser.newContext({ viewport: { height: 1024, width: 768 } });
  const coachInstall = await coachContext.newPage();
  await coachInstall.goto(coachPath);
  const coachManifestHref = await coachInstall.locator('link[rel="manifest"]').getAttribute("href");
  const coachManifest = await (await coachInstall.request.get(coachManifestHref!)).json();
  const installedCoachContext = await browser.newContext({ viewport: { height: 1024, width: 768 } });
  const installedCoach = await installedCoachContext.newPage();
  await installedCoach.goto(coachManifest.start_url);
  await createAccount(installedCoach, "coach", coachEmail);

  // Existing members are idempotent, while a different active role gets a precise conflict.
  await installedClient.goto(initialClientPath);
  await expect(installedClient).toHaveURL(/\/client$/);
  await installedCoach.goto(initialClientPath);
  await expect(installedCoach).toHaveURL(/\/client\/install\?status=membership-conflict$/);
  await expect(installedCoach.getByText(/already belongs to a Ravoge gym with a different role/i)).toBeVisible();

  await page.goto("/owner/team");
  await expect(page.getByText(`Enrollment client ${runId}`, { exact: false })).toBeVisible();
  await expect(page.getByText(`Enrollment coach ${runId}`, { exact: false })).toBeVisible();

  await page.goto("/owner/apps");
  const refreshedClientCard = page.locator('[data-enrollment-card="client"]');
  await refreshedClientCard.getByRole("button", { name: "Rotate QR" }).click();
  await expect.poll(
    () => refreshedClientCard.locator("[data-qr-value]").getAttribute("data-qr-value"),
  ).not.toBe(initialClientUrl);
  const rotatedClientUrl = await refreshedClientCard.locator("[data-qr-value]").getAttribute("data-qr-value");
  const rotatedClientPath = `${new URL(rotatedClientUrl!).pathname}${new URL(rotatedClientUrl!).search}`;

  const oldQrContext = await browser.newContext();
  const oldQr = await oldQrContext.newPage();
  await oldQr.goto(initialClientPath);
  await expect(oldQr).toHaveURL(/\/client\/install\?status=invalid-invitation$/);
  await oldQrContext.close();

  await refreshedClientCard.getByRole("button", { name: "Disable" }).click();
  await expect(refreshedClientCard.getByText("disabled", { exact: true })).toBeVisible();
  const disabledContext = await browser.newContext();
  const disabledQr = await disabledContext.newPage();
  await disabledQr.goto(rotatedClientPath);
  await expect(disabledQr).toHaveURL(/\/client\/install\?status=invalid-invitation$/);
  await disabledContext.close();

  await installedClient.goto("/client");
  await expect(installedClient).toHaveURL(/\/client$/);

  // Leave the test gym with an active Client QR, matching production defaults.
  await refreshedClientCard.getByRole("button", { name: "Create new QR" }).click();
  await expect(refreshedClientCard.getByText("active", { exact: true })).toBeVisible();

  await mobileContext.close();
  await installedClientContext.close();
  await coachContext.close();
  await installedCoachContext.close();
});
