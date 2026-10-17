import {
  unsignedPaymentSchema,
  submitTransactionSchema,
  transactionHashSchema,
  communityTransactionsQuerySchema,
} from '../transaction';

const KEY = `G${'A'.repeat(55)}`;
const KEY2 = `G${'B'.repeat(55)}`;
const VALID_HASH = 'a'.repeat(64);

const VALID_PAYMENT = {
  senderPublicKey: KEY,
  destinationPublicKey: KEY2,
  assetCode: 'ECO',
  assetIssuer: KEY,
  amount: '50',
};

describe('unsignedPaymentSchema', () => {
  it('accepts a complete payment', () => {
    expect(unsignedPaymentSchema.safeParse(VALID_PAYMENT).success).toBe(true);
  });

  it('accepts an XLM payment without an assetIssuer', () => {
    const { assetIssuer: _, ...xlm } = VALID_PAYMENT;
    expect(unsignedPaymentSchema.safeParse({ ...xlm, assetCode: 'XLM' }).success).toBe(true);
  });

  it('requires assetIssuer for non-XLM assets', () => {
    const { assetIssuer: _, ...withoutIssuer } = VALID_PAYMENT;
    const result = unsignedPaymentSchema.safeParse(withoutIssuer);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('assetIssuer'))).toBe(true);
    }
  });

  it('accepts a bare text memo', () => {
    expect(unsignedPaymentSchema.safeParse({ ...VALID_PAYMENT, memo: 'rent' }).success).toBe(true);
  });

  it('accepts a tagged none memo', () => {
    expect(
      unsignedPaymentSchema.safeParse({ ...VALID_PAYMENT, memo: { type: 'none' } }).success
    ).toBe(true);
  });

  it('accepts a tagged text memo', () => {
    expect(
      unsignedPaymentSchema.safeParse({ ...VALID_PAYMENT, memo: { type: 'text', value: 'hi' } })
        .success
    ).toBe(true);
  });

  it('accepts a tagged hash memo with 64 hex chars', () => {
    expect(
      unsignedPaymentSchema.safeParse({
        ...VALID_PAYMENT,
        memo: { type: 'hash', value: VALID_HASH },
      }).success
    ).toBe(true);
  });

  it('rejects a hash memo with 63 hex chars', () => {
    expect(
      unsignedPaymentSchema.safeParse({
        ...VALID_PAYMENT,
        memo: { type: 'hash', value: 'a'.repeat(63) },
      }).success
    ).toBe(false);
  });

  it('rejects a text memo exceeding 28 bytes', () => {
    expect(
      unsignedPaymentSchema.safeParse({ ...VALID_PAYMENT, memo: 'a'.repeat(29) }).success
    ).toBe(false);
  });

  it('rejects a zero amount', () => {
    expect(unsignedPaymentSchema.safeParse({ ...VALID_PAYMENT, amount: '0' }).success).toBe(false);
  });

  it('rejects an invalid sender key', () => {
    expect(
      unsignedPaymentSchema.safeParse({ ...VALID_PAYMENT, senderPublicKey: 'bad' }).success
    ).toBe(false);
  });
});

describe('submitTransactionSchema', () => {
  it('accepts a valid XDR string', () => {
    expect(submitTransactionSchema.safeParse({ xdr: 'AAAAAgAAAA==' }).success).toBe(true);
  });

  it('rejects an empty xdr', () => {
    expect(submitTransactionSchema.safeParse({ xdr: '' }).success).toBe(false);
  });

  it('requires xdr to be present', () => {
    expect(submitTransactionSchema.safeParse({}).success).toBe(false);
  });
});

describe('transactionHashSchema', () => {
  it('accepts a valid 64-char hex hash', () => {
    expect(transactionHashSchema.safeParse({ hash: VALID_HASH }).success).toBe(true);
  });

  it('rejects a hash that is too short', () => {
    expect(transactionHashSchema.safeParse({ hash: 'a'.repeat(63) }).success).toBe(false);
  });

  it('rejects a hash that is too long', () => {
    expect(transactionHashSchema.safeParse({ hash: 'a'.repeat(65) }).success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(transactionHashSchema.safeParse({ hash: 'g'.repeat(64) }).success).toBe(false);
  });
});

describe('communityTransactionsQuerySchema', () => {
  it('accepts an empty query', () => {
    expect(communityTransactionsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid from/to ISO dates', () => {
    expect(
      communityTransactionsQuerySchema.safeParse({
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-12-31T23:59:59.000Z',
      }).success
    ).toBe(true);
  });

  it('rejects when to is before from', () => {
    const result = communityTransactionsQuerySchema.safeParse({
      from: '2026-12-01T00:00:00.000Z',
      to: '2026-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('to'))).toBe(true);
    }
  });

  it('rejects a non-ISO from date', () => {
    expect(communityTransactionsQuerySchema.safeParse({ from: 'yesterday' }).success).toBe(false);
  });

  it('accepts a valid transaction type filter', () => {
    expect(
      communityTransactionsQuerySchema.safeParse({ type: 'payment_sent' }).success
    ).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(
      communityTransactionsQuerySchema.safeParse({ type: 'unknown_action' }).success
    ).toBe(false);
  });
});
