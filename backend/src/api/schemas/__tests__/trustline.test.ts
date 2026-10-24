import { buildTrustlineSchema } from '../trustline';

const KEY = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const KEY2 = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';

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
    expect(buildTrustlineSchema.safeParse({ ...VALID, accountPublicKey: 'bad' }).success).toBe(
      false
    );
  });

  it('rejects an invalid assetIssuer', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, assetIssuer: 'bad' }).success).toBe(false);
  });

  it('rejects an empty assetCode', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, assetCode: '' }).success).toBe(false);
  });

  it('rejects an assetCode longer than 12 characters', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, assetCode: 'TOOLONGCODE12' }).success).toBe(
      false
    );
  });

  it('rejects a non-alphanumeric assetCode', () => {
    expect(buildTrustlineSchema.safeParse({ ...VALID, assetCode: 'ECO-1' }).success).toBe(false);
  });

  it('trims whitespace from accountPublicKey', () => {
    const result = buildTrustlineSchema.parse({ ...VALID, accountPublicKey: `  ${KEY}  ` });
    expect(result.accountPublicKey).toBe(KEY);
  });
});
