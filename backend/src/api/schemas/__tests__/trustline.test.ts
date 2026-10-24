import { buildTrustlineSchema } from '../trustline';

const KEY = `G${'A'.repeat(55)}`;
const KEY2 = `G${'B'.repeat(55)}`;

const VALID = {
  accountPublicKey: KEY,
  assetCode: 'ECO',
  assetIssuer: KEY2,
};

describe('buildTrustlineSchema', () => {
  it('accepts a minimal trustline request', () => {
    expect(buildTrustlineSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts an optional positive limit', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, limit: '10000' }).success).toBe(true);
  });

  it('accepts a decimal limit with up to 7 places', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, limit: '1000.1234567' }).success).toBe(true);
  });

  it('rejects a zero limit', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, limit: '0' }).success).toBe(false);
  });

  it('rejects a negative limit', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, limit: '-100' }).success).toBe(false);
  });

  it('rejects an invalid accountPublicKey', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, accountPublicKey: 'bad' }).success).toBe(false);
  });

  it('rejects an invalid assetIssuer', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, assetIssuer: 'bad' }).success).toBe(false);
  });

  it('rejects an empty assetCode', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, assetCode: '' }).success).toBe(false);
  });

  it('rejects an assetCode longer than 12 characters', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, assetCode: 'TOOLONGCODE12' }).success).toBe(false);
  });

  it('rejects a non-alphanumeric assetCode', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, assetCode: 'ECO-1' }).success).toBe(false);
  });

  it('trims whitespace from accountPublicKey', () => {
    const result = buildTrustlineSchema.parse({ ...VALID, accountPublicKey: `  ${KEY}  ` });
    expect(result.accountPublicKey).toBe(KEY);
  });
});
