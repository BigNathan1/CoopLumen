import { accountParamsSchema } from '../account';

const VALID_KEY = `G${'A'.repeat(55)}`;

describe('accountParamsSchema', () => {
  it('accepts a valid Stellar public key', () => {
    expect(accountParamsSchema.safeParse({ publicKey: VALID_KEY }).success).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    const result = accountParamsSchema.safeParse({ publicKey: `  ${VALID_KEY}  ` });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.publicKey).toBe(VALID_KEY);
  });

  it.each([
    ['empty string', ''],
    ['secret key', `S${'A'.repeat(55)}`],
    ['contract address', `C${'A'.repeat(55)}`],
    ['key too short', `G${'A'.repeat(54)}`],
    ['key too long', `G${'A'.repeat(56)}`],
    ['lowercase', `g${'a'.repeat(55)}`],
    ['invalid base32 digit', `G${'A'.repeat(54)}0`],
  ])('rejects %s', (_label, value) => {
    expect(accountParamsSchema.safeParse({ publicKey: value }).success).toBe(false);
  });

  it('reports a helpful message when the key is invalid', () => {
    const result = accountParamsSchema.safeParse({ publicKey: 'not-a-key' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = result.error.issues[0]?.message ?? '';
      expect(msg).toContain('Stellar public key');
    }
  });

  it('requires publicKey to be present', () => {
    expect(accountParamsSchema.safeParse({}).success).toBe(false);
  });
});
