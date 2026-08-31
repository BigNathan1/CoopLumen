/**
 * Testnet verification for time bounds in the transaction builders.
 *
 * Confirms that the bounds the builders encode are the bounds Horizon enforces:
 * a transaction inside its window is accepted and reports the requested bounds
 * back, and one whose window has closed is rejected with `tx_too_late`.
 *
 * Skipped unless STELLAR_TESTNET_INTEGRATION=1, so the default suite stays
 * fast, deterministic and offline.
 */

import { Horizon, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { buildUnsignedPayment, submitPayment } from '../transactions';
import { establishTrustline } from '../trustlines';
import { DEFAULT_TIMEOUT_SECONDS } from '../timeBounds';

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

const RUN = process.env.STELLAR_TESTNET_INTEGRATION === '1';
const describeIf = RUN ? describe : describe.skip;

const HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = process.env.STELLAR_FRIENDBOT_URL ?? 'https://friendbot.stellar.org';

jest.setTimeout(180_000);

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Horizon reports the enforced window under `preconditions.timebounds`, in Unix
 * seconds, but the SDK's TransactionRecord type does not declare it.
 */
type TimeBoundedRecord = Horizon.ServerApi.TransactionRecord & {
  preconditions?: { timebounds?: { min_time?: string; max_time?: string } };
};

async function fetchRecord(hash: string, server: Horizon.Server): Promise<TimeBoundedRecord> {
  return (await server.transactions().transaction(hash).call()) as TimeBoundedRecord;
}

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status}`);
  }
}

describeIf('transaction builder time bounds against Stellar testnet', () => {
  const server = new Horizon.Server(HORIZON_URL);
  const sender = Keypair.random();
  const recipient = Keypair.random();
  const issuer = Keypair.random();

  beforeAll(async () => {
    await Promise.all([
      fundAccount(sender.publicKey()),
      fundAccount(recipient.publicKey()),
      fundAccount(issuer.publicKey()),
    ]);
  });

  it('submits a payment inside its window and Horizon reports the requested bounds', async () => {
    const minTime = nowSeconds() - 60;
    const maxTime = nowSeconds() + 600;

    const hash = await submitPayment({
      senderSecret: sender.secret(),
      destinationPublicKey: recipient.publicKey(),
      assetCode: 'XLM',
      assetIssuer: '',
      amount: '1.0000000',
      timeBounds: { minTime, maxTime },
    });

    const record = await fetchRecord(hash, server);

    expect(record.successful).toBe(true);
    expect(record.preconditions?.timebounds).toEqual({
      min_time: String(minTime),
      max_time: String(maxTime),
    });
  });

  it('applies the default expiry window when no bounds are given', async () => {
    const before = nowSeconds();

    const hash = await establishTrustline({
      accountSecret: recipient.secret(),
      assetCode: 'ECO',
      assetIssuer: issuer.publicKey(),
      limit: '1000',
    });

    const record = await fetchRecord(hash, server);
    const maxTime = Number(record.preconditions?.timebounds?.max_time);

    expect(record.successful).toBe(true);
    expect(maxTime).toBeGreaterThanOrEqual(before);
    expect(maxTime).toBeLessThanOrEqual(before + DEFAULT_TIMEOUT_SECONDS);
  });

  it('is rejected by Horizon with tx_too_late once its window has closed', async () => {
    const xdr = await buildUnsignedPayment({
      senderPublicKey: sender.publicKey(),
      destinationPublicKey: recipient.publicKey(),
      assetCode: 'XLM',
      assetIssuer: '',
      amount: '1.0000000',
      timeBounds: { maxTime: nowSeconds() + 2 },
    });

    const transaction = new Transaction(xdr, Networks.TESTNET);
    transaction.sign(sender);

    await new Promise((resolve) => setTimeout(resolve, 4_000));

    await expect(server.submitTransaction(transaction)).rejects.toMatchObject({
      response: { data: { extras: { result_codes: { transaction: 'tx_too_late' } } } },
    });
  });

  it('is rejected by Horizon with tx_too_early before its window opens', async () => {
    const xdr = await buildUnsignedPayment({
      senderPublicKey: sender.publicKey(),
      destinationPublicKey: recipient.publicKey(),
      assetCode: 'XLM',
      assetIssuer: '',
      amount: '1.0000000',
      timeBounds: { minTime: nowSeconds() + 3600, maxTime: nowSeconds() + 7200 },
    });

    const transaction = new Transaction(xdr, Networks.TESTNET);
    transaction.sign(sender);

    await expect(server.submitTransaction(transaction)).rejects.toMatchObject({
      response: { data: { extras: { result_codes: { transaction: 'tx_too_early' } } } },
    });
  });

  it('rejects an already-elapsed window locally, without a Horizon round trip', async () => {
    await expect(
      submitPayment({
        senderSecret: sender.secret(),
        destinationPublicKey: recipient.publicKey(),
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '1.0000000',
        timeBounds: { maxTime: nowSeconds() - 10 },
      })
    ).rejects.toThrow('is in the past; the transaction would expire before it could be submitted.');
  });
});
