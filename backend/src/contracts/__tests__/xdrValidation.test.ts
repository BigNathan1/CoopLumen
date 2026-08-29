import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { validateXdr } from '../xdrValidation';
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
const destination = Keypair.random().publicKey();

function buildPaymentXdr(
  options: { timebounds?: { minTime: number; maxTime: number }; sign?: boolean } = {}
): string {
  const account = new Account(source.publicKey(), '1234');
  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK,
  }).addOperation(Operation.payment({ destination, asset: Asset.native(), amount: '10.0000000' }));

  const transaction = options.timebounds
    ? builder.setTimebounds(options.timebounds.minTime, options.timebounds.maxTime).build()
    : builder.setTimeout(180).build();

  if (options.sign !== false) {
    transaction.sign(source);
  }

  return transaction.toXDR();
}

describe('validateXdr', () => {
  it('accepts a well-formed signed payment envelope', () => {
    expect(validateXdr(buildPaymentXdr())).toEqual({ valid: true });
  });

  it('accepts an unsigned envelope, since signing happens in the wallet', () => {
    expect(validateXdr(buildPaymentXdr({ sign: false }))).toEqual({ valid: true });
  });

  it('defaults to the configured network passphrase', () => {
    validateXdr(buildPaymentXdr());
    expect(StellarService.getNetwork).toHaveBeenCalled();
  });

  it('accepts an explicit network passphrase without consulting the service', () => {
    (StellarService.getNetwork as jest.Mock).mockClear();

    expect(validateXdr(buildPaymentXdr(), { networkPassphrase: NETWORK })).toEqual({ valid: true });
    expect(StellarService.getNetwork).not.toHaveBeenCalled();
  });

  it('accepts a fee-bump envelope by validating its inner transaction', () => {
    const inner = TransactionBuilder.fromXDR(buildPaymentXdr(), NETWORK);
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      Keypair.random(),
      '2000',
      inner as Parameters<typeof TransactionBuilder.buildFeeBumpTransaction>[2],
      NETWORK
    );

    expect(validateXdr(feeBump.toXDR())).toEqual({ valid: true });
  });

  it.each([
    [undefined, 'XDR must be a string.'],
    [null, 'XDR must be a string.'],
    [42, 'XDR must be a string.'],
    [{}, 'XDR must be a string.'],
  ])('rejects non-string input %p', (input, message) => {
    expect(validateXdr(input)).toEqual({ valid: false, error: message });
  });

  it.each(['', '   ', '\n\t'])('rejects blank input %p', (input) => {
    expect(validateXdr(input)).toEqual({
      valid: false,
      error: 'XDR is required and cannot be empty.',
    });
  });

  it('rejects input that is not base64', () => {
    expect(validateXdr('not base64!! $$$')).toEqual({
      valid: false,
      error: 'XDR is not valid base64. Expected a base64-encoded transaction envelope.',
    });
  });

  it('rejects base64 that does not decode to a transaction envelope', () => {
    const result = validateXdr(Buffer.from('definitely not an envelope').toString('base64'));

    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toMatch(/XDR Read Error/);
  });

  it('rejects a truncated envelope with an actionable message', () => {
    const xdr = buildPaymentXdr();
    const truncated = Buffer.from(xdr, 'base64').subarray(0, 20).toString('base64');

    const result = validateXdr(truncated);

    expect(result.valid).toBe(false);
    expect(result.error).not.toMatch(/XDR Read Error/);
  });

  it('rejects an envelope whose time bounds have already elapsed', () => {
    const maxTime = 1_700_000_000;
    const xdr = buildPaymentXdr({ timebounds: { minTime: 0, maxTime } });

    const result = validateXdr(xdr, { nowSeconds: maxTime + 1 });

    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
    expect(result.error).toContain(new Date(maxTime * 1000).toISOString());
  });

  it('accepts an envelope whose time bounds are still open', () => {
    const maxTime = 1_700_000_000;
    const xdr = buildPaymentXdr({ timebounds: { minTime: 0, maxTime } });

    expect(validateXdr(xdr, { nowSeconds: maxTime - 1 })).toEqual({ valid: true });
  });

  it('accepts an envelope with an unbounded maxTime', () => {
    const xdr = buildPaymentXdr({ timebounds: { minTime: 0, maxTime: 0 } });

    expect(validateXdr(xdr, { nowSeconds: 2_000_000_000 })).toEqual({ valid: true });
  });
});
