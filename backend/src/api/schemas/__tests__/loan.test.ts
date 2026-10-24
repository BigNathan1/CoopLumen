import {
  createLoanSchema,
  disburseLoanSchema,
  repayLoanSchema,
  defaultLoanSchema,
} from '../loan';

const KEY = `G${'A'.repeat(55)}`;
const KEY2 = `G${'B'.repeat(55)}`;
const UUID = '3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8';

const VALID_LOAN = {
  communityId: UUID,
  borrowerAddress: KEY2,
  lenderAddress: KEY,
  amount: '500',
  assetCode: 'ECO',
  assetIssuer: KEY,
};

describe('createLoanSchema', () => {
  it('accepts a complete loan request', () => {
    expect(createLoanSchema.safeParse(VALID_LOAN).success).toBe(true);
  });

  it('treats assetIssuer as optional', () => {
    const { assetIssuer: _, ...withoutIssuer } = VALID_LOAN;
    expect(createLoanSchema.safeParse(withoutIssuer).success).toBe(true);
  });

  it('coerces a due date string to a Date', () => {
    const result = createLoanSchema.parse({ ...VALID_LOAN, dueAt: '2030-01-01T00:00:00.000Z' });
    expect(result.dueAt).toBeInstanceOf(Date);
  });

  it('rejects a non-UUID communityId', () => {
    expect(createLoanSchema.safeParse({ ...VALID_LOAN, communityId: 'bad' }).success).toBe(false);
  });

  it('rejects an invalid borrowerAddress', () => {
    expect(createLoanSchema.safeParse({ ...VALID_LOAN, borrowerAddress: 'bad' }).success).toBe(false);
  });

  it('rejects an invalid lenderAddress', () => {
    expect(createLoanSchema.safeParse({ ...VALID_LOAN, lenderAddress: 'bad' }).success).toBe(false);
  });

  it('rejects a zero amount', () => {
    expect(createLoanSchema.safeParse({ ...VALID_LOAN, amount: '0' }).success).toBe(false);
  });

  it('rejects a purpose longer than 280 characters', () => {
    expect(createLoanSchema.safeParse({ ...VALID_LOAN, purpose: 'p'.repeat(281) }).success).toBe(false);
  });

  it('rejects an interestRate above 1000', () => {
    expect(createLoanSchema.safeParse({ ...VALID_LOAN, interestRate: 1001 }).success).toBe(false);
  });

  it('accepts a zero interestRate', () => {
    expect(createLoanSchema.safeParse({ ...VALID_LOAN, interestRate: 0 }).success).toBe(true);
  });

  it('rejects a negative amount', () => {
    expect(createLoanSchema.safeParse({ ...VALID_LOAN, amount: '-100' }).success).toBe(false);
  });
});

describe('disburseLoanSchema', () => {
  it('accepts an empty payload', () => {
    expect(disburseLoanSchema.safeParse({}).success).toBe(true);
  });

  it('accepts an optional stellarTxHash', () => {
    expect(disburseLoanSchema.safeParse({ stellarTxHash: 'abc123' }).success).toBe(true);
  });

  it('accepts an optional note', () => {
    expect(disburseLoanSchema.safeParse({ note: 'disbursed' }).success).toBe(true);
  });

  it('rejects a note longer than 280 characters', () => {
    expect(disburseLoanSchema.safeParse({ note: 'n'.repeat(281) }).success).toBe(false);
  });

  it('rejects a stellarTxHash longer than 128 characters', () => {
    expect(disburseLoanSchema.safeParse({ stellarTxHash: 'x'.repeat(129) }).success).toBe(false);
  });
});

describe('repayLoanSchema', () => {
  it('accepts a valid repayment', () => {
    expect(repayLoanSchema.safeParse({ amount: '250' }).success).toBe(true);
  });

  it('accepts an optional paymentId UUID', () => {
    expect(repayLoanSchema.safeParse({ amount: '250', paymentId: UUID }).success).toBe(true);
  });

  it('rejects a zero amount', () => {
    expect(repayLoanSchema.safeParse({ amount: '0' }).success).toBe(false);
  });

  it('rejects a non-UUID paymentId', () => {
    expect(repayLoanSchema.safeParse({ amount: '250', paymentId: 'not-uuid' }).success).toBe(false);
  });

  it('rejects a note longer than 280 characters', () => {
    expect(repayLoanSchema.safeParse({ amount: '250', note: 'n'.repeat(281) }).success).toBe(false);
  });
});

describe('defaultLoanSchema', () => {
  it('accepts an empty payload', () => {
    expect(defaultLoanSchema.safeParse({}).success).toBe(true);
  });

  it('accepts an optional note', () => {
    expect(defaultLoanSchema.safeParse({ note: 'borrower unresponsive' }).success).toBe(true);
  });

  it('rejects a note longer than 280 characters', () => {
    expect(defaultLoanSchema.safeParse({ note: 'n'.repeat(281) }).success).toBe(false);
  });
});
