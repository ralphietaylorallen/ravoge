import { expect, test } from "@playwright/test";

test("homepage Login routes to the UI-only login page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});

test("login Sign up routes to account type selection", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByRole("link", { name: /Don’t have an account\? Sign up/i })
    .click();

  await expect(page).toHaveURL(/\/signup$/);
  await expect(
    page.getByRole("heading", { name: "Build what’s next" }),
  ).toBeVisible();
});

for (const accountType of [
  { field: "Gym name", name: "Gym Owner", path: "/signup/owner" },
  { field: "Invitation code", name: "Coach", path: "/signup/coach" },
  { field: "Invitation code", name: "Client", path: "/signup/client" },
] as const) {
  test(`${accountType.name} selection routes to its secure signup form`, async ({
    context,
    page,
  }) => {
    await page.goto("/signup");
    const option = page
      .getByRole("link")
      .filter({
        has: page.getByRole("heading", {
          name: accountType.name,
          exact: true,
        }),
      });
    await option.click();

    await expect(page).toHaveURL(new RegExp(`${accountType.path}$`));
    await expect(
      page.getByRole("heading", { name: accountType.name, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByLabel(accountType.field)).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();

    const browserState = await page.evaluate(() => ({
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    }));
    expect(browserState).toEqual({ localStorage: 0, sessionStorage: 0 });
    expect(await context.cookies()).toEqual([]);
  });
}

test("role signup Back action returns to account type selection", async ({
  page,
}) => {
  await page.goto("/signup/owner");
  await page.getByRole("link", { name: "Back" }).click();

  await expect(page).toHaveURL(/\/signup$/);
  await expect(
    page.getByRole("heading", { name: "Build what’s next" }),
  ).toBeVisible();
});

test("rejected login remains on login and grants no access", async ({
  context,
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@example.com");
  await page.getByLabel("Password").fill("NotARealPassword123!");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText(/Email or password was not accepted/i),
  ).toBeVisible();
  expect(await context.cookies()).toEqual([]);
  expect(
    await page.evaluate(() => ({
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    })),
  ).toEqual({ localStorage: 0, sessionStorage: 0 });
});

test("forgot password navigation opens the recovery request", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
});

for (const route of [
  "/owner",
  "/owner/team",
  "/owner/equipment",
  "/owner/training-library",
  "/owner/clients",
  "/owner/apps",
  "/coach",
  "/client",
]) {
  test(`${route} redirects unauthenticated visitors to login`, async ({ page }) => {
    await page.goto(route);
    const roleRoot = route.split("/")[1];
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=\\/${roleRoot}$`),
    );
  });
}

test("an invitation link pre-fills only the untrusted invitation code", async ({ context, page }) => {
  const invite = "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890";
  await page.goto(`/signup/coach?invite=${invite}`);
  await expect(page.getByLabel("Invitation code")).toHaveValue(invite);
  expect(await context.cookies()).toEqual([]);
});

test("an owner invitation supports new or existing independent accounts", async ({ context, page }) => {
  const invite = "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890";
  await page.goto(`/signup/owner?invite=${invite}`);

  await expect(page.getByLabel("Invitation code")).toHaveValue(invite);
  await expect(page.getByLabel("Gym name")).toHaveCount(0);
  const signIn = page.getByRole("link", { name: /Sign in to accept this invitation/i });
  await expect(signIn).toHaveAttribute("href", `/login?invite=${invite}`);
  await signIn.click();
  await expect(page).toHaveURL(new RegExp(`/login\\?invite=${invite}$`));
  expect(await context.cookies()).toEqual([]);
});

test("an invalid invitation hint does not crash a signup route", async ({ page }) => {
  await page.goto("/signup/owner?invite=invalid");

  await expect(
    page.getByRole("heading", { name: "Gym Owner", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Invitation code")).toHaveValue("invalid");
  await expect(page.getByLabel("Gym name")).toHaveCount(0);
});

test("Owner setup recovery requires an authenticated account", async ({ page }) => {
  await page.goto("/signup/owner/recover");
  await expect(page).toHaveURL(/\/login$/);
});

test("entry routes have no horizontal overflow", async ({ page }) => {
  for (const path of [
    "/login",
    "/signup",
    "/signup/owner",
    "/signup/coach",
    "/signup/client",
  ]) {
    await page.goto(path);
    const overflows = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(overflows, `${path} should not overflow horizontally`).toBe(false);
  }
});

test("login controls follow a logical keyboard focus order", async ({ page }) => {
  await page.goto("/login");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Ravoge home" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Login" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Forgot password?" }),
  ).toBeFocused();
});

test("entry atmosphere respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");

  const animationNames = await page.locator(".gold-atmosphere *").evaluateAll(
    (elements) =>
      elements.map((element) => getComputedStyle(element).animationName),
  );
  expect(animationNames.every((name) => name === "none")).toBe(true);
});
