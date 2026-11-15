import { defineConfig, devices } from "@playwright/test";

const PORT = 5180;
const liveUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  // Each test runs several Phaser games with software WebGL, which is slow on CI runners.
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: liveUrl ?? `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: liveUrl
    ? undefined
    : {
        command: `npm run db:migrate:local && npm run build && npx vite preview --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    },
    {
      name: "ipad",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1180, height: 820 },
        deviceScaleFactor: 2,
        hasTouch: true,
      },
    },
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
});
