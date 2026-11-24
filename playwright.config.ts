import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";
import { appConfigSchema } from "./src/config-schema.mjs";

// The suite tests the production build, served under a repository-style subpath, so
// it also verifies GitHub Pages hosting. Paths and port come from app.config.json.
const { testing } = appConfigSchema.parse(
  JSON.parse(
    readFileSync(new URL("./app.config.json", import.meta.url), "utf8"),
  ),
);
const origin = `http://localhost:${testing.port}`;
// Set PLAYWRIGHT_CHANNEL=msedge (or chrome) to use an installed browser locally.
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  workers: ci ? 2 : undefined,
  timeout: 60_000,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `${origin}${testing.subpath}`,
    channel,
    trace: "retain-on-failure",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "desktop",
      testIgnore: "**/mobile.e2e.ts",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: "**/mobile.e2e.ts",
      use: { ...devices["Pixel 7"], channel },
    },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${testing.port} --strictPort --base ${testing.subpath}`,
    url: `${origin}${testing.subpath}`,
    reuseExistingServer: !ci,
    timeout: 180_000,
  },
});
