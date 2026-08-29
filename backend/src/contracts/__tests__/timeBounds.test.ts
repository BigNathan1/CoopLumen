import {
  Account,
  Asset,
  BASE_FEE,
  Keypair,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  DEFAULT_TIMEOUT_SECONDS,
  TimeBoundsValidationError,
  applyTimeBounds,
  resolveTimeBounds,
} from '../timeBounds';

const NOW = 1_700_000_000;
const at = (offsetSeconds: number): number => NOW + offsetSeconds;

describe('resolveTimeBounds', () => {
  it('defaults to no lower bound and the default timeout as the upper bound', () => {
    expect(resolveTimeBounds(undefined, { nowSeconds: NOW })).toEqual({
      minTime: 0,
      maxTime: NOW + DEFAULT_TIMEOUT_SECONDS,
    });
  });

  it('honours a custom default timeout', () => {
    expect(resolveTimeBounds({}, { nowSeconds: NOW, defaultTimeoutSeconds: 600 })).toEqual({
      minTime: 0,
      maxTime: NOW + 600,
    });
  });

  it('accepts Unix seconds as numbers', () => {
    expect(resolveTimeBounds({ minTime: at(60), maxTime: at(300) }, { nowSeconds: NOW })).toEqual({
      minTime: at(60),
      maxTime: at(300),
    });
  });

  it('accepts Unix seconds as numeric strings', () => {
    expect(
      resolveTimeBounds({ minTime: String(at(60)), maxTime: String(at(300)) }, { nowSeconds: NOW })
    ).toEqual({ minTime: at(60), maxTime: at(300) });
  });

  it('accepts Date instances', () => {
    expect(
      resolveTimeBounds(
        { minTime: new Date(at(60) * 1000), maxTime: new Date(at(300) * 1000) },
        { nowSeconds: NOW }
      )
    ).toEqual({ minTime: at(60), maxTime: at(300) });
  });

  it('accepts ISO 8601 timestamps', () => {
    expect(
      resolveTimeBounds({ maxTime: new Date(at(300) * 1000).toISOString() }, { nowSeconds: NOW })
    ).toEqual({ minTime: 0, maxTime: at(300) });
  });

  it('truncates sub-second precision to whole seconds', () => {
    expect(
      resolveTimeBounds({ maxTime: new Date(at(300) * 1000 + 999) }, { nowSeconds: NOW })
    ).toEqual({ minTime: 0, maxTime: at(300) });
  });

  it('treats an explicit maxTime of 0 as never expiring', () => {
    expect(resolveTimeBounds({ minTime: at(60), maxTime: 0 }, { nowSeconds: NOW })).toEqual({
      minTime: at(60),
      maxTime: 0,
    });
  });

  it('applies the default timeout when only minTime is given', () => {
    expect(resolveTimeBounds({ minTime: at(5) }, { nowSeconds: NOW })).toEqual({
      minTime: at(5),
      maxTime: NOW + DEFAULT_TIMEOUT_SECONDS,
    });
  });

  it('rejects a maxTime that has already passed', () => {
    expect(() => resolveTimeBounds({ maxTime: at(-1) }, { nowSeconds: NOW })).toThrow(
      /is in the past; the transaction would expire before it could be submitted/
    );
  });

  it('rejects a maxTime at or before minTime', () => {
    expect(() =>
      resolveTimeBounds({ minTime: at(300), maxTime: at(300) }, { nowSeconds: NOW })
    ).toThrow(/must be after minTime/);

    expect(() =>
      resolveTimeBounds({ minTime: at(600), maxTime: at(300) }, { nowSeconds: NOW })
    ).toThrow(/must be after minTime/);
  });

  it('names the offending bound in range errors', () => {
    expect(() => resolveTimeBounds({ minTime: -1 }, { nowSeconds: NOW })).toThrow(
      'minTime cannot be negative.'
    );
    expect(() => resolveTimeBounds({ maxTime: -1 }, { nowSeconds: NOW })).toThrow(
      'maxTime cannot be negative.'
    );
    expect(() => resolveTimeBounds({ maxTime: 1e15 }, { nowSeconds: NOW })).toThrow(
      'maxTime is too far in the future to be represented.'
    );
  });

  it('rejects values it cannot interpret', () => {
    expect(() => resolveTimeBounds({ maxTime: 'next tuesday' }, { nowSeconds: NOW })).toThrow(
      'maxTime must be Unix seconds or an ISO 8601 timestamp (got "next tuesday").'
    );
    expect(() => resolveTimeBounds({ maxTime: '  ' }, { nowSeconds: NOW })).toThrow(
      'maxTime cannot be empty.'
    );
    expect(() => resolveTimeBounds({ maxTime: Number.NaN }, { nowSeconds: NOW })).toThrow(
      'maxTime must be a finite number of seconds.'
    );
    expect(() => resolveTimeBounds({ minTime: new Date('nonsense') })).toThrow(
      'minTime is an invalid Date.'
    );
  });

  it('throws TimeBoundsValidationError rather than a bare Error', () => {
    expect(() => resolveTimeBounds({ maxTime: -1 })).toThrow(TimeBoundsValidationError);
  });
});

describe('applyTimeBounds', () => {
  const source = Keypair.random();

  function build(
    timeBounds?: Parameters<typeof applyTimeBounds>[1],
    nowSeconds = NOW
  ): Transaction {
    const builder = new TransactionBuilder(new Account(source.publicKey(), '1'), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    }).addOperation(
      Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(),
        amount: '1',
      })
    );

    return applyTimeBounds(builder, timeBounds, { nowSeconds }).build();
  }

  it('encodes the resolved bounds into the built transaction', () => {
    const transaction = build({ minTime: at(60), maxTime: at(300) });

    expect(transaction.timeBounds).toEqual({
      minTime: String(at(60)),
      maxTime: String(at(300)),
    });
  });

  it('encodes the default window when no bounds are given', () => {
    expect(build().timeBounds).toEqual({
      minTime: '0',
      maxTime: String(NOW + DEFAULT_TIMEOUT_SECONDS),
    });
  });

  it('propagates validation errors instead of building an expired transaction', () => {
    expect(() => build({ maxTime: at(-10) })).toThrow(TimeBoundsValidationError);
  });
});
