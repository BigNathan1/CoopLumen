/**
 * Testnet verification for `validateXdr`.
 *
 * Confirms that the offline verdict agrees with what Horizon actually does:
 * an envelope reported valid is accepted by the network, and an envelope
 * reported expired is rejected with `tx_too_late`.
 *
 * Skipped unless STELLAR_TESTNET_E2E=1, so the default suite stays
 * fast, deterministic and offline.
 */

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { validateXdr } from '../xdrValidation';

const RUN = process.env.STELLAR_TESTNET_E2E === '1';
const describeIf = RUN ? describe : describe.skip;

const HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = process.env.STELLAR_FRIENDBOT_URL ?? 'https://friendbot.stellar.org';

jest.setTimeout(120_000);

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status}`);
  }
}

describeIf('validateXdr against Stellar testnet', () => {
  const server = new Horizon.Server(HORIZON_URL);
  const sender = Keypair.random();
  const recipient = Keypair.random();

  beforeAll(async () => {
    await Promise.all([fundAccount(sender.publicKey()), fundAccount(recipient.publicKey())]);
  });

  async function buildPayment(timeoutSeconds: number): Promise<string> {
    const account = await server.loadAccount(sender.publicKey());
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: recipient.publicKey(),
          asset: Asset.native(),
          amount: '1.0000000',
        })
      )
      .setTimeout(timeoutSeconds)
      .build();

    transaction.sign(sender);
    return transaction.toXDR();
  }

  it('reports valid for an envelope Horizon then accepts', async () => {
    const xdr = await buildPayment(180);

    expect(validateXdr(xdr, { networkPassphrase: Networks.TESTNET })).toEqual({ valid: true });

    const submitted = await server.submitTransaction(
      TransactionBuilder.fromXDR(xdr, Networks.TESTNET)
    );
    expect(submitted.successful).toBe(true);
  });

  it('reports expired for an envelope Horizon rejects with tx_too_late', async () => {
    const xdr = await buildPayment(1);
    await new Promise((resolve) => setTimeout(resolve, 3_000));

    const result = validateXdr(xdr, { networkPassphrase: Networks.TESTNET });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');

    await expect(
      server.submitTransaction(TransactionBuilder.fromXDR(xdr, Networks.TESTNET))
    ).rejects.toMatchObject({
      response: { data: { extras: { result_codes: { transaction: 'tx_too_late' } } } },
    });
  });

  it('reports invalid for a truncated envelope without contacting Horizon', async () => {
    const xdr = await buildPayment(180);
    const truncated = Buffer.from(xdr, 'base64').subarray(0, 24).toString('base64');

    const result = validateXdr(truncated, { networkPassphrase: Networks.TESTNET });

    expect(result.valid).toBe(false);
    expect(result.error).not.toMatch(/XDR Read Error/);
  });
});
