import { MemoValidationError, buildMemo } from '../memo';

describe('buildMemo', () => {
  it.each([undefined, null])('returns undefined for %p', (input) => {
    expect(buildMemo(input)).toBeUndefined();
  });

  it('returns undefined for an empty string, matching the previous behaviour', () => {
    expect(buildMemo('')).toBeUndefined();
  });

  it('returns undefined for an explicit none memo', () => {
    expect(buildMemo({ type: 'none' })).toBeUndefined();
  });

  it('treats a bare string as a text memo', () => {
    const memo = buildMemo('community payout');

    expect(memo?.type).toBe('text');
    expect(memo?.value?.toString()).toBe('community payout');
  });

  it('builds a text memo from the tagged form', () => {
    const memo = buildMemo({ type: 'text', value: 'community payout' });

    expect(memo?.type).toBe('text');
    expect(memo?.value?.toString()).toBe('community payout');
  });

  it('accepts a text memo of exactly 28 bytes', () => {
    expect(buildMemo({ type: 'text', value: 'a'.repeat(28) })?.type).toBe('text');
  });

  it('rejects a text memo over 28 bytes', () => {
    expect(() => buildMemo('a'.repeat(29))).toThrow(
      'Text memo must be 28 bytes or fewer when UTF-8 encoded (got 29).'
    );
  });

  it('measures the 28-byte limit in bytes, not characters', () => {
    // Eight rocket emoji are 8 characters but 32 UTF-8 bytes.
    expect(() => buildMemo('\u{1F680}'.repeat(8))).toThrow(
      'Text memo must be 28 bytes or fewer when UTF-8 encoded (got 32).'
    );
    expect(buildMemo('\u{1F680}'.repeat(7))?.type).toBe('text');
  });

  it('builds a hash memo from 64 hex characters', () => {
    const hex = 'ab'.repeat(32);
    const memo = buildMemo({ type: 'hash', value: hex });

    expect(memo?.type).toBe('hash');
    expect((memo?.value as Buffer).toString('hex')).toBe(hex);
    expect(memo?.value as Buffer).toHaveLength(32);
  });

  it('accepts uppercase and surrounding whitespace in a hash memo', () => {
    const memo = buildMemo({ type: 'hash', value: `  ${'AB'.repeat(32)}  ` });

    expect((memo?.value as Buffer).toString('hex')).toBe('ab'.repeat(32));
  });

  it.each([
    ['ab'.repeat(31), 'too short'],
    ['ab'.repeat(33), 'too long'],
    ['zz'.repeat(32), 'not hexadecimal'],
    ['', 'empty'],
  ])('rejects a hash memo that is %s', (value) => {
    expect(() => buildMemo({ type: 'hash', value })).toThrow(
      'Hash memo must be exactly 64 hexadecimal characters (32 bytes).'
    );
  });

  it('rejects a non-string text memo value', () => {
    expect(() => buildMemo({ type: 'text', value: 42 as unknown as string })).toThrow(
      MemoValidationError
    );
  });

  it('rejects an unsupported memo type with a message naming the supported ones', () => {
    expect(() => buildMemo({ type: 'id', value: '1' } as unknown as { type: 'none' })).toThrow(
      'Unsupported memo type "id". Supported types are "text", "hash" and "none".'
    );
  });

  it('throws MemoValidationError rather than a bare Error', () => {
    expect(() => buildMemo('a'.repeat(29))).toThrow(MemoValidationError);
  });
});
