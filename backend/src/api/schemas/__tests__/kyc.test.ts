import { kycStatusParamsSchema, initiateKycSchema } from '../kyc';

const KEY = `G${'A'.repeat(55)}`;
const UUID = '3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8';

describe('kycStatusParamsSchema', () => {
  it('accepts a valid Stellar address', () => {
    expect(kycStatusParamsSchema.safeParse({ address: KEY }).success).toBe(true);
  });

  it('trims whitespace before validating', () => {
    const result = kycStatusParamsSchema.safeParse({ address: `  ${KEY}  ` });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBe(KEY);
  });

  it('rejects an invalid address', () => {
    expect(kycStatusParamsSchema.safeParse({ address: 'bad' }).success).toBe(false);
  });

  it('rejects a missing address', () => {
    expect(kycStatusParamsSchema.safeParse({}).success).toBe(false);
  });
});

describe('initiateKycSchema', () => {
  const valid = { communityId: UUID, address: KEY };

  it('accepts a minimal payload', () => {
    expect(initiateKycSchema.safeParse(valid).success).toBe(true);
  });

  it('defaults provider to sep12', () => {
    const result = initiateKycSchema.parse(valid);
    expect(result.provider).toBe('sep12');
  });

  it('accepts a custom provider', () => {
    expect(initiateKycSchema.safeParse({ ...valid, provider: 'jumio' }).success).toBe(true);
  });

  it('rejects a non-UUID communityId', () => {
    expect(initiateKycSchema.safeParse({ ...valid, communityId: '123' }).success).toBe(false);
  });

  it('rejects an invalid address', () => {
    expect(initiateKycSchema.safeParse({ ...valid, address: 'bad' }).success).toBe(false);
  });

  it('rejects a provider exceeding 100 characters', () => {
    expect(initiateKycSchema.safeParse({ ...valid, provider: 'p'.repeat(101) }).success).toBe(false);
  });

  it('rejects an empty provider', () => {
    expect(initiateKycSchema.safeParse({ ...valid, provider: '' }).success).toBe(false);
  });
});
