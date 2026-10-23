import { expect, test } from "@playwright/test";

test("cinematic entry screens retain real wolf branding, readable controls and responsive layout", async ({ page }, info) => {
  for (const route of ["/login", "/signup", "/signup/owner", "/signup/coach", "/signup/client", "/coach/install", "/client/install", "/reset-password"]) {
    await page.goto(route);
    const theme = page.locator('[data-ravoge-visual="cinematic"]');
    await expect(theme).toBeVisible();
    expect(await theme.evaluate(element => getComputedStyle(element).getPropertyValue("--ui-canvas").trim())).toBe("#070808");
    const logo = page.getByRole("link", { name: "Ravoge home" }).locator("img");
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await logo.getAttribute("src")).toContain("ravoge-wolf-transparent.png");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    // Netlify injects its CDP review iframe after </html> on previews. Omit that
    // third-party toolbar from image capture only, never from app/test behavior.
    if (["/login", "/signup/coach", "/coach/install"].includes(route)) await page.screenshot({ path: info.outputPath(`cinematic-${route.replaceAll("/", "-")}.png`), style: '[data-netlify-deploy-id] { visibility: hidden !important; }' });
  }
});

test("cinematic presentation remains still for reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  expect(await page.locator('[data-ravoge-visual="cinematic"] *').evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === "none"))).toBe(true);
});

test("Coming Soon artwork remains outside the authenticated graphical overhaul", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-ravoge-visual="cinematic"]')).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Ravoge — coming soon/ })).toBeVisible();
});
