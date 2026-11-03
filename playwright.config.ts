import { defineConfig, devices } from "@playwright/test";

// CI picks a free port per job (E2E_PORT): several runners share one host, and a fixed port would
// let two e2e jobs collide.
const PORT = Number(process.env.E2E_PORT) || 4173;
const isCI = !!process.env.CI;

function workersFrom(value: string | undefined): number | string | undefined {
  if (!value) return undefined;
  return value.endsWith("%") ? value : Number(value);
}

// In CI the build job's dist/ artifact is served as-is (built against the real API URL, which the
// e2e api fixture intercepts anyway). Locally the app is built first, against a host that can never
// resolve, so a request the fixture forgot to mock fails instead of reaching a real server.
const serve = `npx vite preview --port ${PORT} --strictPort`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Playwright's default (half the cores, so 2 on the 4-core pr-worker host) unless E2E_WORKERS is set,
  // as a count or a percentage. Six e2e jobs at once there took as long with 1 worker each as with 2
  // (about 15.5 min, all passing), while 2 halve the time of a job that runs alone, so CI keeps the default.
  workers: workersFrom(process.env.E2E_WORKERS),
  // That shared host can be several times slower than a dev machine. In CI, a slow test should pass
  // late rather than time out, so the per-test and per-assertion budgets are raised; locally they
  // stay at Playwright's defaults (30 s and 5 s), so a real hang still shows up quickly.
  timeout: isCI ? 120_000 : 30_000,
  expect: { timeout: isCI ? 20_000 : 5_000 },
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
    timeout: isCI ? 300_000 : 120_000,
    env: { VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? "https://api.e2e.invalid" }
  }
});
