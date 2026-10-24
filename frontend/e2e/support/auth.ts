import type { Page } from '@playwright/test';

/**
 * Signs every API request the page makes with a session token.
 *
 * The app keeps its session token in memory and sends it as a bearer header.
 * A CI run has no wallet extension to produce one, so the suite injects the
 * header the app would have injected and leaves the rest of the app
 * untouched — the browser still loads the real pages and the backend still
 * verifies the token.
 */
export async function authenticatePage(page: Page, sessionToken: string): Promise<void> {
  await page.addInitScript((token) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return nativeFetch(input, { ...init, headers });
    };
  }, sessionToken);
}
