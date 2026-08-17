import { defineConfig } from "playwright/test";

const port = Number(process.env.E2E_PORT ?? 3101);
const host = process.env.E2E_HOST ?? "127.0.0.1";
const baseURL = process.env.E2E_BASE_URL ?? `http://${host}:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-web-server.mjs",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
