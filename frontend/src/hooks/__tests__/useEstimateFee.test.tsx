import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useEstimateFee } from '../useEstimateFee';

const wrapper = ({ children }: { children: React.ReactNode }) => (
   new Map(), dedupingInterval: 0 }}>
    {children}
  
);

describe('useEstimateFee', () => {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('pauses fetching if operations are undefined', () => {
    const { result } = renderHook(() => useEstimateFee(), { wrapper });
    
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.estimatedFee).toBeNull();
  });

  it('pauses fetching if operations array is empty', () => {
    const { result } = renderHook(() => useEstimateFee([]), { wrapper });
    
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.estimatedFee).toBeNull();
  });

  it('fetches the fee estimate when valid operations are provided', async () => {
    const operations = [{ type: 'payment', amount: '10' }];
    const mockData = { fee: '1000' };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockData }),
    });

    const { result } = renderHook(() => useEstimateFee(operations), { wrapper });

    await waitFor(() => {
      expect(result.current.estimatedFee).toEqual('1000');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/fees/estimate'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ operations }),
      })
    );
  });

  it('handles API errors gracefully', async () => {
    const operations = [{ type: 'payment', amount: '10' }];

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unable to calculate surge pricing' }),
    });

    const { result } = renderHook(() => useEstimateFee(operations), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error?.message).toBe('Unable to calculate surge pricing');
    expect(result.current.estimatedFee).toBeNull();
  });
});