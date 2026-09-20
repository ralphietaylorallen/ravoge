import { expect, test } from "@playwright/test";

test("coming-soon artwork fills the viewport without overflow", async ({ page }, testInfo) => {
  await page.goto("/");

  const artwork = page.getByRole("img", {
    name: /Ravoge — coming soon\. Higher standards ahead\./i,
  });
  await expect(artwork).toBeVisible();
  await expect
    .poll(() => artwork.evaluate((image) => {
      const element = image as HTMLImageElement;
      return element.complete && element.naturalWidth > 0;
    }))
    .toBe(true);

  const currentSource = await artwork.evaluate(
    (image) => (image as HTMLImageElement).currentSrc,
  );
  if (testInfo.project.name === "phone") {
    expect(currentSource).toContain("ravoge-coming-soon-mobile.webp");
  } else {
    expect(currentSource).toContain("ravoge-coming-soon-desktop.webp");
  }

  const overflow = await page.evaluate(() => ({
    horizontal:
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
    vertical:
      document.documentElement.scrollHeight >
      document.documentElement.clientHeight,
  }));
  expect(overflow).toEqual({ horizontal: false, vertical: false });

  await page.screenshot({ path: testInfo.outputPath("coming-soon.png") });
});

test("login is keyboard accessible and routes to /login", async ({ page }) => {
  await page.goto("/");

  const login = page.getByRole("link", { name: "Login" });
  await expect(login).toBeVisible();
  await expect(login).toHaveAttribute("href", "/login");

  await page.keyboard.press("Tab");
  await expect(login).toBeFocused();
  await login.click();
  await expect(page).toHaveURL(/\/login$/);
});

test("gold atmosphere respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const animationNames = await page.locator(".gold-atmosphere *").evaluateAll(
    (elements) =>
      elements.map((element) => getComputedStyle(element).animationName),
  );
  expect(animationNames.every((name) => name === "none")).toBe(true);
});

test("coach and client foundations remain protected", async ({ page }) => {
  for (const route of ["/coach", "/client"]) {
    await page.goto(route);
    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=\\/${route.slice(1)}$`),
    );
  }
});
