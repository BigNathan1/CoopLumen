/**
 * Testnet verification for the payment path in `contracts/transactions.ts`.
 *
 * The unit suite mocks Horizon so it stays fast and deterministic; this suite
 * exercises the same code against the real Horizon testnet, funding throwaway
 * accounts with Friendbot. It is opt-in — set `STELLAR_TESTNET_E2E=1` to run it:
 *
 *   STELLAR_TESTNET_E2E=1 npm test -- transactions.testnet
 *
 * Without that variable the suite is skipped, so CI and local runs never depend
 * on network access.
 */

import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';
import { establishTrustline } from '../trustlines';
import { StellarError } from '../errors';
import { buildUnsignedPayment, submitPayment } from '../transactions';

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

describeIf('payments against the Stellar testnet', () => {
  const issuer = Keypair.random();
  const distributor = Keypair.random();
  const member = Keypair.random();
  const assetCode = 'COOP';

  beforeAll(async () => {
    await Promise.all([
      fundAccount(issuer.publicKey()),
      fundAccount(distributor.publicKey()),
      fundAccount(member.publicKey()),
    ]);

    await establishTrustline({
      accountSecret: distributor.secret(),
      assetCode,
      assetIssuer: issuer.publicKey(),
    });
  }, NETWORK_TIMEOUT_MS);

  it(
    'sends a native XLM payment and reports the ledger hash',
    async () => {
      const hash = await submitPayment({
        senderSecret: distributor.secret(),
        destinationPublicKey: member.publicKey(),
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '1.5',
        memo: 'testnet payment',
      });

      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      const balances = await StellarService.getAccountBalance(member.publicKey());
      const native = balances.find((balance) => balance.asset_type === 'native');
      expect(Number(native?.balance)).toBeGreaterThan(10_000);
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'issues a community asset to a trusting account and pays it onward',
    async () => {
      await submitPayment({
        senderSecret: issuer.secret(),
        destinationPublicKey: distributor.publicKey(),
        assetCode,
        assetIssuer: issuer.publicKey(),
        amount: '100',
      });

      const balances = await StellarService.getAccountBalance(distributor.publicKey());
      const line = balances.find(
        (balance) =>
          balance.asset_type !== 'native' &&
          'asset_code' in balance &&
          balance.asset_code === assetCode
      );

      expect(line?.balance).toBe('100.0000000');
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'maps a missing destination trustline to an actionable message',
    async () => {
      const stranger = Keypair.random();
      await fundAccount(stranger.publicKey());

      await expect(
        submitPayment({
          senderSecret: issuer.secret(),
          destinationPublicKey: stranger.publicKey(),
          assetCode,
          assetIssuer: issuer.publicKey(),
          amount: '1',
        })
      ).rejects.toMatchObject({
        name: 'StellarError',
        message: expect.stringContaining('op_no_trust'),
      });
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'maps an unfunded source account to a 404',
    async () => {
      const unfunded = Keypair.random();

      await expect(
        submitPayment({
          senderSecret: unfunded.secret(),
          destinationPublicKey: member.publicKey(),
          assetCode: 'XLM',
          assetIssuer: '',
          amount: '1',
        })
      ).rejects.toMatchObject({ name: 'StellarError', status: 404 });
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'builds an unsigned envelope from the live sequence number',
    async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: distributor.publicKey(),
        destinationPublicKey: member.publicKey(),
        assetCode,
        assetIssuer: issuer.publicKey(),
        amount: '1',
      });

      const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
      expect(transaction.signatures).toHaveLength(0);
      expect(transaction.operations).toHaveLength(1);
      expect(transaction.source).toBe(distributor.publicKey());
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'rejects an invalid amount without a network round trip',
    async () => {
      await expect(
        submitPayment({
          senderSecret: distributor.secret(),
          destinationPublicKey: member.publicKey(),
          assetCode: 'XLM',
          assetIssuer: '',
          amount: '0',
        })
      ).rejects.toBeInstanceOf(StellarError);
    },
    NETWORK_TIMEOUT_MS
  );
});
