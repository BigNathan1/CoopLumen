import { defineConfig, devices } from '@playwright/test';

/** Port the same-origin gateway listens on. */
const GATEWAY_PORT = Number(process.env.PLAYWRIGHT_GATEWAY_PORT ?? 3100);

/**
 * Origin the browser uses.
 *
 * The gateway serves the app and the API from this origin, so a spec can
 * drive the real frontend against the real backend without depending on how
 * a deployment separates the two.
 */
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${GATEWAY_PORT}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  globalSetup: './e2e/global-setup.ts',
  // The suite writes to one shared database and one shared stack, so specs
  // run one at a time. A failure is worth retrying in CI, where a cold
  // container can be slow to answer.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  expect: {
    timeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Brings up the full Docker Compose stack when nothing answers yet, so a
  // local run needs no separate `docker compose up`. CI starts the stack (and
  // runs migrations) before the suite, so the running stack is reused there.
  webServer: {
    command: 'docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build',
    cwd: '..',
    url: `${process.env.PLAYWRIGHT_APP_URL ?? 'http://127.0.0.1:3000'}/api/health`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
