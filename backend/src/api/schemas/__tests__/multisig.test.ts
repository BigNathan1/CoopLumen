import {
  createMultiSigRequestSchema,
  approveMultiSigRequestSchema,
  rejectMultiSigRequestSchema,
  executeMultiSigRequestSchema,
  getMultiSigQuerySchema,
  MULTISIG_ACTIONS,
  MULTISIG_STATUSES,
} from '../multisig';

const VALID_CREATE = {
  action: 'payment' as const,
  title: 'Send funds to supplier',
  proposer_address: 'GPROPOSERPROPOSERPROPOSERPROPOSERPROPOSERPROPOSERPROXX',
};

describe('createMultiSigRequestSchema', () => {
  it('accepts a minimal valid request', () => {
    expect(createMultiSigRequestSchema.safeParse(VALID_CREATE).success).toBe(true);
  });

  it('defaults required_signatures to 2', () => {
    const result = createMultiSigRequestSchema.parse(VALID_CREATE);
    expect(result.required_signatures).toBe(2);
  });

  it('defaults payload to an empty object', () => {
    const result = createMultiSigRequestSchema.parse(VALID_CREATE);
    expect(result.payload).toEqual({});
  });

  it.each(MULTISIG_ACTIONS)('accepts action "%s"', (action) => {
    expect(createMultiSigRequestSchema.safeParse({ ...VALID_CREATE, action }).success).toBe(true);
  });

  it('rejects an unknown action', () => {
    expect(createMultiSigRequestSchema.safeParse({ ...VALID_CREATE, action: 'delete' }).success).toBe(false);
  });

  it('rejects an empty title', () => {
    expect(createMultiSigRequestSchema.safeParse({ ...VALID_CREATE, title: '' }).success).toBe(false);
  });

  it('rejects a title longer than 255 characters', () => {
    expect(createMultiSigRequestSchema.safeParse({ ...VALID_CREATE, title: 't'.repeat(256) }).success).toBe(false);
  });

  it('rejects required_signatures below 1', () => {
    expect(createMultiSigRequestSchema.safeParse({ ...VALID_CREATE, required_signatures: 0 }).success).toBe(false);
  });

  it('accepts optional nullable fields as null', () => {
    expect(
      createMultiSigRequestSchema.safeParse({
        ...VALID_CREATE,
        description: null,
        transaction_xdr: null,
        expires_at: null,
      }).success
    ).toBe(true);
  });
});

describe('approveMultiSigRequestSchema', () => {
  it('accepts an empty payload', () => {
    expect(approveMultiSigRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts optional fields', () => {
    expect(
      approveMultiSigRequestSchema.safeParse({ signed_xdr: 'xdr', signer_address: 'addr' }).success
    ).toBe(true);
  });

  it('accepts null values for optional fields', () => {
    expect(
      approveMultiSigRequestSchema.safeParse({ signed_xdr: null, signer_address: null }).success
    ).toBe(true);
  });
});

describe('rejectMultiSigRequestSchema', () => {
  it('accepts an empty payload', () => {
    expect(rejectMultiSigRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts an optional reason', () => {
    expect(rejectMultiSigRequestSchema.safeParse({ reason: 'budget exceeded' }).success).toBe(true);
  });

  it('rejects a reason longer than 500 characters', () => {
    expect(rejectMultiSigRequestSchema.safeParse({ reason: 'r'.repeat(501) }).success).toBe(false);
  });
});

describe('executeMultiSigRequestSchema', () => {
  it('accepts a valid stellar_tx_hash', () => {
    expect(executeMultiSigRequestSchema.safeParse({ stellar_tx_hash: 'abc123' }).success).toBe(true);
  });

  it('rejects an empty hash', () => {
    expect(executeMultiSigRequestSchema.safeParse({ stellar_tx_hash: '' }).success).toBe(false);
  });

  it('requires stellar_tx_hash', () => {
    expect(executeMultiSigRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('getMultiSigQuerySchema', () => {
  it('applies defaults', () => {
    const result = getMultiSigQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, limit: 20 });
  });

  it.each(MULTISIG_STATUSES)('accepts status "%s"', (status) => {
    expect(getMultiSigQuerySchema.safeParse({ status }).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(getMultiSigQuerySchema.safeParse({ status: 'unknown' }).success).toBe(false);
  });

  it('coerces page and limit from strings', () => {
    const result = getMultiSigQuerySchema.parse({ page: '3', limit: '50' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it('rejects a limit above 100', () => {
    expect(getMultiSigQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });
});
