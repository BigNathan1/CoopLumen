import { stellarWebhookSchema, kycWebhookSchema } from '../webhook';

const KEY = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const UUID = '3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8';
const ISO_DATE = '2026-01-15T10:30:00.000Z';

const VALID_STELLAR = {
  eventId: 'evt-001',
  eventType: 'payment.received' as const,
  occurredAt: ISO_DATE,
  data: { amount: '100', asset: 'XLM' },
};

const VALID_KYC = {
  eventId: 'kyc-evt-001',
  provider: 'jumio',
  providerReference: 'ref-123',
  communityId: UUID,
  stellarAddress: KEY,
  status: 'verified' as const,
  occurredAt: ISO_DATE,
};

describe('stellarWebhookSchema', () => {
  it('accepts a complete valid payload', () => {
    expect(stellarWebhookSchema.safeParse(VALID_STELLAR).success).toBe(true);
  });

  it.each([
    'transaction.succeeded',
    'transaction.failed',
    'account.created',
    'trustline.created',
    'trustline.removed',
    'payment.received',
  ])('accepts eventType "%s"', (eventType) => {
    expect(stellarWebhookSchema.safeParse({ ...VALID_STELLAR, eventType }).success).toBe(true);
  });

  it('rejects an unknown eventType', () => {
    expect(
      stellarWebhookSchema.safeParse({ ...VALID_STELLAR, eventType: 'token.burned' }).success
    ).toBe(false);
  });

  it('rejects a missing eventId', () => {
    const { eventId: _, ...withoutId } = VALID_STELLAR;
    expect(stellarWebhookSchema.safeParse(withoutId).success).toBe(false);
  });

  it('rejects an empty eventId', () => {
    expect(stellarWebhookSchema.safeParse({ ...VALID_STELLAR, eventId: '' }).success).toBe(false);
  });

  it('rejects a non-ISO occurredAt', () => {
    expect(
      stellarWebhookSchema.safeParse({ ...VALID_STELLAR, occurredAt: 'yesterday' }).success
    ).toBe(false);
  });

  it('accepts an empty data object', () => {
    expect(stellarWebhookSchema.safeParse({ ...VALID_STELLAR, data: {} }).success).toBe(true);
  });
});

describe('kycWebhookSchema', () => {
  it('accepts a complete verified payload', () => {
    expect(kycWebhookSchema.safeParse(VALID_KYC).success).toBe(true);
  });

  it.each(['pending', 'submitted', 'verified', 'expired'])('accepts status "%s"', (status) => {
    expect(kycWebhookSchema.safeParse({ ...VALID_KYC, status }).success).toBe(true);
  });

  it('accepts rejected status when rejectionReason is provided', () => {
    expect(
      kycWebhookSchema.safeParse({
        ...VALID_KYC,
        status: 'rejected',
        rejectionReason: 'Document expired',
      }).success
    ).toBe(true);
  });

  it('requires rejectionReason when status is rejected', () => {
    const result = kycWebhookSchema.safeParse({ ...VALID_KYC, status: 'rejected' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('rejectionReason'))).toBe(true);
    }
  });

  it('rejects an invalid stellarAddress', () => {
    expect(kycWebhookSchema.safeParse({ ...VALID_KYC, stellarAddress: 'bad' }).success).toBe(false);
  });

  it('rejects a non-UUID communityId', () => {
    expect(kycWebhookSchema.safeParse({ ...VALID_KYC, communityId: 'bad' }).success).toBe(false);
  });

  it('rejects an empty eventId', () => {
    expect(kycWebhookSchema.safeParse({ ...VALID_KYC, eventId: '' }).success).toBe(false);
  });

  it('defaults metadata to an empty object', () => {
    const result = kycWebhookSchema.parse(VALID_KYC);
    expect(result.metadata).toEqual({});
  });

  it('accepts optional metadata', () => {
    expect(
      kycWebhookSchema.safeParse({ ...VALID_KYC, metadata: { sessionId: 'abc' } }).success
    ).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(kycWebhookSchema.safeParse({ ...VALID_KYC, status: 'approved' }).success).toBe(false);
  });

  it('rejects a rejectionReason longer than 1000 characters', () => {
    expect(
      kycWebhookSchema.safeParse({
        ...VALID_KYC,
        status: 'rejected',
        rejectionReason: 'r'.repeat(1001),
      }).success
    ).toBe(false);
  });
});
