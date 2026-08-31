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
    // In-process only: touching Redis here opens a connection per test.
    const { clearPriceMemoryCache } = await import('./src/cache/prices');
    clearPriceMemoryCache();
  } catch {
    // Module not loaded in this test run — nothing to clear.
  }
});

/**
 * Close anything holding the event loop open once a suite finishes. With
 * `--runInBand` a leaked pg pool or Redis socket keeps Jest alive after the
 * last assertion, which is what left the CI "Backend tests" job hanging.
 */
afterAll(async () => {
  try {
    const { db } = await import('./src/db');
    await db.end();
  } catch {
    // Pool never created in this suite — nothing to close.
  }

  try {
    const { redisCache } = await import('./src/cache/redis');
    await redisCache.disconnect();
  } catch {
    // Redis never used in this suite — nothing to close.
  }
});
