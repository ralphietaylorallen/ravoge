import { expect, test, type Page } from "@playwright/test";

const prefix = process.env.RAVOGE_STABILIZATION_PREFIX;
const password = process.env.RAVOGE_STABILIZATION_PASSWORD;

const credentials = prefix && password ? {
  additionalOwner: { email: `${prefix}-additional-owner@example.com`, name: "Stability Additional Owner" },
  client: { email: `${prefix}-client@example.com`, name: "Stability Client" },
  coach: { email: `${prefix}-coach@example.com`, name: "Stability Coach" },
  invitedCoach: { email: `${prefix}-invited-coach@example.com`, name: "Stability Invited Coach" },
  owner: { email: `${prefix}-owner@example.com`, name: "Stability Owner" },
} : null;

async function completeSignup(page: Page, role: "owner" | "coach" | "client", email: string, name: string) {
  await page.goto(`/signup/${role}`);
  await page.getByLabel("Full name").fill(name);
  if (role === "owner") await page.getByLabel("Gym name").fill(`Stability Gym ${prefix}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByLabel("Confirm password").fill(password!);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function login(page: Page, email: string, destination: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(destination);
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

async function createInvite(page: Page, role: "owner" | "coach" | "client", email: string, actor: "owner" | "coach" = "owner") {
  await page.goto(actor === "owner" ? "/owner/team" : "/coach");
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: `Invite ${role}` }),
  });
  await section.getByLabel("Email").fill(email);
  await section.getByRole("button", { name: role === "client" ? "Send invite" : `Invite ${role}` }).click();
  await expect(section.getByRole("link", { name: "Open secure invitation" })).toBeVisible();
  const invitationUrl = await section.getByRole("link", { name: "Open secure invitation" }).getAttribute("href");
  expect(invitationUrl).toMatch(/^https?:\/\/.+\?invite=[A-Za-z0-9_-]{32,}$/);
  return invitationUrl!;
}

async function acceptExistingInvite(page: Page, invitationUrl: string, email: string, destination: RegExp) {
  await page.goto(invitationUrl);
  await page.getByRole("link", { name: /Already have an account\? Sign in/i }).click();
  await expect(page.getByLabel("Email")).toHaveValue(email);
  await expect(page.getByLabel("Email")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Invitation code")).toHaveCount(0);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(destination);
}

test.describe("hosted production-stabilization flow", () => {
  test.describe.configure({ mode: "serial" });

  test("fresh identity, invite, membership, and prescription flow", async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== "desktop", "Run the stateful hosted flow once.");
    test.skip(!credentials || !password, "Unique runtime-only test credentials are required.");

    const ownerContext = await browser.newContext();
    const coachContext = await browser.newContext();
    const clientContext = await browser.newContext();
    const invitedCoachContext = await browser.newContext();
    const additionalOwnerContext = await browser.newContext();
    const owner = await ownerContext.newPage();
    const coach = await coachContext.newPage();
    const client = await clientContext.newPage();
    const invitedCoach = await invitedCoachContext.newPage();
    const additionalOwner = await additionalOwnerContext.newPage();

    await completeSignup(owner, "owner", credentials!.owner.email, credentials!.owner.name);
    await expect(owner).toHaveURL(/\/owner$/);
    await logout(owner);
    await login(owner, credentials!.owner.email, /\/owner$/);

    await completeSignup(coach, "coach", credentials!.coach.email, credentials!.coach.name);
    await expect(coach).toHaveURL(/\/coach\/onboarding$/);
    await expect(coach.getByText("Accept a gym invitation to begin coaching.")).toBeVisible();
    await coach.getByLabel("Preferred name").fill("Coach Self");
    await coach.getByRole("button", { name: "Save profile" }).click();
    await expect(coach.getByRole("status")).toContainText("Profile updated");
    await logout(coach);
    await login(coach, credentials!.coach.email, /\/coach\/onboarding$/);
    await logout(coach);

    await completeSignup(client, "client", credentials!.client.email, credentials!.client.name);
    await expect(client).toHaveURL(/\/client\/onboarding$/);
    await expect(client.getByText("Join a gym with an invitation.")).toBeVisible();
    await client.getByLabel("Preferred name").fill("Client Self");
    await client.getByRole("button", { name: "Save profile" }).click();
    await expect(client.getByRole("status")).toContainText("Profile updated");
    await logout(client);
    await login(client, credentials!.client.email, /\/client\/onboarding$/);
    await logout(client);

    const existingCoachInvite = await createInvite(owner, "coach", credentials!.coach.email);
    await acceptExistingInvite(coach, existingCoachInvite, credentials!.coach.email, /\/coach$/);

    const clientInvite = await createInvite(coach, "client", credentials!.client.email, "coach");
    await acceptExistingInvite(client, clientInvite, credentials!.client.email, /\/client$/);

    await coach.goto("/coach");
    await expect(coach.getByRole("link", { name: "Client Self" })).toBeVisible();
    await owner.goto("/owner/clients");
    await expect(owner.getByText(`Coach: ${credentials!.coach.name}`)).toBeVisible();
    await expect(owner.getByText(`Invited by: ${credentials!.coach.name}`)).toBeVisible();

    const newCoachInvite = await createInvite(owner, "coach", credentials!.invitedCoach.email);
    await invitedCoach.goto(newCoachInvite);
    await invitedCoach.getByRole("link", { name: "Accept Coach invitation" }).click();
    await expect(invitedCoach.getByLabel("Email")).toHaveValue(credentials!.invitedCoach.email);
    await expect(invitedCoach.getByLabel("Email")).toHaveAttribute("readonly", "");
    await expect(invitedCoach.getByLabel("Invitation code")).toHaveCount(0);
    await invitedCoach.getByLabel("Full name").fill(credentials!.invitedCoach.name);
    await invitedCoach.getByLabel("Password", { exact: true }).fill(password!);
    await invitedCoach.getByLabel("Confirm password").fill(password!);
    await invitedCoach.getByRole("button", { name: "Create account" }).click();
    await expect(invitedCoach).toHaveURL(/\/coach$/);

    const additionalOwnerInvite = await createInvite(owner, "owner", credentials!.additionalOwner.email);
    await additionalOwner.goto(additionalOwnerInvite);
    await expect(additionalOwner.getByLabel("Email")).toHaveValue(credentials!.additionalOwner.email);
    await expect(additionalOwner.getByLabel("Gym name")).toHaveCount(0);
    await additionalOwner.getByLabel("Full name").fill(credentials!.additionalOwner.name);
    await additionalOwner.getByLabel("Password", { exact: true }).fill(password!);
    await additionalOwner.getByLabel("Confirm password").fill(password!);
    await additionalOwner.getByRole("button", { name: "Create account" }).click();
    await expect(additionalOwner).toHaveURL(/\/owner$/);
    await additionalOwner.goto("/owner/team");
    await expect(additionalOwner.getByText("Primary owner", { exact: true })).toHaveCount(1);

    await owner.goto("/owner/equipment");
    for (const item of [
      { name: "Stability dumbbells", type: "dumbbells" },
      { name: "Stability bench", type: "bench" },
    ]) {
      await owner.getByLabel("Equipment type").selectOption(item.type);
      await owner.getByLabel("Name").fill(item.name);
      await owner.getByRole("button", { name: "Add equipment" }).click();
      await expect(owner.getByRole("status")).toContainText("Equipment added");
    }

    await owner.goto("/owner/clients");
    await owner.getByRole("link", { name: "Client Self" }).click();
    await owner.getByLabel("Primary coach").selectOption({ label: credentials!.invitedCoach.name });
    await owner.getByRole("button", { name: "Assign coach" }).click();
    await expect(owner.getByRole("status")).toContainText("Primary coach assignment updated");

    await coach.goto("/coach");
    await expect(coach.getByRole("link", { name: "Client Self" })).toHaveCount(0);
    await owner.goto("/owner/reports");
    await expect(owner.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(owner.getByRole("heading", { name: "Operational metrics" })).toBeVisible();
    await owner.goto("/owner/revenue");
    await expect(owner.getByRole("heading", { name: "Revenue" })).toBeVisible();

    await invitedCoach.goto("/coach");
    await invitedCoach.getByRole("link", { name: "Client Self" }).click();
    await invitedCoach.getByRole("button", { name: "Save intake & calculate state" }).click();
    await expect(invitedCoach.getByRole("status")).toContainText("Intake saved and client state recalculated");
    await expect(invitedCoach.getByText("Coach-readable readiness")).toBeVisible();
    await invitedCoach.getByRole("button", { name: "Generate Ravoge workout" }).click();
    await expect(invitedCoach).toHaveURL(/\/coach\/clients\/.+\/prescriptions\/.+$/);
    await expect(invitedCoach.getByRole("heading", { name: "Review first prescription" })).toBeVisible();
    await invitedCoach.getByRole("button", { name: "Approve & assign" }).click();
    await expect(invitedCoach.getByRole("status")).toContainText("now assigned");

    await client.goto("/client");
    await expect(client.getByText(credentials!.invitedCoach.name, { exact: true })).toBeVisible();
    await expect(client.getByRole("link", { name: /Foundation/i })).toBeVisible();

    await Promise.all([
      ownerContext.close(), coachContext.close(), clientContext.close(),
      invitedCoachContext.close(), additionalOwnerContext.close(),
    ]);
  });
});
