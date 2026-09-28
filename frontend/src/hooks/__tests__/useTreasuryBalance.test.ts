import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useTreasuryBalance } from '../useTreasuryBalance';
import { swrConfig } from '../SWRProvider';

const fetchMock = jest.fn();

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={swrConfig}>{children}</SWRConfig>
);

describe('useTreasuryBalance with global SWR config', () => {
  const communityId = '550e8400-e29b-41d4-a716-446655440000';
  const issuerKey = 'G' + 'A'.repeat(55);

  it('does not fetch when communityId is null', () => {
    const { result } = renderHook(() => useTreasuryBalance(null), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch when communityId is undefined', () => {
    const { result } = renderHook(() => useTreasuryBalance(undefined), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the treasury endpoint for a valid communityId', async () => {
    const balances = [
      { asset_type: 'native', balance: '100.0000000' },
      { asset_type: 'credit_alphanum4', asset_code: 'COOP', asset_issuer: issuerKey, balance: '5000.00' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { account: issuerKey, balances } }));

    const { result } = renderHook(() => useTreasuryBalance(communityId), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(`http://localhost:4000/api/v1/communities/${communityId}/treasury`);
    expect(result.current.data).toEqual({ account: issuerKey, balances });
  });

  it('rejects with the API error message on a failed response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Community not found' }));

    const { result } = renderHook(() => useTreasuryBalance(communityId), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Community not found');
  });

  it('returns 500 error when Stellar service is unavailable', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'Horizon unavailable' }));

    const { result } = renderHook(() => useTreasuryBalance(communityId), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Horizon unavailable');
  });
});