import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ trace: "off" });

test("Owner clears selected invitations, retains audit and memberships, and can invite again", async ({ page, browser }, testInfo) => {
  test.skip(process.env.RAVOGE_INVITATION_CLEAR_QA !== "yes" || process.env.SUPABASE_DB_TARGET !== "local" || testInfo.project.name !== "desktop", "Requires CI's isolated local Supabase fixtures; hosted mutation tests are forbidden.");
  test.setTimeout(180_000);
  const users = JSON.parse(process.env.BETA_QA_USERS ?? "[]") as Array<{ id: string; email: string; password: string; role: string }>;
  const owner = users.find(user => user.role === "owner")!, existing = users.find(user => user.role === "existing_client")!;
  const clientEmail = process.env.BETA_QA_NEW_CLIENT_EMAIL!, coachEmail = process.env.BETA_QA_NEW_COACH_EMAIL!, expiredEmail = process.env.BETA_QA_EXPIRED_INVITE_EMAIL!;
  for (const email of [clientEmail, coachEmail, expiredEmail]) expect(email).toMatch(/^qa-beta-.+@example\.test$/);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  expect((await db.auth.signInWithPassword(owner)).error).toBeNull();
  async function login(target: Page, user: typeof owner) {
    await target.goto("/login");
    await target.getByLabel("Email", { exact: true }).fill(user.email);
    await target.getByLabel("Password", { exact: true }).fill(user.password);
    await target.getByRole("button", { name: "Login", exact: true }).click();
    await expect(target).toHaveURL(new RegExp(`/${user.role}$`), { timeout: 25_000 });
  }
  await login(page, owner);
  async function invite(email: string, role: "client" | "coach") {
    await page.goto("/owner/team");
    await page.locator(`#invite-${role} > summary`).click();
    const form = page.locator(`#invite-${role}`).locator("form");
    await form.getByLabel("Email", { exact: true }).fill(email);
    await form.getByRole("button", { name: role === "client" ? "Send invite" : "Send Coach Invite", exact: true }).click();
    await expect(form.getByRole("status")).toContainText("not configured");
    const link = new URL((await form.getByRole("link", { name: "Open secure invitation" }).getAttribute("href"))!);
    const rows = await db.from("organization_invitations").select("id,role").eq("email", email).is("revoked_at", null).is("accepted_at", null);
    expect(rows.error).toBeNull(); expect(rows.data).toHaveLength(1); expect(rows.data![0].role).toBe(role);
    return { id: rows.data![0].id as string, link: link.toString(), signup: `${link.origin}/signup/${role}?enrollment=${encodeURIComponent(link.searchParams.get("token")!)}` };
  }
  const pending = await invite(clientEmail, "client"), revoked = await invite(coachEmail, "coach"), accepted = await invite(existing.email, "client");
  const clientContext = await browser.newContext(), client = await clientContext.newPage();
  await client.goto(accepted.signup);
  await client.getByRole("link", { name: "Sign in instead", exact: true }).click();
  await expect(client).toHaveURL(/\/login\?enrollment=/);
  await expect(client.getByLabel("Email", { exact: true })).toHaveValue(existing.email);
  await expect(client.getByLabel("Email", { exact: true })).toHaveAttribute("readonly", "");
  await client.getByLabel("Password", { exact: true }).fill(existing.password);
  await client.getByRole("button", { name: "Login", exact: true }).click();
  await expect(client).toHaveURL(/\/client$/, { timeout: 25_000 });
  const before = await db.from("organization_memberships").select("*").order("id");
  expect(before.error).toBeNull(); expect(before.data!.some(row => row.user_id === existing.id && row.invitation_id === accepted.id)).toBe(true);
  await page.goto("/owner/team#invitations");
  const row = (id: string) => page.locator(`[data-invitation-id="${id}"]`);
  const acceptedRow = row(accepted.id);
  await expect(acceptedRow).toContainText("accepted");
  await expect(acceptedRow.getByRole("checkbox")).toHaveCount(0);
  await expect(acceptedRow.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);
  page.once("dialog", dialog => dialog.accept());
  await row(revoked.id).getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(row(revoked.id)).toContainText("revoked");
  const expired = await db.from("organization_invitations").select("id").eq("email", expiredEmail).single();
  expect(expired.error).toBeNull();
  const ids = [pending.id, revoked.id, expired.data!.id as string];
  await expect(row(ids[2])).toContainText("expired");
  const pendingSelection = row(pending.id).getByRole("checkbox");
  await pendingSelection.focus(); await expect(pendingSelection).toBeFocused(); await pendingSelection.press("Space");
  for (const id of ids.slice(1)) await row(id).getByRole("checkbox").check();
  await expect(page.getByText("3 selected", { exact: true })).toBeVisible();
  for (const width of [390, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Clear email invitations", exact: true })).toBeVisible();
  }
  let confirmation = "";
  page.once("dialog", async dialog => { confirmation = dialog.message(); await dialog.dismiss(); });
  await page.getByRole("button", { name: "Clear email invitations", exact: true }).click();
  expect(confirmation).toContain("Clear 3 email invitations?");
  for (const id of ids) await expect(row(id)).toBeVisible();
  const visitorContext = await browser.newContext(), visitor = await visitorContext.newPage();
  await visitor.goto(pending.signup); await expect(visitor.getByLabel("Email", { exact: true })).toHaveValue(clientEmail);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Clear email invitations", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "3 email invitations cleared" })).toBeVisible();
  for (const id of ids) await expect(row(id)).toHaveCount(0);
  await page.reload();
  for (const id of ids) await expect(row(id)).toHaveCount(0);
  await expect(row(accepted.id)).toContainText("accepted");
  const audit = await db.from("organization_invitations").select("id,cleared_at,cleared_by,revoked_at,accepted_at").in("id", ids);
  expect(audit.error).toBeNull(); expect(audit.data).toHaveLength(3);
  for (const item of audit.data!) { expect(item.cleared_at).toBeTruthy(); expect(item.revoked_at).toBeTruthy(); expect(item.cleared_by).toBe(owner.id); expect(item.accepted_at).toBeNull(); }
  const after = await db.from("organization_memberships").select("*").order("id");
  expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
  await visitor.goto(pending.link); await expect(visitor).toHaveURL(/invalid-invitation/);
  await expect(visitor.getByRole("button", { name: "Create account", exact: true })).toHaveCount(0);
  const fresh = await invite(clientEmail, "client");
  expect(fresh.id).not.toBe(pending.id); expect(fresh.link === pending.link).toBe(false);
  await visitor.goto(fresh.signup); await expect(visitor.getByLabel("Email", { exact: true })).toHaveValue(clientEmail);
  await expect(visitor.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
  await page.goto("/owner/team#invitations");
  page.once("dialog", async dialog => { expect(dialog.message()).toContain("Clear 1 email invitation?"); await dialog.accept(); });
  await row(fresh.id).getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "1 email invitation cleared" })).toBeVisible();
  await expect(row(fresh.id)).toHaveCount(0);
  await visitor.goto(fresh.link); await expect(visitor).toHaveURL(/invalid-invitation/);
  await client.goto("/owner/team"); await expect(client).toHaveURL(/\/client$/);
  const coachContext = await browser.newContext(), coach = await coachContext.newPage();
  await login(coach, users.find(user => user.role === "coach")!);
  await coach.goto("/owner/team"); await expect(coach).toHaveURL(/\/coach$/);
  await expect(coach.getByRole("button", { name: "Clear email invitations", exact: true })).toHaveCount(0);
  await coachContext.close(); await visitorContext.close(); await clientContext.close(); await db.auth.signOut();
});
