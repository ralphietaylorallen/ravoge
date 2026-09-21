import { expect, test } from "@playwright/test";

for (const app of [
  { label: "Coach", path: "/coach/install", signup: "/signup/coach" },
  { label: "Client", path: "/client/install", signup: "/signup/client" },
] as const) {
  test(`${app.label} install route is role-specific, responsive, and non-authorizing`, async ({ context, page }) => {
    await page.goto(app.path);

    await expect(page.getByRole("heading", { name: "Install Ravoge" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: `Create ${app.label} account` })).toHaveAttribute("href", app.signup);
    await expect(page.getByRole("heading", { name: "Open in Safari" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tap Share" })).toBeVisible();
    await expect(page.getByText("Add to Home Screen", { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Open the Ravoge icon" })).toBeVisible();

    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    }))).toEqual({ horizontalOverflow: false, localStorage: 0, sessionStorage: 0 });
  });

  test(`${app.label} install route rejects an invalid invitation without changing generic access`, async ({ page }) => {
    await page.goto(`${app.path}?invite=invalid-invitation-token-value-000000000`);
    await expect(page.getByText(/This gym invitation is invalid/i)).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("link", { name: `Create ${app.label} account` })).toHaveAttribute("href", app.signup);
  });
}

test("web app manifest exposes the production PWA foundation", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    background_color: "#050606",
    display: "standalone",
    name: "Ravoge",
    scope: "/",
    short_name: "Ravoge",
    start_url: "/login",
    theme_color: "#050606",
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "any", src: "/icon.svg", type: "image/svg+xml" }),
  ]));
});

test("install guidance remains still with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/coach/install");
  const animationNames = await page.locator(".gold-atmosphere *").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
  expect(animationNames.every((name) => name === "none")).toBe(true);
});
