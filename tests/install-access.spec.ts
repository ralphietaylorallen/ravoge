import { expect, test } from "@playwright/test";

for (const app of [
  { label: "Coach", path: "/coach/install", signup: "/signup/coach" },
  { label: "Client", path: "/client/install", signup: "/signup/client" },
] as const) {
  test(`${app.label} install route is role-specific, responsive, and non-authorizing`, async ({ context, page }) => {
    const invite = "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890";
    await page.goto(`${app.path}?invite=${invite}`);

    await expect(page.getByRole("heading", { name: "Train from any device." })).toBeVisible();
    const accept = page.getByRole("link", { name: `Accept ${app.label} invitation` });
    await expect(accept).toHaveAttribute("href", `${app.signup}?invite=${invite}`);
    await expect(page.getByRole("link", { name: /Already have an account/i })).toHaveAttribute("href", `/login?invite=${invite}`);

    expect(await context.cookies()).toEqual([]);
    expect(await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      localStorage: localStorage.length,
      sessionStorage: sessionStorage.length,
    }))).toEqual({ horizontalOverflow: false, localStorage: 0, sessionStorage: 0 });
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
