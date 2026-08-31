import { z } from 'zod';
import {
  addMemberSchema,
  amountSchema,
  assetCodeSchema,
  buildTrustlineSchema,
  createCommunitySchema,
  createLoanSchema,
  listQuerySchema,
  memoSchema,
  parseWithFieldErrors,
  paymentSchema,
  setAvatarSchema,
  stellarPublicKeySchema,
  toFieldErrors,
  updateCommunitySchema,
  updateMemberSchema,
  uuidSchema,
} from '../schemas';

const ISSUER = `G${'A'.repeat(55)}`;
const RECIPIENT = `G${'B'.repeat(55)}`;
const COMMUNITY_ID = '3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8';

/** Returns the first message for a field, or undefined when the field passed. */
function messageFor(result: z.ZodSafeParseResult<unknown>, path: string): string | undefined {
  return result.success ? undefined : toFieldErrors(result.error)[path];
}

describe('stellarPublicKeySchema', () => {
  it('accepts a well-formed account address', () => {
    expect(stellarPublicKeySchema.parse(ISSUER)).toBe(ISSUER);
  });

  it('trims surrounding whitespace from a pasted address', () => {
    expect(stellarPublicKeySchema.parse(`  ${ISSUER}  `)).toBe(ISSUER);
  });

  it.each([
    ['an empty string', ''],
    ['a secret key pasted by mistake', `S${'A'.repeat(55)}`],
    ['a contract address', `C${'A'.repeat(55)}`],
    ['a key that is too short', `G${'A'.repeat(54)}`],
    ['a key that is too long', `G${'A'.repeat(56)}`],
    ['lowercase characters', `g${'a'.repeat(55)}`],
    ['characters outside the base32 alphabet', `G${'A'.repeat(54)}0`],
  ])('rejects %s', (_label, value) => {
    expect(stellarPublicKeySchema.safeParse(value).success).toBe(false);
  });
});

describe('assetCodeSchema', () => {
  it.each(['XLM', 'ECO', 'a', 'ABCDEFGHIJKL'])('accepts %s', (code) => {
    expect(assetCodeSchema.safeParse(code).success).toBe(true);
  });

  it.each([
    ['an empty code', ''],
    ['more than 12 characters', 'ABCDEFGHIJKLM'],
    ['a hyphen', 'ECO-2'],
    ['a space', 'ECO DAO'],
  ])('rejects %s', (_label, value) => {
    expect(assetCodeSchema.safeParse(value).success).toBe(false);
  });
});

describe('amountSchema', () => {
  it.each(['1', '0.5', '100.1234567', '9999999999.9999999'])('accepts %s', (value) => {
    expect(amountSchema.safeParse(value).success).toBe(true);
  });

  it('keeps the amount as a string so fixed-point precision survives', () => {
    expect(amountSchema.parse('9999999999.9999999')).toBe('9999999999.9999999');
  });

  it.each([
    ['zero', '0'],
    ['zero with decimals', '0.0'],
    ['a negative amount', '-1'],
    ['more than 7 decimal places', '1.12345678'],
    ['a non-numeric string', 'abc'],
    ['an empty string', ''],
    ['scientific notation', '1e5'],
  ])('rejects %s', (_label, value) => {
    expect(amountSchema.safeParse(value).success).toBe(false);
  });
});

