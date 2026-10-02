import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const isCI = !!process.env.CI;

// In CI the build job's dist/ artifact is served as-is (built against the real API URL, which the
// e2e api fixture intercepts anyway). Locally the app is built first, against a host that can never
// resolve, so a request the fixture forgot to mock fails instead of reaching a real server.
const serve = `npx vite preview --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [
    ["list"],
    ...(process.env.E2E_JUNIT
      ? [["junit", { outputFile: process.env.E2E_JUNIT }] as ["junit", { outputFile: string }]]
      : [])
  ],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Same contract as the CI "Locate Chromium" step: prefer a system Chromium when one is set.
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"]
    }
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: isCI ? serve : `npm run build-only && ${serve}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: { VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? "https://api.e2e.invalid" }
  }
});
