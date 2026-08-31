/**
 * Integration test: verifies balance caching (round-trip, TTL, expiry,
 * invalidation, malformed-payload recovery) against a real Redis instance
 * end-to-end through the actual `redisCache` singleton — no mocked client.
 * Requires REDIS_URL pointing at a reachable Redis server.
 * Skipped automatically when REDIS_URL is not set.
 */
import { createClient } from 'redis';
import { Keypair } from '@stellar/stellar-sdk';
import { Horizon } from '@stellar/stellar-sdk';
import {
  BALANCE_CACHE_TTL_SECONDS,
  getBalanceCacheKey,
  getCachedBalances,
  cacheBalances,
  invalidateBalanceCache,
} from '../balances';
import { redisCache } from '../redis';

const RUN = Boolean(process.env.REDIS_URL);
const describeIf = RUN ? describe : describe.skip;

const balancesFor = (amount: string): Horizon.HorizonApi.BalanceLine[] =>
  [{ asset_type: 'native', balance: amount }] as Horizon.HorizonApi.BalanceLine[];

describeIf('balance cache (Redis integration)', () => {
  let verifyClient: ReturnType<typeof createClient>;

  beforeAll(async () => {
    verifyClient = createClient({ url: process.env.REDIS_URL });
    await verifyClient.connect();
  });

  afterAll(async () => {
    await verifyClient.quit();
    // `cacheBalances`/`getCachedBalances` connect through the shared
    // `redisCache` singleton, which never tears itself down (it is meant to
    // live for the process lifetime). Close its underlying client here so
    // this suite doesn't leave an open handle behind for Jest to complain
    // about.
    const internalClient = (
      redisCache as unknown as { client: ReturnType<typeof createClient> | null }
    ).client;
    if (internalClient?.isOpen) {
      await internalClient.quit();
    }
  });

  afterEach(async () => {
    await verifyClient.flushDb();
  });

  it('returns null before anything has been cached', async () => {
    const publicKey = Keypair.random().publicKey();
    expect(await getCachedBalances(publicKey)).toBeNull();
  });

  it('round-trips balances through a real Redis server', async () => {
    const publicKey = Keypair.random().publicKey();
    const balances = balancesFor('250.0000000');

    await cacheBalances(publicKey, balances);

    expect(await getCachedBalances(publicKey)).toEqual(balances);
  });

  it('stores the value under the expected key with the configured TTL', async () => {
    const publicKey = Keypair.random().publicKey();
    await cacheBalances(publicKey, balancesFor('1.0000000'));

    const ttl = await verifyClient.ttl(getBalanceCacheKey(publicKey));

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(BALANCE_CACHE_TTL_SECONDS);
  });

  it(
    'expires the cached entry once the TTL elapses',
    async () => {
      const publicKey = Keypair.random().publicKey();
      await cacheBalances(publicKey, balancesFor('5.0000000'));

      await new Promise((resolve) => setTimeout(resolve, (BALANCE_CACHE_TTL_SECONDS + 1) * 1000));

      expect(await getCachedBalances(publicKey)).toBeNull();
    },
    (BALANCE_CACHE_TTL_SECONDS + 5) * 1000
  );

  it('invalidates only the requested address, leaving others cached', async () => {
    const a = Keypair.random().publicKey();
    const b = Keypair.random().publicKey();
    await cacheBalances(a, balancesFor('1'));
    await cacheBalances(b, balancesFor('2'));

    await invalidateBalanceCache([a]);

    expect(await getCachedBalances(a)).toBeNull();
    expect(await getCachedBalances(b)).toEqual(balancesFor('2'));
  });

  it('invalidates every requested address in one call', async () => {
    const a = Keypair.random().publicKey();
    const b = Keypair.random().publicKey();
    await cacheBalances(a, balancesFor('1'));
    await cacheBalances(b, balancesFor('2'));

    await invalidateBalanceCache([a, b]);

    expect(await getCachedBalances(a)).toBeNull();
    expect(await getCachedBalances(b)).toBeNull();
  });

  it('discards a malformed (non-array) cached payload and removes the key', async () => {
    const publicKey = Keypair.random().publicKey();
    await verifyClient.set(getBalanceCacheKey(publicKey), JSON.stringify({ not: 'an array' }));

    expect(await getCachedBalances(publicKey)).toBeNull();
    expect(await verifyClient.exists(getBalanceCacheKey(publicKey))).toBe(0);
  });

  it('discards an unparsable cached payload and removes the key', async () => {
    const publicKey = Keypair.random().publicKey();
    await verifyClient.set(getBalanceCacheKey(publicKey), 'not-json{{{');

    expect(await getCachedBalances(publicKey)).toBeNull();
    expect(await verifyClient.exists(getBalanceCacheKey(publicKey))).toBe(0);
  });

  it('overwrites a stale cached value with a fresh cacheBalances call', async () => {
    const publicKey = Keypair.random().publicKey();
    await cacheBalances(publicKey, balancesFor('1.0000000'));
    await cacheBalances(publicKey, balancesFor('2.0000000'));

    expect(await getCachedBalances(publicKey)).toEqual(balancesFor('2.0000000'));
  });
});
