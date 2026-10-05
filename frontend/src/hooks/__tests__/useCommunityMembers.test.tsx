import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useCommunityMembers } from '../useCommunityMembers';
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

describe('useCommunityMembers with global SWR config', () => {
  it('does not fetch when communityId is empty', () => {
    const { result } = renderHook(() => useCommunityMembers(''), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests the members endpoint without query params when no filters are given', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    const { result } = renderHook(() => useCommunityMembers('community-1'), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/api/v1/communities/community-1/members'
    );
  });

  it('encodes page, limit, and role as query parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    renderHook(
      () => useCommunityMembers('community-1', { page: 3, limit: 25, role: 'treasurer' }),
      { wrapper }
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/api/v1/communities/community-1/members');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('role')).toBe('treasurer');
  });

  it('omits parameters that are not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

    renderHook(() => useCommunityMembers('community-1', { role: 'admin' }), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('limit')).toBe(false);
    expect(url.searchParams.get('role')).toBe('admin');
  });

  it('resolves the unwrapped member list on a successful response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: [
          {
            stellar_address: 'G' + 'A'.repeat(55),
            role: 'member',
            joined_at: '2026-01-01T00:00:00Z',
          },
        ],
      })
    );

    const { result } = renderHook(() => useCommunityMembers('community-1'), { wrapper });
    await waitFor(() =>
      expect(result.current.data).toEqual([
        {
          stellar_address: 'G' + 'A'.repeat(55),
          role: 'member',
          joined_at: '2026-01-01T00:00:00Z',
        },
      ])
    );
  });

  it('rejects with the API error message on a failed response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: 'role must be one of: admin, treasurer, member, observer' })
    );

    const { result } = renderHook(() => useCommunityMembers('community-1'), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe(
      'role must be one of: admin, treasurer, member, observer'
    );
  });

  it('rejects with a fallback message when the error response is not valid JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    const { result } = renderHook(() => useCommunityMembers('community-1'), { wrapper });
    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error?.message).toBe('Request failed');
  });
});
