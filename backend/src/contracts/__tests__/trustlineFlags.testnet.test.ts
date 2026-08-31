/**
 * Testnet verification for `setTrustlineFlags()` in `contracts/trustlines.ts`.
 *
 * The unit suite mocks Horizon so it stays fast and deterministic; this suite
 * runs the same code against the real Horizon testnet, funding throwaway
 * accounts with Friendbot. It is opt-in — set `STELLAR_TESTNET_E2E=1` to run it:
 *
 *   STELLAR_TESTNET_E2E=1 npm test -- trustlineFlags.testnet
 *
 * Without that variable the suite is skipped, so CI and local runs never depend
 * on network access.
 */

import {
  AuthRequiredFlag,
  AuthRevocableFlag,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';
import { StellarError } from '../errors';
import {
  authorizeTrustline,
  establishTrustline,
  revokeTrustlineAuthorization,
  setTrustlineFlags,
} from '../trustlines';

const RUN = process.env.STELLAR_TESTNET_E2E === '1';
const describeIf = RUN ? describe : describe.skip;

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const NETWORK_TIMEOUT_MS = 120_000;

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot failed to fund ${publicKey}: ${response.status}`);
  }
}

/** Flags on the issuer account itself; without these the network refuses to revoke. */
async function makeIssuerAuthRevocable(issuer: Keypair): Promise<void> {
  const account = await StellarService.loadAccount(issuer.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: StellarService.getNetwork(),
  })
    // The SDK types one flag per operation, so set them with two operations.
    .addOperation(Operation.setOptions({ setFlags: AuthRequiredFlag }))
    .addOperation(Operation.setOptions({ setFlags: AuthRevocableFlag }))
    .setTimeout(30)
    .build();

  tx.sign(issuer);
  await StellarService.submitTransaction(tx);
}

/** Reads the trustline the holder has for the issuer's asset. */
async function readTrustline(
  holder: string,
  assetCode: string,
  assetIssuer: string
): Promise<Horizon.HorizonApi.BalanceLineAsset | undefined> {
  const account = await StellarService.loadAccount(holder);
  return account.balances.find(
    (balance): balance is Horizon.HorizonApi.BalanceLineAsset =>
      balance.asset_type !== 'native' &&
      balance.asset_type !== 'liquidity_pool_shares' &&
      balance.asset_code === assetCode &&
      balance.asset_issuer === assetIssuer
  );
}

describeIf('trustline flags against the Stellar testnet', () => {
  const issuer = Keypair.random();
  const holder = Keypair.random();
  const assetCode = 'COOP';

  beforeAll(async () => {
    await Promise.all([fundAccount(issuer.publicKey()), fundAccount(holder.publicKey())]);
    await makeIssuerAuthRevocable(issuer);
    await establishTrustline({
      accountSecret: holder.secret(),
      assetCode,
      assetIssuer: issuer.publicKey(),
    });
  }, NETWORK_TIMEOUT_MS);

  it(
    'authorizes a trustline the issuer had left unauthorized',
    async () => {
      const before = await readTrustline(holder.publicKey(), assetCode, issuer.publicKey());
      expect(before?.is_authorized).toBe(false);

      const hash = await authorizeTrustline({
        issuerSecret: issuer.secret(),
        trustorPublicKey: holder.publicKey(),
        assetCode,
      });
      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      const after = await readTrustline(holder.publicKey(), assetCode, issuer.publicKey());
      expect(after?.is_authorized).toBe(true);
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'downgrades an authorized holder to maintain-liabilities only',
    async () => {
      await revokeTrustlineAuthorization({
        issuerSecret: issuer.secret(),
        trustorPublicKey: holder.publicKey(),
        assetCode,
        keepLiabilities: true,
      });

      const line = await readTrustline(holder.publicKey(), assetCode, issuer.publicKey());
      expect(line?.is_authorized).toBe(false);
      expect(line?.is_authorized_to_maintain_liabilities).toBe(true);
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'clears every authorization flag',
    async () => {
      await revokeTrustlineAuthorization({
        issuerSecret: issuer.secret(),
        trustorPublicKey: holder.publicKey(),
        assetCode,
      });

      const line = await readTrustline(holder.publicKey(), assetCode, issuer.publicKey());
      expect(line?.is_authorized).toBe(false);
      expect(line?.is_authorized_to_maintain_liabilities).toBe(false);
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'maps a missing trustline to an actionable message',
    async () => {
      const stranger = Keypair.random();
      await fundAccount(stranger.publicKey());

      await expect(
        setTrustlineFlags({
          issuerSecret: issuer.secret(),
          trustorPublicKey: stranger.publicKey(),
          assetCode,
          flags: { authorized: true },
        })
      ).rejects.toMatchObject({
        name: 'StellarError',
        message: expect.stringContaining('op_no_trust'),
      });
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'maps a revocation by a non-revocable issuer to op_cant_revoke',
    async () => {
      const plainIssuer = Keypair.random();
      const plainHolder = Keypair.random();
      await Promise.all([
        fundAccount(plainIssuer.publicKey()),
        fundAccount(plainHolder.publicKey()),
      ]);
      await establishTrustline({
        accountSecret: plainHolder.secret(),
        assetCode,
        assetIssuer: plainIssuer.publicKey(),
      });

      await expect(
        revokeTrustlineAuthorization({
          issuerSecret: plainIssuer.secret(),
          trustorPublicKey: plainHolder.publicKey(),
          assetCode,
        })
      ).rejects.toMatchObject({
        name: 'StellarError',
        message: expect.stringContaining('op_cant_revoke'),
      });
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'rejects a no-op flag update without a network round trip',
    async () => {
      await expect(
        setTrustlineFlags({
          issuerSecret: issuer.secret(),
          trustorPublicKey: holder.publicKey(),
          assetCode,
          flags: {},
        })
      ).rejects.toBeInstanceOf(StellarError);
    },
    NETWORK_TIMEOUT_MS
  );
});
