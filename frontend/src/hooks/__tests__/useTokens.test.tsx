import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useCommunityTokens } from '../useTokens';

/** Minimal stand-in for a fetch Response (jsdom provides no global fetch). */
function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = jest.fn();

/** Fresh SWR cache per test so responses never leak between cases. */
function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
  );
}

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
});

const TOKEN = {
  id: 'token-1',
  community_id: 'community-1',
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  distributor_address: 'G' + 'B'.repeat(55),
  total_supply: '1000.0000000',
  name: 'Eco Credit',
  description: null,
  icon_url: null,
  decimals: 7,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('useCommunityTokens', () => {
  it('fetches tokens for the given community', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [TOKEN] }));

    const { result } = renderHook(() => useCommunityTokens('community-1'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([TOKEN]));
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/tokens/community-1');
  });

  it('does not fetch when communityId is missing', () => {
    renderHook(() => useCommunityTokens(null), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an error when the request fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { error: 'Community not found' }));

    const { result } = renderHook(() => useCommunityTokens('missing'), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect((result.current.error as Error).message).toBe('Community not found');
  });

  it('falls back to a generic error message when the body has no error field', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));

    const { result } = renderHook(() => useCommunityTokens('community-1'), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect((result.current.error as Error).message).toBe('Failed to fetch tokens');
  });
});
