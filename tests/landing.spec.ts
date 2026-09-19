import { expect, test } from "@playwright/test";

test("landing page renders, images load, and does not overflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Every set makes the next one smarter/i })).toBeVisible();
  const images = page.locator("img");
  await expect(images).toHaveCount(3);
  for (let index = 0; index < await images.count(); index += 1) {
    await images.nth(index).scrollIntoViewIfNeeded();
  }
  await expect.poll(async () => page.locator("img").evaluateAll((images) => images.every((image) => {
    const element = image as HTMLImageElement;
    return element.complete && element.naturalWidth > 0;
  })), { timeout: 15_000 }).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({ path: testInfo.outputPath("landing.png"), fullPage: true });
  if (testInfo.project.name === "phone") {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(200);
    await page.screenshot({ path: testInfo.outputPath("page-bottom.png") });
  }
});

test("primary routes are keyboard reachable and explicitly pending", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.getByRole("link", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/owner\?intent=signup/);
  await expect(page.getByRole("heading", { name: /Owner access is coming next/i })).toBeVisible();
  await expect(page.getByText(/does not collect credentials/i)).toBeVisible();
});

test("coach and client foundations are available", async ({ page }) => {
  await page.goto("/coach");
  await expect(page.getByRole("heading", { name: /Coach access is coming next/i })).toBeVisible();
  await page.goto("/client");
  await expect(page.getByRole("heading", { name: /Client access is coming next/i })).toBeVisible();
});
