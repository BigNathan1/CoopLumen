import { startGateway } from './support/gateway';

/** Port the same-origin gateway listens on. */
const GATEWAY_PORT = Number(process.env.PLAYWRIGHT_GATEWAY_PORT ?? 3100);

/** Origin of the frontend the gateway serves. */
const APP_URL = process.env.PLAYWRIGHT_APP_URL ?? 'http://127.0.0.1:3000';

/** Origin of the backend the gateway relays API requests to. */
const API_URL = process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:4000';

/** How long the suite waits for the stack to answer. */
const STARTUP_TIMEOUT_MS = 30_000;

/** How long the suite waits between two attempts. */
const RETRY_INTERVAL_MS = 1_000;

/**
 * Polls a service until it answers, then returns.
 *
 * A missing service is the most common reason an E2E run fails, so the error
 * says which service is missing and how to start the stack.
 */
async function waitForService(url: string, name: string): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  let lastError = 'no response';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }

  throw new Error(
    `The ${name} did not answer at ${url} within ${STARTUP_TIMEOUT_MS / 1000}s (${lastError}). ` +
      'Start the stack with "docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build --wait".'
  );
}

/**
 * Prepares the suite before the first spec runs.
 *
 * Waits for the stack to answer and starts the gateway that serves the app
 * and the API from one origin. The returned function shuts the gateway down
 * again once the run is over.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  await waitForService(`${APP_URL}/api/health`, 'frontend');
  await waitForService(`${API_URL}/health`, 'backend');

  const gateway = await startGateway({
    port: GATEWAY_PORT,
    appUrl: APP_URL,
    apiUrl: API_URL,
  });

  return async () => {
    await gateway.close();
  };
}
