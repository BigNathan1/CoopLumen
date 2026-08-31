/**
 * Testnet verification for `signTransactionWithSecret()` in `contracts/signing.ts`.
 *
 * The unit suite mocks Horizon so it stays fast and deterministic; this suite
 * proves the signatures this helper produces are actually accepted by the
 * network, using Friendbot-funded throwaway accounts. It is opt-in — set
 * `STELLAR_TESTNET_E2E=1` to run it:
 *
 *   STELLAR_TESTNET_E2E=1 npm test -- signing.testnet
 *
 * Without that variable the suite is skipped, so CI and local runs never depend
 * on network access.
 */

import { Asset, BASE_FEE, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { StellarService } from '../stellar';
import { StellarError } from '../errors';
import { buildUnsignedPayment, submitSignedXdr } from '../transactions';
import { DISTRIBUTOR_PUBLIC_KEY_ENV, signTransactionWithSecret } from '../signing';

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

describeIf('server-side signing against the Stellar testnet', () => {
  const distributor = Keypair.random();
  const member = Keypair.random();
  const previousDistributorEnv = process.env[DISTRIBUTOR_PUBLIC_KEY_ENV];

  beforeAll(async () => {
    process.env[DISTRIBUTOR_PUBLIC_KEY_ENV] = distributor.publicKey();
    await Promise.all([fundAccount(distributor.publicKey()), fundAccount(member.publicKey())]);
  }, NETWORK_TIMEOUT_MS);

  afterAll(() => {
    if (previousDistributorEnv === undefined) {
      delete process.env[DISTRIBUTOR_PUBLIC_KEY_ENV];
    } else {
      process.env[DISTRIBUTOR_PUBLIC_KEY_ENV] = previousDistributorEnv;
    }
  });

  it(
    'produces a signature Horizon accepts',
    async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: distributor.publicKey(),
        destinationPublicKey: member.publicKey(),
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '2.5',
        memo: 'server signed',
      });

      const signed = signTransactionWithSecret(xdr, distributor.secret());
      const hash = await submitSignedXdr(signed);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'signs an envelope only once, so Horizon does not see an extra signature',
    async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: distributor.publicKey(),
        destinationPublicKey: member.publicKey(),
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '1',
      });

      const signedOnce = signTransactionWithSecret(xdr, distributor.secret());
      const signedTwice = signTransactionWithSecret(signedOnce, distributor.secret());

      expect(signedTwice).toBe(signedOnce);
      await expect(submitSignedXdr(signedTwice)).resolves.toMatch(/^[0-9a-f]{64}$/);
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'reports tx_bad_auth when the envelope is submitted without the distributor signature',
    async () => {
      const account = await StellarService.loadAccount(distributor.publicKey());
      const unsigned = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: StellarService.getNetwork(),
      })
        .addOperation(
          Operation.payment({
            destination: member.publicKey(),
            asset: Asset.native(),
            amount: '1',
          })
        )
        .setTimeout(30)
        .build();

      await expect(submitSignedXdr(unsigned.toXDR())).rejects.toMatchObject({
        name: 'StellarError',
        message: expect.stringContaining('tx_bad_auth'),
      });
    },
    NETWORK_TIMEOUT_MS
  );

  it(
    'refuses to sign for a member account even with a valid secret',
    async () => {
      const xdr = await buildUnsignedPayment({
        senderPublicKey: member.publicKey(),
        destinationPublicKey: distributor.publicKey(),
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '1',
      });

      expect(() => signTransactionWithSecret(xdr, member.secret())).toThrow(StellarError);
    },
    NETWORK_TIMEOUT_MS
  );
});
