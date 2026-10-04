import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { api } from '@/lib/api';
import { toUsdEquivalent, useXlmPrice, type XlmPriceResult } from '../useXlmPrice';

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() },
  swrFetcher: (path: string) => jest.requireMock('@/lib/api').api.get(path),
}));

const getMock = api.get as jest.Mock;

// Fresh cache per test, and no deduping, so each test sees its own request.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

describe('useXlmPrice', () => {
  afterEach(() => getMock.mockReset());

  it('fetches the XLM price for the requested currency', async () => {
    const price: XlmPriceResult = {
      asset: 'XLM',
      currency: 'USD',
      pair: 'XLM/USD',
      price: '0.1205000',
      source: 'coingecko',
      timestamp: '2026-09-28T12:00:00Z',
    };
    getMock.mockResolvedValueOnce(price);

    const { result } = renderHook(() => useXlmPrice(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(price));
    expect(getMock).toHaveBeenCalledWith('/api/v1/prices/xlm?currency=USD');
  });

  it('surfaces API errors without data', async () => {
    getMock.mockRejectedValueOnce(new Error('Rate limit exceeded'));

    const { result } = renderHook(() => useXlmPrice(), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error.message).toBe('Rate limit exceeded');
    expect(result.current.data).toBeUndefined();
  });
});

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
