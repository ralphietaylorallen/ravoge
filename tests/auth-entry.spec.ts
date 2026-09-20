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
  { name: "Gym Owner", path: "/signup/owner" },
  { name: "Coach", path: "/signup/coach" },
  { name: "Client", path: "/signup/client" },
] as const) {
  test(`${accountType.name} selection routes to its signup shell`, async ({
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
    await expect(
      page.getByRole("region", {
        name: `${accountType.name} signup form placeholder`,
      }),
    ).toBeVisible();

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

test("login submission remains on login and grants no access", async ({
  context,
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@example.com");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText(/No access has been granted/i),
  ).toBeVisible();
  expect(await context.cookies()).toEqual([]);
  expect(
    await page.evaluate(() => ({
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    })),
  ).toEqual({ localStorage: 0, sessionStorage: 0 });
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
