import { toUsdEquivalent } from '../useXlmPrice';

describe('toUsdEquivalent', () => {
  it('converts a balance to a USD string using the XLM price', () => {
    // 100 XLM × $0.14 = $14.00
    const result = toUsdEquivalent('100.0000000', '0.1400000');
    expect(result).not.toBeNull();
    // Locale-formatted value — assert it contains "14" and a dollar sign
    expect(result).toMatch(/\$14/);
  });

  it('returns null when price is null', () => {
    expect(toUsdEquivalent('100.0000000', null)).toBeNull();
  });

  it('returns null when price is undefined', () => {
    expect(toUsdEquivalent('100.0000000', undefined)).toBeNull();
  });

  it('returns null when price is zero', () => {
    expect(toUsdEquivalent('100.0000000', '0.0000000')).toBeNull();
  });

  it('returns null when price is negative', () => {
    expect(toUsdEquivalent('100.0000000', '-0.1400000')).toBeNull();
  });

  it('returns null when balance is not a valid number', () => {
    expect(toUsdEquivalent('not-a-number', '0.1400000')).toBeNull();
  });

  it('returns null when price is not a valid number', () => {
    expect(toUsdEquivalent('100.0000000', 'not-a-number')).toBeNull();
  });

  it('handles zero balance and returns $0.00', () => {
    const result = toUsdEquivalent('0.0000000', '0.1400000');
    expect(result).not.toBeNull();
    expect(result).toMatch(/\$0/);
  });

  it('rounds to 2 decimal places', () => {
    // 1 XLM × $0.1234567 = $0.12 (rounded)
    const result = toUsdEquivalent('1.0000000', '0.1234567');
    expect(result).not.toBeNull();
    // Should be rounded to 2 decimal places — not 7
    expect(result).not.toContain('0.123456');
  });
});
