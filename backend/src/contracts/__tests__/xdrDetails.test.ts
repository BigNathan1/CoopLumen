import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { XdrDecodeError, deserializeXdr } from '../xdrDetails';
import { StellarService } from '../stellar';

jest.mock('../stellar', () => ({
  StellarService: {
    getServer: jest.fn(),
    getNetwork: jest.fn().mockReturnValue('Test SDF Network ; September 2015'),
    loadAccount: jest.fn(),
    submitTransaction: jest.fn(),
  },
}));

const NETWORK = Networks.TESTNET;
const source = Keypair.random();
const destination = Keypair.random();
const issuer = Keypair.random();
const ECO = new Asset('ECO', issuer.publicKey());

function newBuilder(sequence = '1234'): TransactionBuilder {
  return new TransactionBuilder(new Account(source.publicKey(), sequence), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  });
}

function paymentXdr(options: { memo?: Memo; sign?: boolean } = {}): string {
  const builder = newBuilder().addOperation(
    Operation.payment({
      destination: destination.publicKey(),
      asset: ECO,
      amount: '25.5000000',
    })
  );

  if (options.memo) builder.addMemo(options.memo);

  const transaction = builder.setTimebounds(0, 1_800_000_000).build();
  if (options.sign !== false) transaction.sign(source);

  return transaction.toXDR();
}

