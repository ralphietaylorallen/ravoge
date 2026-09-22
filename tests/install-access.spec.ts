import { expect, test } from "@playwright/test";

for (const app of [
  { label: "Coach", path: "/coach/install" },
  { label: "Client", path: "/client/install" },
] as const) {
  test(`${app.label} install route is role-specific, responsive, and non-authorizing`, async ({ context, page }) => {
    await page.goto(app.path);

    const logo = page.getByRole("link", { name: "Ravoge home" }).locator("img");
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: "Install Ravoge" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("button", { name: "Install Ravoge" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Install", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "iPhone or iPad" })).toBeVisible();
    await expect(page.getByText("Add to Home Screen", { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Continue securely" })).toBeVisible();

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
    expect(page.url()).not.toContain("invalid-invitation-token-value");
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
    start_url: "/launch",
    theme_color: "#050606",
  });
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ purpose: "any", sizes: "192x192", src: "/brand/ravoge-app-icon-192.png", type: "image/png" }),
    expect.objectContaining({ purpose: "maskable", sizes: "512x512", src: "/brand/ravoge-app-icon-512.png", type: "image/png" }),
  ]));
  for (const path of [
    "/brand/ravoge-wolf-source.jpg",
    "/brand/ravoge-wolf-transparent.png",
    "/brand/ravoge-app-icon-192.png",
    "/brand/ravoge-app-icon-512.png",
    "/icon.png",
    "/apple-icon.png",
  ]) {
    const icon = await request.get(path);
    expect(icon.ok(), `${path} should resolve`).toBe(true);
    expect(icon.headers()["content-type"]).toMatch(/^image\/(png|jpeg)$/);
  }
});

test("standalone launch automatically continues to access", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === "(display-mode: standalone)"
      ? ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true } as MediaQueryList)
      : nativeMatchMedia(query);
  });
  await page.goto("/client/install");
  await expect(page).toHaveURL(/\/login$/);
});

test("iOS in-app browsers direct installation back to Safari", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1" });
    Object.defineProperty(navigator, "platform", { configurable: true, value: "iPhone" });
  });
  await page.goto("/client/install");
  await expect(page.getByText(/rescan this QR with Camera and open it in Safari/i)).toBeVisible();
});

test("Chromium install action invokes the captured native prompt", async ({ page }, testInfo) => {
  test.skip(["iphone", "ipad"].includes(testInfo.project.name), "iOS installation is handled through Safari guidance.");
  await page.goto("/coach/install");
  await page.waitForFunction(() => document.documentElement.dataset.pwaStandalone === "false");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" }>;
    };
    event.prompt = async () => { (window as Window & { __ravogeInstallPrompted?: boolean }).__ravogeInstallPrompted = true; };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });
  await expect(page.getByText("Your browser will open its secure installation prompt.")).toBeVisible();
  await page.getByRole("button", { name: "Install Ravoge" }).click();
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __ravogeInstallPrompted?: boolean }).__ravogeInstallPrompted))).toBe(true);
});

test("service worker and security headers support a network-only install shell", async ({ request }) => {
  const [home, worker, enrollment] = await Promise.all([
    request.get("/login"),
    request.get("/sw.js"),
    request.get("/enroll/client?token=malformed", { maxRedirects: 0 }),
  ]);
  expect(worker.ok()).toBe(true);
  expect(await worker.text()).not.toContain("caches.open");
  expect(home.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(home.headers()["referrer-policy"]).toBe("no-referrer");
  expect(home.headers()["x-content-type-options"]).toBe("nosniff");
  expect(enrollment.headers()["cache-control"]).toContain("no-store");
  expect(enrollment.headers()["x-robots-tag"]).toContain("noindex");
  expect(enrollment.headers()["referrer-policy"]).toBe("no-referrer");
});

test("invalid enrollment cannot obtain an install manifest", async ({ request }) => {
  const response = await request.get("/api/enrollment/invalid-enrollment-token-000000000000000/manifest");
  expect(response.status()).toBe(404);
});

test("install guidance remains still with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/coach/install");
  const animationNames = await page.locator(".gold-atmosphere *").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).animationName));
  expect(animationNames.every((name) => name === "none")).toBe(true);
});
