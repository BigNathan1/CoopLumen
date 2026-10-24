import { authChallengeSchema, authChallengeParamsSchema, authVerifySchema } from '../auth';

const VALID_KEY = 'GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR';

describe('authChallengeSchema', () => {
  it('accepts a valid Stellar address', () => {
    expect(authChallengeSchema.safeParse({ address: VALID_KEY }).success).toBe(true);
  });

  it('trims whitespace from the address', () => {
    const result = authChallengeSchema.safeParse({ address: `  ${VALID_KEY}  ` });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.address).toBe(VALID_KEY);
  });

  it('rejects an invalid address', () => {
    expect(authChallengeSchema.safeParse({ address: 'not-a-key' }).success).toBe(false);
  });

  it('rejects a missing address', () => {
    expect(authChallengeSchema.safeParse({}).success).toBe(false);
  });
});

describe('authChallengeParamsSchema', () => {
  it('accepts a valid public key', () => {
    expect(authChallengeParamsSchema.safeParse({ publicKey: VALID_KEY }).success).toBe(true);
  });

  it('rejects an invalid public key', () => {
    expect(authChallengeParamsSchema.safeParse({ publicKey: 'bad' }).success).toBe(false);
  });
});

describe('authVerifySchema', () => {
  const valid = {
    address: VALID_KEY,
    challenge: 'challenge-token',
    signature: 'sig',
  };

  it('accepts a complete payload', () => {
    expect(authVerifySchema.safeParse(valid).success).toBe(true);
  });

  it('trims whitespace from each string field', () => {
    const result = authVerifySchema.parse({
      address: `  ${VALID_KEY}  `,
      challenge: '  token  ',
      signature: '  sig  ',
    });
    expect(result.address).toBe(VALID_KEY);
    expect(result.challenge).toBe('token');
    expect(result.signature).toBe('sig');
  });

  it('rejects a challenge longer than 500 characters', () => {
    expect(authVerifySchema.safeParse({ ...valid, challenge: 'c'.repeat(501) }).success).toBe(
      false
    );
  });

  it('rejects a signature longer than 2000 characters', () => {
    expect(authVerifySchema.safeParse({ ...valid, signature: 's'.repeat(2001) }).success).toBe(
      false
    );
  });

  it('rejects an empty challenge', () => {
    expect(authVerifySchema.safeParse({ ...valid, challenge: '' }).success).toBe(false);
  });

  it('rejects an empty signature', () => {
    expect(authVerifySchema.safeParse({ ...valid, signature: '' }).success).toBe(false);
  });

  it('rejects an invalid address', () => {
    expect(authVerifySchema.safeParse({ ...valid, address: 'bad' }).success).toBe(false);
  });
});
