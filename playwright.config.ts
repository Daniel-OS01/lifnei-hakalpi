/* Playwright render tests against the built site (dist), served by vite preview.
   Build first: npm run build. Locally, set PW_CHROMIUM_PATH to use a preinstalled Chromium;
   CI installs the matching browser with `npx playwright install --with-deps chromium`. */
import { defineConfig } from "@playwright/test";

const executablePath = process.env.PW_CHROMIUM_PATH;
const launchOptions = executablePath ? { executablePath } : {};

const viewports = [
  { name: "390", viewport: { width: 390, height: 844 } },
  { name: "1100", viewport: { width: 1100, height: 900 } },
];
const schemes = ["light", "dark"] as const;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:4173",
    browserName: "chromium",
    launchOptions,
  },
  projects: viewports.flatMap((v) =>
    schemes.map((colorScheme) => ({
      name: v.name + "-" + colorScheme,
      use: { viewport: v.viewport, colorScheme },
    })),
  ),
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: false,
  },
});
