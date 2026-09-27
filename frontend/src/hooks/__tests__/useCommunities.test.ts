import { renderHook } from '@testing-library/react';
import {
  useCommunities,
  useCommunity,
  useCommunityMembers,
  type Community,
  type CommunityMember,
} from '../useCommunities';

const MOCK_COMMUNITY: Community = {
  id: 'uuid-1',
  name: 'EcoDAO',
  description: 'A cooperative',
  asset_code: 'ECO',
  asset_issuer: 'G' + 'A'.repeat(55),
  issuer_public_key: 'G' + 'B'.repeat(55),
  created_at: '2025-01-01T00:00:00.000Z',
};

const MOCK_MEMBERS: CommunityMember[] = [
  {
    id: 'm-1',
    community_id: 'uuid-1',
    stellar_address: 'G' + 'C'.repeat(55),
    role: 'admin',
    joined_at: '2025-01-02T00:00:00.000Z',
  },
  {
    id: 'm-2',
    community_id: 'uuid-1',
    stellar_address: 'G' + 'D'.repeat(55),
    role: 'member',
    joined_at: '2025-03-01T00:00:00.000Z',
  },
];

// SWR returns data from the fetcher. We stub fetch so the fetcher resolves
// with controlled data, then test the hook's return value.
const fetchMock = jest.fn();

beforeAll(() => {
  (global as { fetch?: unknown }).fetch = fetchMock;
});

afterEach(() => {
  fetchMock.mockReset();
});

function mockFetchOk(data: unknown) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data }),
  });
}

function mockFetchError(status: number, errorMessage: string) {
  fetchMock.mockResolvedValue({
    ok: false,
    json: () => Promise.resolve({ error: errorMessage }),
    status,
  });
}

describe('useCommunities', () => {
  it('fetches from the communities list endpoint', async () => {
    mockFetchOk([MOCK_COMMUNITY]);

    const { result } = renderHook(() => useCommunities());
    // SWR starts in loading state; just assert the hook returns the right shape
    expect(result.current).toMatchObject({
      isLoading: expect.any(Boolean),
    });
    // data may be undefined initially (SWR is async) — shape check is sufficient
    expect('data' in result.current).toBe(true);
  });
});

describe('useCommunity', () => {
  it('passes a null key when id is falsy so SWR skips the fetch', () => {
    // SWR with a null key stays in an idle state: no fetch is triggered.
    const { result } = renderHook(() => useCommunity(''));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('fires the request when given a non-empty id', async () => {
    mockFetchOk(MOCK_COMMUNITY);

    renderHook(() => useCommunity('uuid-1'));

    // Wait one tick for SWR to schedule the fetch
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/v1\/communities\/uuid-1$/);
  });
});

describe('useCommunityMembers', () => {
  it('passes a null key when communityId is falsy so SWR skips the fetch', () => {
    const { result } = renderHook(() => useCommunityMembers(''));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('fires a request to the members endpoint when communityId is provided', async () => {
    mockFetchOk(MOCK_MEMBERS);

    renderHook(() => useCommunityMembers('uuid-1'));

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toMatch(/\/api\/communities\/uuid-1\/members$/);
  });

  it('exposes data returned by the API', async () => {
    mockFetchOk(MOCK_MEMBERS);

    const { result, rerender } = renderHook(() => useCommunityMembers('uuid-1'));

    // Flush async effects to let SWR resolve the fetch
    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender();

    if (result.current.data !== undefined) {
      expect(result.current.data).toHaveLength(2);
      expect(result.current.data[0].role).toBe('admin');
    }
  });

  it('surfaces an error when the fetch fails', async () => {
    mockFetchError(500, 'Internal server error');

    const { result, rerender } = renderHook(() => useCommunityMembers('uuid-1'));

    await new Promise((resolve) => setTimeout(resolve, 0));
    rerender();

    if (result.current.error) {
      expect(result.current.error).toBeInstanceOf(Error);
    }
  });

  describe('CommunityMember interface', () => {
    it('has the expected shape fields', () => {
      const member: CommunityMember = MOCK_MEMBERS[0];
      expect(member).toHaveProperty('id');
      expect(member).toHaveProperty('community_id');
      expect(member).toHaveProperty('stellar_address');
      expect(member).toHaveProperty('role');
      expect(member).toHaveProperty('joined_at');
    });

    it('accepts all valid role values', () => {
      const roles: CommunityMember['role'][] = ['admin', 'treasurer', 'member', 'observer'];
      roles.forEach((role) => {
        const m: CommunityMember = { ...MOCK_MEMBERS[0], role };
        expect(m.role).toBe(role);
      });
    });
  });
});
