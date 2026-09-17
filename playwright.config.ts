import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import "./scripts/test-env";

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(resolve(".playwright"))) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".playwright");
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1366, height: 768 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: process.env.E2E_SERVER_MANAGED === "true",
    env: { APP_ORIGIN: "http://127.0.0.1:3100", DATABASE_URL: process.env.DATABASE_URL! },
    timeout: 60_000,
  },
});
