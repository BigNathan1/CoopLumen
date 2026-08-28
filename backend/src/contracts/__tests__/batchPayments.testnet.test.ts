/**
 * Testnet verification for `contracts/batchPayments.ts`.
 *
 * The unit suite mocks Horizon so it stays fast and deterministic; this suite
 * runs the same code against the real Horizon testnet with Friendbot-funded
 * throwaway accounts, which is the only way to prove a multi-operation
 * transaction is applied atomically. It is opt-in — set `STELLAR_TESTNET_E2E=1`:
 *
 *   STELLAR_TESTNET_E2E=1 npm test -- batchPayments.testnet
 *
 * Without that variable the suite is skipped, so CI and local runs never depend
 * on network access.
 */

import { Keypair, Networks, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';
import { establishTrustline } from '../trustlines';
import { submitPayment } from '../transactions';
import { buildBatchPayment, submitBatchPayment } from '../batchPayments';

const RUN = process.env.STELLAR_TESTNET_E2E === '1';
const describeIf = RUN ? describe : describe.skip;

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const NETWORK_TIMEOUT_MS = 180_000;

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot failed to fund ${publicKey}: ${response.status}`);
  }
}

async function nativeBalance(publicKey: string): Promise<number> {
  const balances = await StellarService.getAccountBalance(publicKey);
  return Number(balances.find((balance) => balance.asset_type === 'native')?.balance ?? '0');
}

async function assetBalance(
  publicKey: string,
  assetCode: string,
  assetIssuer: string
): Promise<string | undefined> {
  const balances = await StellarService.getAccountBalance(publicKey);
  return balances.find(
    (balance) =>
      balance.asset_type !== 'native' &&
      'asset_code' in balance &&
      balance.asset_code === assetCode &&
      balance.asset_issuer === assetIssuer
  )?.balance;
}

describeIf('batch payments against the Stellar testnet', () => {
  const issuer = Keypair.random();
  const distributor = Keypair.random();
  const members = [Keypair.random(), Keypair.random(), Keypair.random()];
  const assetCode = 'COOP';

  beforeAll(async () => {
    await Promise.all(
      [issuer, distributor, ...members].map((keypair) => fundAccount(keypair.publicKey()))
    );

    await establishTrustline({
      accountSecret: distributor.secret(),
      assetCode,
      assetIssuer: issuer.publicKey(),
    });
    for (const member of members.slice(0, 2)) {
      await establishTrustline({
        accountSecret: member.secret(),
        assetCode,
        assetIssuer: issuer.publicKey(),
      });
    }

    await submitPayment({
      senderSecret: issuer.secret(),
      destinationPublicKey: distributor.publicKey(),
      assetCode,
      assetIssuer: issuer.publicKey(),
      amount: '1000',
    });
  }, NETWORK_TIMEOUT_MS);

  it(
    'pays several members in one transaction',
    async () => {
      const hash = await submitBatchPayment({
        senderSecret: distributor.secret(),
        payments: [
          {
            destinationPublicKey: members[0].publicKey(),
            assetCode,
            assetIssuer: issuer.publicKey(),
            amount: '10',
          },
          {
            destinationPublicKey: members[1].publicKey(),
            assetCode,
            assetIssuer: issuer.publicKey(),
            amount: '20',
          },
          {
            destinationPublicKey: members[2].publicKey(),
            assetCode: 'XLM',
            assetIssuer: '',
            amount: '5',
          },
        ],
        memo: 'weekly payout',
      });

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(await assetBalance(members[0].publicKey(), assetCode, issuer.publicKey())).toBe(
        '10.0000000'
      );
      expect(await assetBalance(members[1].publicKey(), assetCode, issuer.publicKey())).toBe(
        '20.0000000'
      );
      expect(await nativeBalance(members[2].publicKey())).toBeGreaterThan(10_000);
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'applies nothing when one payment in the batch fails, and names it',
    async () => {
      const before = await assetBalance(members[0].publicKey(), assetCode, issuer.publicKey());

      await expect(
        submitBatchPayment({
          senderSecret: distributor.secret(),
          payments: [
            {
              destinationPublicKey: members[0].publicKey(),
              assetCode,
              assetIssuer: issuer.publicKey(),
              amount: '1',
            },
            {
              // members[2] never established a trustline for the community asset.
              destinationPublicKey: members[2].publicKey(),
              assetCode,
              assetIssuer: issuer.publicKey(),
              amount: '1',
            },
          ],
        })
      ).rejects.toMatchObject({
        name: 'StellarError',
        message: expect.stringContaining(`payment 2 of 2, to ${members[2].publicKey()}`),
      });

      // Atomicity: the first payment must not have been applied either.
      expect(await assetBalance(members[0].publicKey(), assetCode, issuer.publicKey())).toBe(
        before
      );
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'builds an unsigned batch from the live sequence number',
    async () => {
      const xdr = await buildBatchPayment({
        senderPublicKey: distributor.publicKey(),
        payments: members.slice(0, 2).map((member) => ({
          destinationPublicKey: member.publicKey(),
          assetCode,
          assetIssuer: issuer.publicKey(),
          amount: '1',
        })),
      });

      const transaction = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
      expect(transaction.signatures).toHaveLength(0);
      expect(transaction.operations).toHaveLength(2);
      expect(transaction.source).toBe(distributor.publicKey());
      expect(transaction.fee).toBe('200');
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'sends a large batch in a single transaction',
    async () => {
      const hash = await submitBatchPayment({
        senderSecret: distributor.secret(),
        payments: Array.from({ length: 40 }, () => ({
          destinationPublicKey: members[0].publicKey(),
          assetCode,
          assetIssuer: issuer.publicKey(),
          amount: '0.1',
        })),
      });

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    },
    NETWORK_TIMEOUT_MS
  );
});
