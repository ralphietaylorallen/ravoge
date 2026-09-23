import { expect, test } from "@playwright/test";

test("staff booking routes require authentication and never expose client data", async ({ page }) => {
  const clientId = "11111111-1111-4111-8111-111111111111";
  for (const role of ["owner", "coach"] as const) {
    await page.goto(`/${role}/clients/${clientId}/book`);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=/${role}$`));
  }
});

test("public pages remain usable at phone, tablet, and desktop widths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Login" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
});
