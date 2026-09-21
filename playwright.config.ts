import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: process.env.CI ? 4 : 6,
  reporter: "list",
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    browserName: "chromium",
    channel: "chrome",
    trace: "on-first-retry",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 180_000,
      },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium", channel: "chrome" } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
});
