import { test as base, expect, type Page } from '@playwright/test';
import { authenticatePage } from './auth';
import { createSessionToken, E2E_MEMBER_ADDRESS } from './session';

/** Fixtures every spec in the suite can rely on. */
export interface E2EFixtures {
  /** Origin of the backend API, for requests made outside the browser. */
  apiUrl: string;
  /** The Stellar address the suite acts as. */
  memberAddress: string;
  /** A session token the backend accepts for {@link memberAddress}. */
  sessionToken: string;
  /** A page whose API requests carry the session token. */
  authenticatedPage: Page;
}

/**
 * The suite's entry point.
 *
 * Specs import `test` and `expect` from here so every spec shares the same
 * arrangement: one member address, one session token and, where a spec asks
 * for it, a page that talks to the API as that member.
 */
export const test = base.extend<E2EFixtures>({
  apiUrl: async ({}, use) => {
    await use(process.env.PLAYWRIGHT_API_URL ?? 'http://127.0.0.1:4000');
  },
  memberAddress: async ({}, use) => {
    await use(E2E_MEMBER_ADDRESS);
  },
  sessionToken: async ({ memberAddress }, use) => {
    await use(createSessionToken(memberAddress));
  },
  authenticatedPage: async ({ page, sessionToken }, use) => {
    await authenticatePage(page, sessionToken);
    await use(page);
  },
});

export { expect };
