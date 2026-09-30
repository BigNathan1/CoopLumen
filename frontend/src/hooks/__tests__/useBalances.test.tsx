import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useBalances } from '../useBalances';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock as typeof fetch;
});

afterEach(() => {
  fetchMock.mockReset();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

const PUBLIC_KEY = 'G' + 'A'.repeat(55);

describe('useBalances', () => {
  it('fetches balances for the given public key', async () => {
    const payload = [{ asset_type: 'native', balance: '100.0000000' }];
    fetchMock.mockResolvedValue(jsonResponse(200, { data: payload }));

    const { result } = renderHook(() => useBalances(PUBLIC_KEY), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/v1/balances/${PUBLIC_KEY}`);
  });

  it('does not fetch when the public key is missing', () => {
    renderHook(() => useBalances(null), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed request as an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Account not found' }));

    const { result } = renderHook(() => useBalances(PUBLIC_KEY), { wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect((result.current.error as Error).message).toBe('Failed to fetch balances');
  });
});
