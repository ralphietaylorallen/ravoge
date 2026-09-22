import { expect, test, type Page } from "@playwright/test";

const ownerEmail = process.env.RAVOGE_E2E_OWNER_EMAIL;
const ownerPassword = process.env.RAVOGE_E2E_OWNER_PASSWORD;
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZTA0AAAAASUVORK5CYII=",
  "base64",
);

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail!);
  await page.getByLabel("Password").fill(ownerPassword!);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/owner$/);
}

test("unauthenticated users cannot access the paid equipment analysis endpoint", async ({ request }) => {
  const home = await request.get("/");
  expect(home.headers()["permissions-policy"]).toContain("camera=(self)");
  const response = await request.post("/api/equipment/scan", {
    multipart: { photos: { buffer: onePixelPng, mimeType: "image/png", name: "equipment.png" } },
  });
  expect(response.status()).toBe(401);
});

test("Owner completes photo review without paid API calls or horizontal overflow", async ({ page }) => {
  test.skip(!ownerEmail || !ownerPassword, "Runtime-only Owner credentials are required.");
  await page.emulateMedia({ reducedMotion: "reduce" });

  let savedBody: { decisions: Array<Record<string, unknown>>; scanRequestId: string } | null = null;
  await page.route("**/api/equipment/scan", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      contentType: "application/json",
      json: {
        candidates: [
          {
            confidence: 0.91,
            duplicateMatches: [{ equipmentType: "squat_rack", id: "d1000000-0000-4000-8000-000000000001", name: "Existing squat racks", quantity: 2 }],
            equipmentType: "squat_rack",
            evidence: "Two rack uprights are clearly visible.",
            id: "d2000000-0000-4000-8000-000000000001",
            name: "Squat racks",
            quantity: 2,
            quantityIsEstimate: false,
            reviewNote: null,
          },
          {
            confidence: 0.64,
            duplicateMatches: [],
            equipmentType: "dumbbells",
            evidence: "A partly obscured dumbbell rack is visible.",
            id: "d2000000-0000-4000-8000-000000000002",
            name: "Dumbbell rack",
            quantity: null,
            quantityIsEstimate: true,
            reviewNote: "Count needs Owner review.",
          },
        ],
        scanRequestId: "d3000000-0000-4000-8000-000000000001",
        usage: { inputTokens: 100, outputTokens: 50 },
      },
      status: 200,
    });
  });
  await page.route("**/api/equipment/scan/save", async (route) => {
    savedBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      json: { result: { addedCount: 1, skippedCount: 0, updatedCount: 1 } },
      status: 200,
    });
  });

  await loginOwner(page);
  await page.goto("/owner/equipment");
  await expect(page.getByRole("button", { name: "Add equipment" })).toBeVisible();
  await page.getByRole("button", { name: "Scan equipment with photos" }).click();
  await expect(page.getByText(/For best results, use 3–5 bright/)).toBeVisible();

  const cameraInput = page.locator('input[type="file"][capture="environment"]');
  const libraryInput = page.locator('input[type="file"]:not([capture])');
  await expect(cameraInput).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  await cameraInput.setInputFiles({ buffer: onePixelPng, mimeType: "image/png", name: "camera-equipment.png" });
  await libraryInput.setInputFiles({ buffer: onePixelPng, mimeType: "image/png", name: "library-equipment.png" });
  await expect(page.getByRole("img", { name: /Equipment photo/ })).toHaveCount(2);

  await page.getByRole("button", { name: "Analyze 2 photos" }).click();
  const processing = page.getByRole("status", { name: "OpenAI is analyzing equipment photos" });
  await expect(processing).toBeVisible();
  const reducedAnimation = await processing.locator("span").evaluate((element) => getComputedStyle(element, "::after").animationName);
  expect(reducedAnimation).toBe("none");

  await expect(page.getByText("Possible duplicate: Existing squat racks.")).toBeVisible();
  await expect(page.getByText("Quantity or identification needs Owner review.")).toBeVisible();
  const results = page.locator("fieldset").filter({ hasText: /Result/ });
  await expect(results).toHaveCount(2);
  await results.nth(0).getByLabel("Decision").selectOption("update");
  await results.nth(0).getByLabel("Name").fill("Updated squat racks");
  await results.nth(1).getByLabel("Decision").selectOption("add");
  await results.nth(1).getByLabel(/Quantity/).fill("10");
  await page.getByRole("button", { name: "Save approved equipment" }).click();
  await expect(page.getByRole("status")).toContainText("1 added, 1 updated");

  const saved = savedBody as unknown as { decisions: Array<Record<string, unknown>>; scanRequestId: string };
  expect(saved.scanRequestId).toBe("d3000000-0000-4000-8000-000000000001");
  expect(saved.decisions.map((decision) => decision.action)).toEqual(["update", "add"]);
  expect(saved.decisions[0].targetEquipmentId).toBe("d1000000-0000-4000-8000-000000000001");
  expect(saved.decisions[1].quantity).toBe(10);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
