import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ trace: "off" });

test("Owner email-disabled fallback retains recipient, safely retries and opens email-locked signup", async ({ page, browser }, testInfo) => {
  test.skip(process.env.RAVOGE_INVITATION_QA !== "yes" || testInfo.project.name !== "desktop", "Explicit disposable invitation fixture required; this is not delivery proof.");
  test.setTimeout(100_000);
  const users = JSON.parse(process.env.BETA_QA_USERS ?? "[]") as Array<{ email: string; password: string; role: string }>;
  const owner = users.find(user => user.role === "owner")!;
  const recipient = process.env.BETA_QA_NEW_COACH_EMAIL!;
  expect(recipient).toMatch(/^qa-beta-.+@example\.test$/);
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page).toHaveURL(/\/owner$/, { timeout: 25_000 });
  await page.goto("/owner/apps");
  const form = page.locator("section").filter({ has: page.getByRole("heading", { name: "Invite coach", exact: true }) }).locator("form");
  await form.getByLabel("Email", { exact: true }).fill(recipient);
  await form.getByRole("button", { name: "Send Coach Invite", exact: true }).press("Enter");
  await expect(form.getByRole("status")).toContainText("not configured");
  await expect(form.getByLabel("Email", { exact: true })).toHaveValue(recipient);
  const first = await form.getByRole("link", { name: "Open secure invitation" }).getAttribute("href");
  await expect(form.getByRole("button", { name: "Copy secure invitation", exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Retry invitation", exact: true }).click();
  await expect.poll(async () => (await form.getByRole("link", { name: "Open secure invitation" }).getAttribute("href")) !== first).toBe(true);
  await expect(form.getByRole("status")).toContainText("not configured");
  const second = await form.getByRole("link", { name: "Open secure invitation" }).getAttribute("href");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  expect((await db.auth.signInWithPassword({ email: owner.email, password: owner.password })).error).toBeNull();
  const rows = await db.from("organization_invitations").select("id,role,delivery_status").eq("email", recipient).is("accepted_at", null).is("revoked_at", null);
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(1);
  expect(rows.data![0].role).toBe("coach");
  expect(rows.data![0].delivery_status).toBe("not_configured");
  await db.auth.signOut();
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const signup = await context.newPage();
  const base = new URL(second!);
  await signup.goto(`${base.origin}/signup/coach?enrollment=${encodeURIComponent(base.searchParams.get("token")!)}`);
  await expect(signup.getByLabel("Email", { exact: true })).toHaveValue(recipient);
  await expect(signup.getByLabel("Email", { exact: true })).toHaveAttribute("readonly", "");
  await expect(signup.getByRole("button", { name: "Create account" })).toBeVisible();
  expect(await signup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await signup.goto(first!);
  await expect(signup).toHaveURL(/invalid-invitation/);
  await context.close();
});
