/**
 * Jest global setup: runs after every test file's environment is set up.
 *
 * Ensures the in-memory price cache is cleared between tests so that
 * tests that only mock Redis don't receive stale in-memory entries from
 * a previous test in the same suite.
 */
afterEach(async () => {
  try {
    // Dynamic import avoids a hard dependency — if the module is not loaded
    // yet (e.g. in suites that don't touch prices at all) this is a no-op.
    const { clearPriceCache } = await import('./src/cache/prices');
    await clearPriceCache();
  } catch {
    // Module not loaded in this test run — nothing to clear.
  }
});
