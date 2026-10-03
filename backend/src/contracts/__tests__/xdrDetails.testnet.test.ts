/**
 * Testnet verification for `deserializeXdr`.
 *
 * Submits a real transaction to Stellar testnet, then re-reads the envelope
 * Horizon stored for it and asserts the decoded details match the fields
 * Horizon itself reports (hash, source, sequence, fee, memo, operations).
 *
 * Skipped unless STELLAR_TESTNET_E2E=1, so the default suite stays
 * fast, deterministic and offline.
 */

import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { XdrDecodeError, deserializeXdr } from '../xdrDetails';

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

describeIf('deserializeXdr against Stellar testnet', () => {
  const server = new Horizon.Server(HORIZON_URL);
  const sender = Keypair.random();
  const recipient = Keypair.random();
  const memoText = 'cooplumen testnet';

  let submittedHash: string;
  let storedEnvelopeXdr: string;
  let horizonRecord: Horizon.ServerApi.TransactionRecord;

  beforeAll(async () => {
    await Promise.all([fundAccount(sender.publicKey()), fundAccount(recipient.publicKey())]);

    const account = await server.loadAccount(sender.publicKey());
    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: recipient.publicKey(),
          asset: Asset.native(),
          amount: '2.5000000',
        })
      )
      .addMemo(Memo.text(memoText))
      .setTimeout(180)
      .build();

    transaction.sign(sender);
    const submitted = await server.submitTransaction(transaction);
    submittedHash = submitted.hash;

    horizonRecord = await server.transactions().transaction(submittedHash).call();
    storedEnvelopeXdr = horizonRecord.envelope_xdr;
  });

  it('decodes the envelope Horizon stored for the submitted transaction', () => {
    const details = deserializeXdr(storedEnvelopeXdr, { networkPassphrase: Networks.TESTNET });

    expect(details.envelopeType).toBe('transaction');
    expect(details.hash).toBe(submittedHash);
    expect(details.sourceAccount).toBe(horizonRecord.source_account);
    expect(details.sequence).toBe(horizonRecord.source_account_sequence);
    expect(details.fee).toBe(String(horizonRecord.max_fee));
    expect(details.operationCount).toBe(horizonRecord.operation_count);
    expect(details.signatureCount).toBe(1);
  });

  it('decodes the memo Horizon reports for the transaction', () => {
    const details = deserializeXdr(storedEnvelopeXdr, { networkPassphrase: Networks.TESTNET });

    expect(horizonRecord.memo_type).toBe('text');
    expect(details.memo).toEqual({ type: 'text', value: horizonRecord.memo });
    expect(details.summary).toContain(memoText);
  });

  it('describes the payment operation the way Horizon records it', async () => {
    const details = deserializeXdr(storedEnvelopeXdr, { networkPassphrase: Networks.TESTNET });
    const operations = await server.operations().forTransaction(submittedHash).call();
    const payment = operations.records[0] as Horizon.ServerApi.PaymentOperationRecord;

    expect(details.operations[0]).toMatchObject({
      index: 0,
      type: payment.type,
      destination: payment.to,
      amount: payment.amount,
      asset: 'XLM',
    });
    expect(details.operations[0].summary).toContain(`Send ${payment.amount} XLM`);
  });

  it('rejects an envelope truncated in transit with a readable error', () => {
    const truncated = Buffer.from(storedEnvelopeXdr, 'base64').subarray(0, 24).toString('base64');

    expect(() => deserializeXdr(truncated, { networkPassphrase: Networks.TESTNET })).toThrow(
      XdrDecodeError
    );
  });
});
