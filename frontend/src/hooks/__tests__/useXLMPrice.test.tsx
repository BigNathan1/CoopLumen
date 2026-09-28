import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useXLMPrice, XLMPriceData } from '../useXLMPrice';

// Wrap tests in SWRConfig to clear cache between runs and disable deduping
const wrapper = ({ children }: { children: React.ReactNode }) => (
   new Map(), dedupingInterval: 0 }}>
    {children}
  
);

describe('useXLMPrice', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches the XLM price successfully', async () => {
    const mockData: XLMPriceData = {
      price: '0.1205',
      currency: 'USD',
      updated_at: '2026-09-28T12:00:00Z',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const { result } = renderHook(() => useXLMPrice(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/prices/xlm')
    );
  });

  it('handles API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Rate limit exceeded' }),
    });

    const { result } = renderHook(() => useXLMPrice(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error.message).toBe('Rate limit exceeded');
    expect(result.current.data).toBeUndefined();
  });
});