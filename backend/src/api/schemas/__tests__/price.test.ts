import { getXlmPriceQuerySchema } from '../price';

describe('getXlmPriceQuerySchema', () => {
  it('defaults to USD when currency is omitted', () => {
    const result = getXlmPriceQuerySchema.parse({});
    expect(result.currency).toBe('USD');
  });

  it('accepts a 3-letter currency code', () => {
    const result = getXlmPriceQuerySchema.parse({ currency: 'EUR' });
    expect(result.currency).toBe('EUR');
  });

  it('accepts a 4-letter currency code', () => {
    const result = getXlmPriceQuerySchema.parse({ currency: 'USDT' });
    expect(result.currency).toBe('USDT');
  });

  it('normalises lowercase input to uppercase', () => {
    const result = getXlmPriceQuerySchema.parse({ currency: 'eur' });
    expect(result.currency).toBe('EUR');
  });

  it('rejects a 2-letter code', () => {
    expect(getXlmPriceQuerySchema.safeParse({ currency: 'US' }).success).toBe(false);
  });

  it('rejects a 5-letter code', () => {
    expect(getXlmPriceQuerySchema.safeParse({ currency: 'ABCDE' }).success).toBe(false);
  });

  it('rejects digits in the currency code', () => {
    expect(getXlmPriceQuerySchema.safeParse({ currency: 'US1' }).success).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    const result = getXlmPriceQuerySchema.parse({ currency: '  GBP  ' });
    expect(result.currency).toBe('GBP');
  });
});
