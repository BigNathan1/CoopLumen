/**
 * Testnet verification for memo support in the transaction builders.
 *
 * Submits real transactions carrying text and hash memos, then reads them back
 * from Horizon and asserts the memo Horizon recorded is the one that was asked
 * for. Also confirms that a memo Stellar cannot represent is rejected locally,
 * before a Horizon round trip is spent on it.
 *
 * Skipped unless STELLAR_TESTNET_INTEGRATION=1, so the default suite stays
 * fast, deterministic and offline.
 */

import { Horizon, Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { establishTrustline } from '../trustlines';
import { submitPayment } from '../transactions';
import { buildUnsignedPayment } from '../transactions';

jest.mock('../../cache/balances', () => ({
  invalidateBalanceCache: jest.fn().mockResolvedValue(undefined),
}));

const RUN = process.env.STELLAR_TESTNET_INTEGRATION === '1';
const describeIf = RUN ? describe : describe.skip;

const HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const FRIENDBOT_URL = process.env.STELLAR_FRIENDBOT_URL ?? 'https://friendbot.stellar.org';
const HASH_MEMO = 'ab'.repeat(32);

jest.setTimeout(180_000);

async function fundAccount(publicKey: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot funding failed for ${publicKey}: ${response.status}`);
  }
}

describeIf('transaction builder memos against Stellar testnet', () => {
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

  it('records a text memo on a payment Horizon accepts', async () => {
    const hash = await submitPayment({
      senderSecret: sender.secret(),
      destinationPublicKey: recipient.publicKey(),
      assetCode: 'XLM',
      assetIssuer: '',
      amount: '1.0000000',
      memo: { type: 'text', value: 'cooplumen payout' },
    });

    const record = await server.transactions().transaction(hash).call();

    expect(record.successful).toBe(true);
    expect(record.memo_type).toBe('text');
    expect(record.memo).toBe('cooplumen payout');
  });

  it('records a hash memo on a payment Horizon accepts', async () => {
    const hash = await submitPayment({
      senderSecret: sender.secret(),
      destinationPublicKey: recipient.publicKey(),
      assetCode: 'XLM',
      assetIssuer: '',
      amount: '1.0000000',
      memo: { type: 'hash', value: HASH_MEMO },
    });

    const record = await server.transactions().transaction(hash).call();

    expect(record.successful).toBe(true);
    expect(record.memo_type).toBe('hash');
    // Horizon returns hash memos base64 encoded.
    expect(Buffer.from(record.memo ?? '', 'base64').toString('hex')).toBe(HASH_MEMO);
  });

  it('records a hash memo on a trustline Horizon accepts', async () => {
    const hash = await establishTrustline({
      accountSecret: recipient.secret(),
      assetCode: 'ECO',
      assetIssuer: issuer.publicKey(),
      limit: '1000',
      memo: { type: 'hash', value: HASH_MEMO },
    });

    const record = await server.transactions().transaction(hash).call();

    expect(record.successful).toBe(true);
    expect(record.memo_type).toBe('hash');
    expect(Buffer.from(record.memo ?? '', 'base64').toString('hex')).toBe(HASH_MEMO);
  });

  it('builds unsigned XDR whose memo survives signing and submission', async () => {
    const xdr = await buildUnsignedPayment({
      senderPublicKey: sender.publicKey(),
      destinationPublicKey: recipient.publicKey(),
      assetCode: 'XLM',
      assetIssuer: '',
      amount: '1.0000000',
      memo: { type: 'hash', value: HASH_MEMO },
    });

    const transaction = new Transaction(xdr, Networks.TESTNET);
    transaction.sign(sender);

    const submitted = await server.submitTransaction(transaction);
    const record = await server.transactions().transaction(submitted.hash).call();

    expect(record.memo_type).toBe('hash');
    expect(Buffer.from(record.memo ?? '', 'base64').toString('hex')).toBe(HASH_MEMO);
  });

  it('rejects an invalid memo locally instead of letting Horizon reject it', async () => {
    await expect(
      submitPayment({
        senderSecret: sender.secret(),
        destinationPublicKey: recipient.publicKey(),
        assetCode: 'XLM',
        assetIssuer: '',
        amount: '1.0000000',
        memo: { type: 'hash', value: 'not-a-hash' },
      })
    ).rejects.toThrow('Hash memo must be exactly 64 hexadecimal characters (32 bytes).');
  });
});
