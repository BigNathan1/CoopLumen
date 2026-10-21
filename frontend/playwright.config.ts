import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000', // Adjust if your frontend port differs
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /* Run your local Docker Compose stack before starting the tests */
  webServer: {
    // Navigate to the root to run docker-compose, assuming playwright is in frontend/
    command: 'cd .. && docker-compose -f docker-compose.test.yml up --build',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000, // Give Docker Compose ample time to pull images and start services
  },
});