import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useBalances } from '../useBalances';
import { swrConfig } from '@/lib/swr';

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
  <SWRConfig value={{ ...swrConfig, provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

describe('useBalances with global SWR config', () => {
  const publicKey = 'G' + 'A'.repeat(55);
  const communityId = '550e8400-e29b-41d4-a716-446655440000';

  it('does not fetch when publicKey is null', () => {
    const { result } = renderHook(() => useBalances(null), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests balances endpoint without query params when no filters are given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    const { result } = renderHook(() => useBalances(publicKey), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/api/v1/balances/' + publicKey);
  });

  it('includes communityId as query parameter when provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    renderHook(() => useBalances(publicKey, { communityId }), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/v1/balances/' + publicKey);
    expect(url.searchParams.get('communityId')).toBe(communityId);
  });

  it('resolves the unwrapped balance list on a successful response', async () => {
    const balances = [
      { asset_type: 'native', balance: '1000.0000000' },
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'ECO',
        asset_issuer: 'G' + 'B'.repeat(55),
        balance: '500.00',
      },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { data: balances }));

    const { result } = renderHook(() => useBalances(publicKey), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(balances));
  });

  it('rejects with the API error message on a failed response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Account not found' }));

    const { result } = renderHook(() => useBalances(publicKey), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Account not found');
  });
});
