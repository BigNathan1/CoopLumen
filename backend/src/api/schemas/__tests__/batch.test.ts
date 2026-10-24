import {
  batchPaymentEntrySchema,
  batchDisburseSchema,
  batchPreviewSchema,
  parseCsvSchema,
} from '../batch';

const VALID_KEY = `G${'A'.repeat(55)}`;
const VALID_SECRET = `S${'A'.repeat(55)}`;

const VALID_ENTRY = {
  destinationPublicKey: VALID_KEY,
  assetCode: 'ECO',
  assetIssuer: VALID_KEY,
  amount: '10',
};

describe('batchPaymentEntrySchema', () => {
  it('accepts a complete entry', () => {
    expect(batchPaymentEntrySchema.safeParse(VALID_ENTRY).success).toBe(true);
  });

  it('accepts an XLM entry without an assetIssuer', () => {
    const { assetIssuer: _, ...entry } = VALID_ENTRY;
    expect(batchPaymentEntrySchema.safeParse({ ...entry, assetCode: 'XLM' }).success).toBe(true);
  });

  it('requires assetIssuer for non-XLM assets', () => {
    const { assetIssuer: _, ...entry } = VALID_ENTRY;
    const result = batchPaymentEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issuerIssue = result.error.issues.find((i) => i.path.includes('assetIssuer'));
      expect(issuerIssue).toBeDefined();
    }
  });

  it('rejects an invalid assetIssuer even when present', () => {
    const result = batchPaymentEntrySchema.safeParse({ ...VALID_ENTRY, assetIssuer: 'bad' });
    expect(result.success).toBe(false);
  });

  it('rejects a zero amount', () => {
    expect(batchPaymentEntrySchema.safeParse({ ...VALID_ENTRY, amount: '0' }).success).toBe(false);
  });

  it('rejects a negative amount', () => {
    expect(batchPaymentEntrySchema.safeParse({ ...VALID_ENTRY, amount: '-5' }).success).toBe(
      false
    );
  });

  it('rejects an assetCode longer than 12 characters', () => {
    expect(
      batchPaymentEntrySchema.safeParse({ ...VALID_ENTRY, assetCode: 'TOOLONGCODE12' }).success
    ).toBe(false);
  });

  it('rejects a non-alphanumeric assetCode', () => {
    expect(
      batchPaymentEntrySchema.safeParse({ ...VALID_ENTRY, assetCode: 'ECO-1' }).success
    ).toBe(false);
  });

  it('rejects an invalid destination key', () => {
    expect(
      batchPaymentEntrySchema.safeParse({ ...VALID_ENTRY, destinationPublicKey: 'bad' }).success
    ).toBe(false);
  });
});

describe('batchDisburseSchema', () => {
  it('accepts a valid disbursement', () => {
    const result = batchDisburseSchema.safeParse({
      senderSecret: VALID_SECRET,
      payments: [VALID_ENTRY],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty payments array', () => {
    expect(
      batchDisburseSchema.safeParse({ senderSecret: VALID_SECRET, payments: [] }).success
    ).toBe(false);
  });

  it('rejects a payments array exceeding 100 entries', () => {
    const payments = Array.from({ length: 101 }, () => VALID_ENTRY);
    expect(batchDisburseSchema.safeParse({ senderSecret: VALID_SECRET, payments }).success).toBe(
      false
    );
  });

  it('accepts an optional memo within 28 bytes', () => {
    expect(
      batchDisburseSchema.safeParse({
        senderSecret: VALID_SECRET,
        payments: [VALID_ENTRY],
        memo: 'payment ref',
      }).success
    ).toBe(true);
  });

  it('rejects a memo exceeding 28 bytes', () => {
    expect(
      batchDisburseSchema.safeParse({
        senderSecret: VALID_SECRET,
        payments: [VALID_ENTRY],
        memo: 'a'.repeat(29),
      }).success
    ).toBe(false);
  });

  it('rejects an invalid sender secret', () => {
    expect(
      batchDisburseSchema.safeParse({ senderSecret: 'not-a-secret', payments: [VALID_ENTRY] })
        .success
    ).toBe(false);
  });
});

describe('batchPreviewSchema', () => {
  it('accepts a valid preview request', () => {
    expect(
      batchPreviewSchema.safeParse({ senderPublicKey: VALID_KEY, payments: [VALID_ENTRY] }).success
    ).toBe(true);
  });

  it('rejects an invalid sender public key', () => {
    expect(
      batchPreviewSchema.safeParse({ senderPublicKey: 'bad', payments: [VALID_ENTRY] }).success
    ).toBe(false);
  });

  it('rejects an empty payments array', () => {
    expect(
      batchPreviewSchema.safeParse({ senderPublicKey: VALID_KEY, payments: [] }).success
    ).toBe(false);
  });
});

describe('parseCsvSchema', () => {
  it('accepts csv content with default asset code', () => {
    expect(parseCsvSchema.safeParse({ csv: 'addr,10' }).success).toBe(true);
  });

  it('defaults to XLM when defaultAssetCode is omitted', () => {
    const result = parseCsvSchema.parse({ csv: 'data' });
    expect(result.defaultAssetCode).toBe('XLM');
  });

  it('accepts a custom defaultAssetCode', () => {
    expect(
      parseCsvSchema.safeParse({ csv: 'data', defaultAssetCode: 'ECO' }).success
    ).toBe(true);
  });

  it('accepts an optional defaultAssetIssuer', () => {
    expect(
      parseCsvSchema.safeParse({ csv: 'data', defaultAssetIssuer: VALID_KEY }).success
    ).toBe(true);
  });

  it('rejects an empty csv string', () => {
    expect(parseCsvSchema.safeParse({ csv: '' }).success).toBe(false);
  });

  it('rejects an invalid defaultAssetIssuer', () => {
    expect(
      parseCsvSchema.safeParse({ csv: 'data', defaultAssetIssuer: 'bad' }).success
    ).toBe(false);
  });
});
