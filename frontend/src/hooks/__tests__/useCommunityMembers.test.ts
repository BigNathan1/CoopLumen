import { renderHook } from '@testing-library/react';

type CapturedCall = {
  key: string | null;
  fetcher: (url: string) => Promise<unknown>;
};

let lastCall: CapturedCall | undefined;

const swrMock = jest.fn((key: string | null, fetcher: (url: string) => Promise<unknown>) => {
  lastCall = { key, fetcher };
  return { data: undefined, error: undefined, isLoading: false, mutate: jest.fn() };
});

jest.mock('swr', () => ({
  __esModule: true,
  default: (...args: [string | null, (url: string) => Promise<unknown>]) => swrMock(...args),
}));

// Imported after the mock so the hook module picks up the mocked `swr`.
import { useCommunityMembers } from '../useCommunityMembers';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  swrMock.mockClear();
  fetchMock.mockReset();
  lastCall = undefined;
});

describe('useCommunityMembers', () => {
  it('does not fetch when communityId is empty', () => {
    renderHook(() => useCommunityMembers(''));
    expect(lastCall?.key).toBeNull();
  });

  it('requests the members endpoint without query params when no filters are given', () => {
    renderHook(() => useCommunityMembers('community-1'));
    expect(lastCall?.key).toBe('http://localhost:4000/api/v1/communities/community-1/members');
  });

  it('encodes page, limit, and role as query parameters', () => {
    renderHook(() => useCommunityMembers('community-1', { page: 3, limit: 25, role: 'treasurer' }));
    const url = new URL(lastCall?.key as string);
    expect(url.pathname).toBe('/api/v1/communities/community-1/members');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('role')).toBe('treasurer');
  });

  it('omits parameters that are not provided', () => {
    renderHook(() => useCommunityMembers('community-1', { role: 'admin' }));
    const url = new URL(lastCall?.key as string);
    expect(url.searchParams.has('page')).toBe(false);
    expect(url.searchParams.has('limit')).toBe(false);
    expect(url.searchParams.get('role')).toBe('admin');
  });

  it('resolves the unwrapped member list on a successful response', async () => {
    renderHook(() => useCommunityMembers('community-1'));
    const members = [
      { stellar_address: 'G' + 'A'.repeat(55), role: 'member', joined_at: '2026-01-01T00:00:00Z' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(200, { data: members }));

    await expect(
      lastCall?.fetcher('http://localhost:4000/api/v1/communities/community-1/members')
    ).resolves.toEqual(members);
  });

  it('rejects with the API error message on a failed response', async () => {
    renderHook(() => useCommunityMembers('community-1'));
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: 'role must be one of: admin, treasurer, member, observer' })
    );

    await expect(
      lastCall?.fetcher('http://localhost:4000/api/v1/communities/community-1/members')
    ).rejects.toThrow('role must be one of: admin, treasurer, member, observer');
  });

  it('rejects with a fallback message when the error response is not valid JSON', async () => {
    renderHook(() => useCommunityMembers('community-1'));
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(
      lastCall?.fetcher('http://localhost:4000/api/v1/communities/community-1/members')
    ).rejects.toThrow('Failed to fetch community members');
  });
});
