import { streamPaymentsQuerySchema } from '../stream';

const KEY = `G${'A'.repeat(55)}`;

describe('streamPaymentsQuerySchema', () => {
  it('accepts a valid public key with default cursor', () => {
    const result = streamPaymentsQuerySchema.parse({ publicKey: KEY });
    expect(result.cursor).toBe('now');
  });

  it('accepts a custom cursor', () => {
    const result = streamPaymentsQuerySchema.parse({ publicKey: KEY, cursor: '12345678' });
    expect(result.cursor).toBe('12345678');
  });

  it('trims whitespace from the public key', () => {
    const result = streamPaymentsQuerySchema.parse({ publicKey: `  ${KEY}  ` });
    expect(result.publicKey).toBe(KEY);
  });

  it('rejects an invalid public key', () => {
    expect(streamPaymentsQuerySchema.safeParse({ publicKey: 'bad' }).success).toBe(false);
  });

  it('requires publicKey to be present', () => {
    expect(streamPaymentsQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an empty cursor', () => {
    expect(streamPaymentsQuerySchema.safeParse({ publicKey: KEY, cursor: '' }).success).toBe(false);
  });

  it('rejects a cursor longer than 128 characters', () => {
    expect(
      streamPaymentsQuerySchema.safeParse({ publicKey: KEY, cursor: 'c'.repeat(129) }).success
    ).toBe(false);
  });
});
