import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useAccountDetails } from '../useAccountDetails';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
});

/** Fresh SWR cache per test so responses never leak between cases. */
function wrapper({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>;
}

const PUBLIC_KEY = 'G' + 'A'.repeat(55);

describe('useAccountDetails', () => {
  it('fetches account details for the given public key', async () => {
    const payload = {
      id: PUBLIC_KEY,
      account_id: PUBLIC_KEY,
      balances: [{ asset_type: 'native', balance: '100.0000000' }],
      signers: [{ key: PUBLIC_KEY, weight: 1, type: 'ed25519_public_key' }],
      thresholds: { low_threshold: 1, med_threshold: 1, high_threshold: 1 },
    };
    fetchMock.mockResolvedValue(jsonResponse(200, { data: payload }));

    const { result } = renderHook(() => useAccountDetails(PUBLIC_KEY), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(payload));
    expect(String(fetchMock.mock.calls[0][0])).toContain(`/api/v1/accounts/${PUBLIC_KEY}`);
  });

  it('does not fetch when the public key is null', () => {
    renderHook(() => useAccountDetails(null), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces a failed request as an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { data: null, error: 'Account not found' }));

    const { result } = renderHook(() => useAccountDetails(PUBLIC_KEY), { wrapper });

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current.data).toBeUndefined();
  });
});