describe('deserializeXdr', () => {
  it('describes a single-operation payment envelope', () => {
    const details = deserializeXdr(paymentXdr());

    expect(details.envelopeType).toBe('transaction');
    expect(details.sourceAccount).toBe(source.publicKey());
    expect(details.sequence).toBe('1235');
    expect(details.networkPassphrase).toBe(NETWORK);
    expect(details.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(details.operationCount).toBe(1);
    expect(details.signatureCount).toBe(1);
    expect(details.signatureHints).toEqual([expect.stringMatching(/^[0-9a-f]{8}$/)]);
  });

  it('reports the fee in stroops and in XLM', () => {
    const details = deserializeXdr(paymentXdr());

    expect(details.fee).toBe('100');
    expect(details.feeXlm).toBe('0.0000100');
  });

  it('renders the payment operation in plain language', () => {
    const [operation] = deserializeXdr(paymentXdr()).operations;

    expect(operation).toMatchObject({
      index: 0,
      type: 'payment',
      sourceAccount: null,
      destination: destination.publicKey(),
      asset: `ECO:${issuer.publicKey()}`,
      amount: '25.5000000',
    });
    expect(operation.summary).toContain('Send 25.5000000 ECO');
    expect(operation.summary).toContain(destination.publicKey().slice(-4));
  });

  it('renders time bounds as both epoch seconds and ISO 8601', () => {
    const details = deserializeXdr(paymentXdr());

    expect(details.timeBounds).toEqual({
      minTime: '0',
      maxTime: '1800000000',
      minTimeIso: null,
      maxTimeIso: new Date(1_800_000_000 * 1000).toISOString(),
    });
  });

  it.each([
    [Memo.text('rent for july'), { type: 'text', value: 'rent for july' }],
    [Memo.id('90210'), { type: 'id', value: '90210' }],
    [Memo.hash('ab'.repeat(32)), { type: 'hash', value: 'ab'.repeat(32) }],
    [Memo.return('cd'.repeat(32)), { type: 'return', value: 'cd'.repeat(32) }],
  ])('decodes %s memos', (memo, expected) => {
    expect(deserializeXdr(paymentXdr({ memo }))).toMatchObject({ memo: expected });
  });

  it('reports an absent memo as none', () => {
    expect(deserializeXdr(paymentXdr()).memo).toEqual({ type: 'none', value: null });
  });

  it('appends a text memo to the envelope summary', () => {
    const details = deserializeXdr(paymentXdr({ memo: Memo.text('rent for july') }));

    expect(details.summary).toContain('rent for july');
  });

  it('summarises multi-operation envelopes by count', () => {
    const xdr = newBuilder()
      .addOperation(Operation.changeTrust({ asset: ECO, limit: '1000' }))
      .addOperation(
        Operation.payment({ destination: destination.publicKey(), asset: ECO, amount: '1' })
      )
      .setTimeout(60)
      .build()
      .toXDR();

    const details = deserializeXdr(xdr);

    expect(details.operationCount).toBe(2);
    expect(details.summary).toContain('2 operations from');
    expect(details.operations[0].summary).toContain('Trust ECO');
    expect(details.operations[0].limit).toBe('1000.0000000');
  });

  it('describes a trustline removal rather than a zero-limit trust', () => {
    const xdr = newBuilder()
      .addOperation(Operation.changeTrust({ asset: ECO, limit: '0' }))
      .setTimeout(60)
      .build()
      .toXDR();

    expect(deserializeXdr(xdr).operations[0].summary).toContain('Remove trustline for ECO');
  });

  it('labels the native asset XLM', () => {
    const xdr = newBuilder()
      .addOperation(
        Operation.payment({
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: '3',
        })
      )
      .setTimeout(60)
      .build()
      .toXDR();

    const [operation] = deserializeXdr(xdr).operations;

    expect(operation.asset).toBe('XLM');
    expect(operation.summary).toBe(
      `Send 3.0000000 XLM to ${destination.publicKey().slice(0, 4)}...${destination.publicKey().slice(-4)}`
    );
  });

  it('records an explicit per-operation source account', () => {
    const operationSource = Keypair.random().publicKey();
    const xdr = newBuilder()
      .addOperation(
        Operation.payment({
          source: operationSource,
          destination: destination.publicKey(),
          asset: Asset.native(),
          amount: '1',
        })
      )
      .setTimeout(60)
      .build()
      .toXDR();

    expect(deserializeXdr(xdr).operations[0].sourceAccount).toBe(operationSource);
  });

  it('falls back to a readable description for operations it does not model', () => {
    const xdr = newBuilder()
      .addOperation(Operation.setOptions({ homeDomain: 'cooplumen.org' }))
      .setTimeout(60)
      .build()
      .toXDR();

    expect(deserializeXdr(xdr).operations[0]).toMatchObject({
      type: 'setOptions',
      summary: 'Set account options',
    });
  });

  it('unwraps a fee-bump envelope and reports the outer fee separately', () => {
    const inner = TransactionBuilder.fromXDR(paymentXdr(), NETWORK);
    const feeSource = Keypair.random();
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      feeSource,
      '2000',
      inner as Parameters<typeof TransactionBuilder.buildFeeBumpTransaction>[2],
      NETWORK
    );

    const details = deserializeXdr(feeBump.toXDR());

    expect(details.envelopeType).toBe('feeBumpTransaction');
    expect(details.sourceAccount).toBe(source.publicKey());
    expect(details.operations[0].type).toBe('payment');
    expect(details.feeBump).toMatchObject({
      feeSource: feeSource.publicKey(),
      fee: '4000',
      feeXlm: '0.0004000',
    });
    expect(details.summary).toContain('fee-bumped by');
  });

  it('defaults to the configured network passphrase', () => {
    (StellarService.getNetwork as jest.Mock).mockClear();

    deserializeXdr(paymentXdr());

    expect(StellarService.getNetwork).toHaveBeenCalled();
  });

  it('accepts an explicit network passphrase without consulting the service', () => {
    (StellarService.getNetwork as jest.Mock).mockClear();

    deserializeXdr(paymentXdr(), { networkPassphrase: NETWORK });

    expect(StellarService.getNetwork).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 42, {}])('rejects non-string input %p', (input) => {
    expect(() => deserializeXdr(input)).toThrow(new XdrDecodeError('XDR must be a string.'));
  });

  it.each(['', '   '])('rejects blank input %p', (input) => {
    expect(() => deserializeXdr(input)).toThrow('XDR is required and cannot be empty.');
  });

  it('rejects input that is not base64', () => {
    expect(() => deserializeXdr('not base64!! $$$')).toThrow(
      'XDR is not valid base64. Expected a base64-encoded transaction envelope.'
    );
  });

  it('maps a truncated envelope to a readable error instead of an XDR reader error', () => {
    const truncated = Buffer.from(paymentXdr(), 'base64').subarray(0, 20).toString('base64');

    expect(() => deserializeXdr(truncated)).toThrow(XdrDecodeError);
    try {
      deserializeXdr(truncated);
    } catch (error) {
      expect((error as Error).message).not.toMatch(/XDR Read Error/);
    }
  });

  it('maps base64 that is not an envelope to a readable error', () => {
    const notAnEnvelope = Buffer.from('definitely not an envelope').toString('base64');

    expect(() => deserializeXdr(notAnEnvelope)).toThrow(XdrDecodeError);
  });
});