describe('uuidSchema', () => {
  it('accepts a UUID', () => {
    expect(uuidSchema.safeParse(COMMUNITY_ID).success).toBe(true);
  });

  it('rejects an arbitrary string', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('memoSchema', () => {
  it('accepts a bare text memo', () => {
    expect(memoSchema.safeParse('rent for March').success).toBe(true);
  });

  it('accepts the tagged text, hash and none forms', () => {
    expect(memoSchema.safeParse({ type: 'none' }).success).toBe(true);
    expect(memoSchema.safeParse({ type: 'text', value: 'hello' }).success).toBe(true);
    expect(memoSchema.safeParse({ type: 'hash', value: 'a'.repeat(64) }).success).toBe(true);
  });

  it('measures the 28-byte text limit in bytes, not characters', () => {
    expect(memoSchema.safeParse('a'.repeat(28)).success).toBe(true);
    expect(memoSchema.safeParse('a'.repeat(29)).success).toBe(false);
    // 10 four-byte emoji are only 10 characters but 40 bytes.
    expect(memoSchema.safeParse('\u{1F600}'.repeat(10)).success).toBe(false);
  });

  it('rejects a hash memo that is not 64 hex characters', () => {
    expect(memoSchema.safeParse({ type: 'hash', value: 'a'.repeat(63) }).success).toBe(false);
    expect(memoSchema.safeParse({ type: 'hash', value: 'z'.repeat(64) }).success).toBe(false);
  });
});

describe('createCommunitySchema', () => {
  const valid = {
    name: 'EcoDAO',
    description: 'An eco-friendly community',
    issuerPublicKey: ISSUER,
    assetCode: 'ECO',
    assetIssuer: ISSUER,
  };

  it('accepts a complete payload', () => {
    expect(createCommunitySchema.parse(valid)).toEqual(valid);
  });

  it('treats description as optional', () => {
    const { description: _description, ...withoutDescription } = valid;
    expect(createCommunitySchema.safeParse(withoutDescription).success).toBe(true);
  });

  it('rejects a name shorter than 2 characters', () => {
    const result = createCommunitySchema.safeParse({ ...valid, name: 'E' });
    expect(messageFor(result, 'name')).toBe('Name must be at least 2 characters');
  });

  it('rejects a name longer than 64 characters', () => {
    const result = createCommunitySchema.safeParse({ ...valid, name: 'E'.repeat(65) });
    expect(messageFor(result, 'name')).toBe('Name must be 64 characters or fewer');
  });

  it('rejects a description longer than 500 characters', () => {
    const result = createCommunitySchema.safeParse({ ...valid, description: 'd'.repeat(501) });
    expect(messageFor(result, 'description')).toBeDefined();
  });

  it('reports the offending field for a bad issuer key', () => {
    const result = createCommunitySchema.safeParse({ ...valid, issuerPublicKey: 'nope' });
    expect(messageFor(result, 'issuerPublicKey')).toContain('Stellar public key');
  });

  it('reports every invalid field at once', () => {
    const result = createCommunitySchema.safeParse({
      name: '',
      issuerPublicKey: 'nope',
      assetCode: '',
      assetIssuer: 'nope',
    });

    expect(Object.keys(result.success ? {} : toFieldErrors(result.error)).sort()).toEqual([
      'assetCode',
      'assetIssuer',
      'issuerPublicKey',
      'name',
    ]);
  });
});

describe('updateCommunitySchema', () => {
  it('accepts a single changed field', () => {
    expect(updateCommunitySchema.safeParse({ name: 'EcoDAO' }).success).toBe(true);
  });

  it('accepts clearing the description', () => {
    expect(updateCommunitySchema.safeParse({ description: null }).success).toBe(true);
  });

  it('rejects an empty update instead of sending a no-op request', () => {
    const result = updateCommunitySchema.safeParse({});
    expect(messageFor(result, 'name')).toBe('Change at least one field before saving');
  });
});

describe('setAvatarSchema', () => {
  it('accepts an https URL', () => {
    expect(setAvatarSchema.safeParse({ avatarUrl: 'https://cdn.test/a.png' }).success).toBe(true);
  });

  it('rejects a non-URL', () => {
    expect(setAvatarSchema.safeParse({ avatarUrl: 'not a url' }).success).toBe(false);
  });

  it('rejects an insecure http URL', () => {
    const result = setAvatarSchema.safeParse({ avatarUrl: 'http://cdn.test/a.png' });
    expect(messageFor(result, 'avatarUrl')).toBe('Avatar URL must use https');
  });
});

describe('member schemas', () => {
  it('accepts an address with no role, letting the backend default it', () => {
    expect(addMemberSchema.safeParse({ stellarAddress: RECIPIENT }).success).toBe(true);
  });

  it.each(['admin', 'treasurer', 'member', 'observer'])('accepts the %s role', (role) => {
    expect(updateMemberSchema.safeParse({ role }).success).toBe(true);
  });

  it('rejects a role outside the enum', () => {
    expect(updateMemberSchema.safeParse({ role: 'owner' }).success).toBe(false);
  });
});

describe('buildTrustlineSchema', () => {
  const valid = { accountPublicKey: RECIPIENT, assetCode: 'ECO', assetIssuer: ISSUER };

  it('accepts a trustline without an explicit limit', () => {
    expect(buildTrustlineSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a positive limit', () => {
    expect(buildTrustlineSchema.safeParse({ ...valid, limit: '1000' }).success).toBe(true);
  });

  it('rejects a zero limit', () => {
    expect(buildTrustlineSchema.safeParse({ ...valid, limit: '0' }).success).toBe(false);
  });
});

describe('paymentSchema', () => {
  const valid = {
    senderPublicKey: ISSUER,
    destinationPublicKey: RECIPIENT,
    assetCode: 'ECO',
    assetIssuer: ISSUER,
    amount: '10.5',
  };

  it('accepts a complete payment', () => {
    expect(paymentSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an XLM payment without an issuer', () => {
    const { assetIssuer: _assetIssuer, ...withoutIssuer } = valid;
    expect(paymentSchema.safeParse({ ...withoutIssuer, assetCode: 'XLM' }).success).toBe(true);
  });

  it('requires an issuer for any other asset, reported on the issuer field', () => {
    const { assetIssuer: _assetIssuer, ...withoutIssuer } = valid;
    const result = paymentSchema.safeParse(withoutIssuer);
    expect(messageFor(result, 'assetIssuer')).toBe('Issuer is required for assets other than XLM');
  });

  it('accepts an optional memo', () => {
    expect(paymentSchema.safeParse({ ...valid, memo: 'March dues' }).success).toBe(true);
  });

  it('rejects an over-long memo', () => {
    expect(paymentSchema.safeParse({ ...valid, memo: 'm'.repeat(29) }).success).toBe(false);
  });
});

describe('createLoanSchema', () => {
  const valid = {
    communityId: COMMUNITY_ID,
    borrowerAddress: RECIPIENT,
    lenderAddress: ISSUER,
    amount: '250',
    assetCode: 'ECO',
    assetIssuer: ISSUER,
  };

  it('accepts a loan request', () => {
    expect(createLoanSchema.safeParse(valid).success).toBe(true);
  });

  it('coerces a due date string into a Date', () => {
    const result = createLoanSchema.parse({ ...valid, dueAt: '2026-01-01T00:00:00.000Z' });
    expect(result.dueAt).toBeInstanceOf(Date);
  });

  it('rejects a purpose longer than 280 characters', () => {
    const result = createLoanSchema.safeParse({ ...valid, purpose: 'p'.repeat(281) });
    expect(messageFor(result, 'purpose')).toBe('Purpose must be 280 characters or fewer');
  });

  it('rejects a non-UUID community id', () => {
    expect(createLoanSchema.safeParse({ ...valid, communityId: '1' }).success).toBe(false);
  });
});

describe('listQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    expect(listQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 20,
      search: '',
      sortBy: 'created_at',
      order: 'DESC',
    });
  });

  it('coerces numeric strings taken from the URL', () => {
    const parsed = listQuerySchema.parse({ page: '3', limit: '50' });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(50);
  });

  it('rejects a page below 1', () => {
    expect(listQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it('rejects a limit above 100', () => {
    expect(listQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('rejects an unknown sort column', () => {
    expect(listQuerySchema.safeParse({ sortBy: 'password' }).success).toBe(false);
  });
});

describe('toFieldErrors', () => {
  it('keys messages by dotted path', () => {
    const schema = z.object({ settings: z.object({ currency: z.string() }) });
    const result = schema.safeParse({ settings: { currency: 1 } });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(toFieldErrors(result.error))).toContain('settings.currency');
    }
  });

  it('keeps only the first message for a field', () => {
    const result = createCommunitySchema.safeParse({
      name: 'E',
      issuerPublicKey: ISSUER,
      assetCode: 'ECO',
      assetIssuer: ISSUER,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error).name).toBe('Name must be at least 2 characters');
    }
  });

  it('keys a form-level issue under the empty string', () => {
    const schema = z.object({ a: z.string() }).refine(() => false, { message: 'Form is invalid' });
    const result = schema.safeParse({ a: 'x' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error)['']).toBe('Form is invalid');
    }
  });
});

describe('parseWithFieldErrors', () => {
  it('returns the parsed data on success', () => {
    const result = parseWithFieldErrors(updateMemberSchema, { role: 'admin' });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ role: 'admin' });
  });

  it('returns a field error map on failure', () => {
    const result = parseWithFieldErrors(addMemberSchema, { stellarAddress: 'nope' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.stellarAddress).toContain('Stellar public key');
  });
});
