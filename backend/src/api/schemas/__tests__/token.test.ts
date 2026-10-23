import {
  buildIssueTokenSchema,
  buildTrustlineTokenSchema,
  submitTokenXdrSchema,
  buildBurnTokenSchema,
  buildAirdropSchema,
  adminTokensQuerySchema,
} from '../token';

const KEY = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';
const KEY2 = 'GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U';
const UUID = '3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8';

describe('buildIssueTokenSchema', () => {
  const valid = {
    issuerPublicKey: KEY,
    assetCode: 'ECO',
    distributorPublicKey: KEY2,
    amount: '1000000',
  };

  it('accepts a minimal valid payload', () => {
    expect(buildIssueTokenSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an optional communityId UUID', () => {
    expect(buildIssueTokenSchema.safeParse({ ...valid, communityId: UUID }).success).toBe(true);
  });

  it('accepts an optional memo within 28 characters', () => {
    expect(buildIssueTokenSchema.safeParse({ ...valid, memo: 'initial supply' }).success).toBe(
      true
    );
  });

  it('rejects a memo longer than 28 characters', () => {
    expect(buildIssueTokenSchema.safeParse({ ...valid, memo: 'm'.repeat(29) }).success).toBe(false);
  });

  it('rejects an invalid issuerPublicKey', () => {
    expect(buildIssueTokenSchema.safeParse({ ...valid, issuerPublicKey: 'bad' }).success).toBe(
      false
    );
  });

  it('rejects a zero amount', () => {
    expect(buildIssueTokenSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false);
  });

  it('rejects a non-alphanumeric assetCode', () => {
    expect(buildIssueTokenSchema.safeParse({ ...valid, assetCode: 'EC-1' }).success).toBe(false);
  });
});

describe('buildTrustlineTokenSchema', () => {
  const valid = { accountPublicKey: KEY, assetCode: 'ECO', assetIssuer: KEY2 };

  it('accepts a minimal valid payload', () => {
    expect(buildTrustlineTokenSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an optional limit', () => {
    expect(buildTrustlineTokenSchema.safeParse({ ...valid, limit: '5000' }).success).toBe(true);
  });

  it('rejects a zero limit', () => {
    expect(buildTrustlineTokenSchema.safeParse({ ...valid, limit: '0' }).success).toBe(false);
  });

  it('rejects an invalid accountPublicKey', () => {
    expect(buildTrustlineTokenSchema.safeParse({ ...valid, accountPublicKey: 'bad' }).success).toBe(
      false
    );
  });
});

describe('submitTokenXdrSchema', () => {
  it('accepts a valid signedXdr', () => {
    expect(submitTokenXdrSchema.safeParse({ signedXdr: 'AAAAAgAAAA==' }).success).toBe(true);
  });

  it('rejects an empty signedXdr', () => {
    expect(submitTokenXdrSchema.safeParse({ signedXdr: '' }).success).toBe(false);
  });

  it('accepts an optional refreshSupply', () => {
    expect(
      submitTokenXdrSchema.safeParse({
        signedXdr: 'xdr',
        refreshSupply: { assetCode: 'ECO', assetIssuer: KEY },
      }).success
    ).toBe(true);
  });

  it('rejects refreshSupply with an invalid assetIssuer', () => {
    expect(
      submitTokenXdrSchema.safeParse({
        signedXdr: 'xdr',
        refreshSupply: { assetCode: 'ECO', assetIssuer: 'bad' },
      }).success
    ).toBe(false);
  });
});

describe('buildBurnTokenSchema', () => {
  const valid = { holderPublicKey: KEY, assetCode: 'ECO', assetIssuer: KEY2, amount: '100' };

  it('accepts a valid burn request', () => {
    expect(buildBurnTokenSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a zero amount', () => {
    expect(buildBurnTokenSchema.safeParse({ ...valid, amount: '0' }).success).toBe(false);
  });

  it('rejects an invalid holderPublicKey', () => {
    expect(buildBurnTokenSchema.safeParse({ ...valid, holderPublicKey: 'bad' }).success).toBe(
      false
    );
  });
});

describe('buildAirdropSchema', () => {
  const valid = { communityId: UUID, issuerPublicKey: KEY, amount: '10000' };

  it('accepts a valid airdrop request', () => {
    expect(buildAirdropSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an optional memo', () => {
    expect(buildAirdropSchema.safeParse({ ...valid, memo: 'airdrop' }).success).toBe(true);
  });

  it('rejects a memo longer than 28 characters', () => {
    expect(buildAirdropSchema.safeParse({ ...valid, memo: 'm'.repeat(29) }).success).toBe(false);
  });

  it('rejects a non-UUID communityId', () => {
    expect(buildAirdropSchema.safeParse({ ...valid, communityId: 'bad' }).success).toBe(false);
  });
});

describe('adminTokensQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    const result = adminTokensQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, limit: 20, sortBy: 'created_at', order: 'desc' });
  });

  it('coerces numeric strings', () => {
    const result = adminTokensQuerySchema.parse({ page: '2', limit: '50' });
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });

  it('rejects a limit above 100', () => {
    expect(adminTokensQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it.each(['created_at', 'name', 'asset_code', 'total_supply'])('accepts sortBy "%s"', (sortBy) => {
    expect(adminTokensQuerySchema.safeParse({ sortBy }).success).toBe(true);
  });

  it.each(['asc', 'desc'])('accepts order "%s"', (order) => {
    expect(adminTokensQuerySchema.safeParse({ order }).success).toBe(true);
  });

  it('rejects an unknown sortBy', () => {
    expect(adminTokensQuerySchema.safeParse({ sortBy: 'price' }).success).toBe(false);
  });
});
